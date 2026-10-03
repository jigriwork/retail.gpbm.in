"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireFinance } from "@/lib/accounts/access";
import { indiaToday, isoDateOrNull } from "@/lib/accounts/format";
import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const denied: AccountsActionState = { ok: false, message: "You do not have permission to change stock attribution or returns." };

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function rupees(formData: FormData, key: string) {
  const raw = text(formData, key, 20).replace(/[,₹\s]/g, "");
  if (!raw) return null;
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
}

function refresh(...paths: string[]) {
  for (const path of ["/app/accounts", "/app/accounts/stock", "/app/accounts/returns", "/app/accounts/transfers", ...paths]) revalidatePath(path);
}

const clean = (error: { message: string } | null, fallback: string) => (error ? error.message.replace(/^.*?ERROR:\s*/, "") : fallback);

export async function runAttribution(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const storeId = text(formData, "storeId");
  const from = isoDateOrNull(text(formData, "from"));
  const to = isoDateOrNull(text(formData, "to"));
  if (!storeId || !from || !to) return { ok: false, message: "Choose the store and dates." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("allocate_store_sales", { p_from: from, p_store: storeId, p_to: to });
  if (error) return { ok: false, message: clean(error, "Could not attribute.") };
  const result = data as { allocated: number; unresolved: number; customer_returns: number; stale_reversed: number };
  refresh();
  return {
    ok: true,
    message: `${result.allocated} pieces attributed, ${result.customer_returns} customer returns put back, ${result.unresolved} pieces unresolved${result.stale_reversed ? `, ${result.stale_reversed} from replaced reports redone` : ""}.`,
  };
}

export async function attributeManually(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const supabase = await createClient();
  const { error } = await supabase.rpc("allocate_sales_line_manually", {
    p_allocation: text(formData, "allocationId"), p_batch: text(formData, "batchId"), p_note: text(formData, "note", 500),
  });
  if (error) return { ok: false, message: clean(error, "Could not attribute.") };
  refresh();
  return { ok: true, message: "Attributed by hand; the reason is kept." };
}

export async function createOpeningStock(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const asOf = isoDateOrNull(text(formData, "asOf"));
  if (!asOf) return { ok: false, message: "Choose the stock date (the day the report was taken)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_opening_batches", { p_as_of: asOf, p_report: text(formData, "reportId") });
  if (error) return { ok: false, message: clean(error, "Could not create opening stock.") };
  refresh();
  return { ok: true, message: `${data} opening lots created. Map each brand to its supplier below.` };
}

export async function attributeBrand(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attribute_batches", {
    p_brand: text(formData, "brandId") || null, p_note: text(formData, "note", 500), p_party: text(formData, "partyId"), p_store: text(formData, "storeId"),
  });
  if (error) return { ok: false, message: clean(error, "Could not attribute.") };
  refresh();
  return { ok: true, message: `${data} lots attributed.` };
}

// ---------------------------------------------------------------- returns

export async function createReturn(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const date = isoDateOrNull(text(formData, "date"));
  if (!date || date > indiaToday()) return { ok: false, message: "Choose the request date." };
  const lines: Array<{ [key: string]: Json }> = [];
  for (const [key, entry] of formData.entries()) {
    if (!key.startsWith("qty_") || typeof entry !== "string" || !entry.trim()) continue;
    const qty = Number(entry);
    if (!(qty > 0)) return { ok: false, message: "Quantities must be above zero." };
    lines.push({ batch_id: key.slice(4), qty });
  }
  const manualQty = Number(text(formData, "manualQty"));
  if (text(formData, "manualQty")) {
    const value = rupees(formData, "manualValue");
    if (!(manualQty > 0) || value === null || Number.isNaN(value)) return { ok: false, message: "Enter quantity and value per piece for the extra item." };
    lines.push({ article: text(formData, "manualArticle") || null, barcode: text(formData, "manualBarcode") || null, lot_code: text(formData, "manualLot") || null, qty: manualQty, unit_value: value });
  }
  if (!lines.length) return { ok: false, message: "Choose the items and quantities being returned." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_supplier_return", {
    p_date: date, p_deduct_on: text(formData, "deductOn") || "acknowledgement", p_firm: text(formData, "firmId"), p_lines: lines,
    p_notes: text(formData, "notes", 2000) || null, p_party: text(formData, "partyId"), p_store: text(formData, "storeId"),
  });
  if (error) return { ok: false, message: clean(error, "Could not create the return.") };
  refresh();
  redirect(`/app/accounts/returns/${data}`);
}

export async function advanceReturn(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const id = text(formData, "returnId");
  const action = text(formData, "action");
  const date = isoDateOrNull(text(formData, "date"));
  if (!date || date > indiaToday()) return { ok: false, message: "Choose the date." };
  const amount = rupees(formData, "amount");
  const taxes = ["cgst", "sgst", "igst"].map((key) => rupees(formData, key));
  if ([amount, ...taxes].some((value) => Number.isNaN(value))) return { ok: false, message: "Check the amounts." };
  const lines = [...formData.entries()]
    .filter(([key, entry]) => key.startsWith("accepted_") && typeof entry === "string" && entry.trim())
    .map(([key, entry]) => ({ accepted_qty: Number(entry), id: key.slice(9) }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_supplier_return", {
    p_action: action, p_amount: amount, p_cgst: taxes[0], p_date: date, p_id: id, p_igst: taxes[2], p_lines: lines.length ? lines : null,
    p_ref: text(formData, "ref", 120) || null, p_sgst: taxes[1],
  });
  if (error) return { ok: false, message: clean(error, "Could not update the return.") };
  refresh(`/app/accounts/returns/${id}`);
  return { ok: true, message: "Return updated." };
}

// ---------------------------------------------------------------- transfers

export async function recordDistributorTransfer(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("approve"))) return { ok: false, message: "Only the owner or an approver can record a distributor takeover." };
  const date = isoDateOrNull(text(formData, "date"));
  const amount = rupees(formData, "amount") ?? 0;
  if (!date || Number.isNaN(amount)) return { ok: false, message: "Choose the date and check the amount." };
  const batches = formData.getAll("batchIds").filter((entry): entry is string => typeof entry === "string" && Boolean(entry));
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_distributor_transfer", {
    p_amount: amount, p_batches: batches.length ? batches : null, p_date: date, p_document: text(formData, "documentId"),
    p_firm: text(formData, "firmId"), p_from: text(formData, "fromPartyId"), p_narration: text(formData, "narration", 1000), p_to: text(formData, "toPartyId"),
  });
  if (error) return { ok: false, message: clean(error, "Could not record the takeover.") };
  refresh("/app/accounts/parties");
  return { ok: true, message: "Takeover recorded with its document. Earlier sales stay with the old supplier." };
}

export async function transferBetweenStores(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const date = isoDateOrNull(text(formData, "date"));
  if (!date) return { ok: false, message: "Choose the date." };
  const items = [...formData.entries()]
    .filter(([key, entry]) => key.startsWith("move_") && typeof entry === "string" && Number(entry) > 0)
    .map(([key, entry]) => ({ batch_id: key.slice(5), qty: Number(entry) }));
  if (!items.length) return { ok: false, message: "Enter quantities to move." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_stock_between_stores", {
    p_date: date, p_document: text(formData, "documentId") || null, p_items: items, p_note: text(formData, "note", 500) || null, p_to_store: text(formData, "toStoreId"),
  });
  if (error) return { ok: false, message: clean(error, "Could not move stock.") };
  refresh();
  return { ok: true, message: `${data} lot${data === 1 ? "" : "s"} moved.` };
}
