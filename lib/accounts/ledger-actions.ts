"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canPostFirmWide, requireFinance } from "@/lib/accounts/access";
import { financialYear, indiaToday, isoDateOrNull } from "@/lib/accounts/format";
import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { createClient } from "@/lib/supabase/server";

const denied: AccountsActionState = { ok: false, message: "You do not have permission to post accounts entries." };

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** Rupees with at most two decimals; "" = null, anything else invalid = NaN. */
function amount(formData: FormData, key: string) {
  const raw = text(formData, key, 20).replace(/[,₹\s]/g, "");
  if (!raw) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) return NaN;
  return Number(raw);
}

function quantity(formData: FormData, key: string) {
  const raw = text(formData, key, 20).replace(/[,\s]/g, "");
  if (!raw) return null;
  return /^\d+(\.\d{1,3})?$/.test(raw) ? Number(raw) : NaN;
}

function message(error: { message: string; code?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "23505") return "This supplier invoice number is already entered for this financial year. Open that purchase instead of adding it again.";
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) return "You do not have permission for this firm or store.";
  return error.message;
}

function refresh(...paths: string[]) {
  for (const path of ["/app/accounts", "/app/accounts/purchases", "/app/accounts/payments", "/app/accounts/notes", "/app/accounts/daybook", ...paths]) revalidatePath(path);
}

// ---------------------------------------------------------------- purchases

export async function savePurchaseDraft(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const id = text(formData, "invoiceId");
  const invoiceDate = isoDateOrNull(text(formData, "invoiceDate"));
  const storeId = text(formData, "storeId");
  const partyId = text(formData, "partyId");
  let firmId = text(formData, "firmId");
  const invoiceNo = text(formData, "supplierInvoiceNo", 80);
  if (!storeId || !partyId || !invoiceNo || !invoiceDate) return { ok: false, message: "Enter the supplier, receiving store, supplier invoice number and date." };
  const supabase = await createClient();
  if (!firmId) {
    const { data } = await supabase.rpc("store_firm_on", { p_date: invoiceDate, p_store: storeId });
    if (!data) return { ok: false, message: "This store's billing firm is not confirmed for that date. Choose the firm printed on the invoice (“Billed to”)." };
    firmId = data;
  }
  const fields = {
    cgst_amount: amount(formData, "cgst") ?? 0,
    discount_amount: amount(formData, "discount") ?? 0,
    freight_amount: amount(formData, "freight") ?? 0,
    igst_amount: amount(formData, "igst") ?? 0,
    invoice_total: amount(formData, "invoiceTotal") ?? 0,
    other_charges: amount(formData, "otherCharges") ?? 0,
    round_off: amount(formData, "roundOff") ?? 0,
    sgst_amount: amount(formData, "sgst") ?? 0,
    taxable_amount: amount(formData, "taxable") ?? 0,
  };
  if (Object.values(fields).some((value) => Number.isNaN(value))) return { ok: false, message: "Amounts must be rupees with up to two decimals, like 976985.60." };
  const qty = quantity(formData, "totalQty");
  if (Number.isNaN(qty)) return { ok: false, message: "Total quantity must be a number." };
  const dueText = text(formData, "dueDate");
  const dueDate = dueText ? isoDateOrNull(dueText) : null;
  if (dueText && !dueDate) return { ok: false, message: "Check the due date." };
  const values = {
    ...fields,
    due_date: dueDate,
    due_date_source: dueDate ? "manual" : null,
    financial_year: financialYear(invoiceDate),
    firm_id: firmId,
    invoice_date: invoiceDate,
    logic_purchase_ref: text(formData, "logicPurchaseRef", 40) || null,
    notes: text(formData, "notes", 1000) || null,
    party_id: partyId,
    received_date: isoDateOrNull(text(formData, "receivedDate")),
    store_id: storeId,
    supplier_invoice_no: invoiceNo,
    total_qty: qty,
  };
  if (id) {
    const { data, error } = await supabase.from("purchase_invoices").update(values).eq("id", id).eq("status", "draft").select("id");
    if (error) return { ok: false, message: message(error, "Could not save.") };
    if (!data?.length) return { ok: false, message: "Only draft purchases can be edited." };
    refresh(`/app/accounts/purchases/${id}`);
    return { ok: true, message: "Draft saved." };
  }
  const { data, error } = await supabase.from("purchase_invoices").insert({ ...values, created_by: session.profile.id }).select("id").single();
  if (error) return { ok: false, message: message(error, "Could not create the purchase.") };
  refresh();
  redirect(`/app/accounts/purchases/${data.id}`);
}

export async function addPurchaseLine(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const invoiceId = text(formData, "invoiceId");
  const qty = quantity(formData, "quantity");
  const values = {
    cgst_amount: amount(formData, "cgst") ?? 0,
    igst_amount: amount(formData, "igst") ?? 0,
    mrp: amount(formData, "mrp"),
    sgst_amount: amount(formData, "sgst") ?? 0,
    taxable_amount: amount(formData, "taxable"),
  };
  const rateText = text(formData, "unitRate", 20).replace(/[,₹\s]/g, "");
  const unitRate = rateText ? Number(rateText) : null;
  const gstText = text(formData, "gstRate", 6);
  const gstRate = gstText ? Number(gstText) : null;
  if (!invoiceId || !qty || Number.isNaN(qty)) return { ok: false, message: "Enter the quantity." };
  if (Object.values(values).some((value) => Number.isNaN(value)) || (unitRate !== null && !Number.isFinite(unitRate)) || (gstRate !== null && !(gstRate >= 0 && gstRate <= 40))) {
    return { ok: false, message: "Check the amounts and GST rate." };
  }
  const taxable = values.taxable_amount ?? (unitRate !== null ? Math.round(unitRate * qty * 100) / 100 : null);
  if (taxable === null) return { ok: false, message: "Enter the taxable amount, or the rate so it can be worked out." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("purchase_invoice_lines").select("line_no").eq("invoice_id", invoiceId).order("line_no", { ascending: false }).limit(1);
  const { error } = await supabase.from("purchase_invoice_lines").insert({
    ...values,
    article: text(formData, "article", 120) || null,
    barcode: text(formData, "barcode", 40) || null,
    brand_id: text(formData, "brandId") || null,
    colour: text(formData, "colour", 60) || null,
    description: text(formData, "description", 300) || null,
    gst_rate: gstRate,
    hsn_code: text(formData, "hsn", 12) || null,
    invoice_id: invoiceId,
    line_no: (last?.[0]?.line_no ?? 0) + 1,
    quantity: qty,
    size: text(formData, "size", 40) || null,
    taxable_amount: taxable,
    unit_rate: unitRate,
  });
  if (error) return { ok: false, message: message(error, "Could not add the line.") };
  refresh(`/app/accounts/purchases/${invoiceId}`);
  return { ok: true, message: "Line added." };
}

export async function removePurchaseLines(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const invoiceId = text(formData, "invoiceId");
  const lineId = text(formData, "lineId");
  const supabase = await createClient();
  const query = supabase.from("purchase_invoice_lines").delete().eq("invoice_id", invoiceId);
  const { error } = lineId ? await query.eq("id", lineId) : await query.gte("line_no", 0);
  if (error) return { ok: false, message: message(error, "Could not remove.") };
  refresh(`/app/accounts/purchases/${invoiceId}`);
  return { ok: true, message: lineId ? "Line removed." : "All lines removed." };
}

export async function postPurchase(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const invoiceId = text(formData, "invoiceId");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_purchase_invoice", { p_brand: text(formData, "brandId") || null, p_id: invoiceId });
  if (error) return { ok: false, message: message(error, "Could not post.") };
  refresh(`/app/accounts/purchases/${invoiceId}`);
  redirect(`/app/accounts/vouchers/${data}?posted=1`);
}

export async function cancelPurchaseDraft(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const invoiceId = text(formData, "invoiceId");
  const supabase = await createClient();
  const { data, error } = await supabase.from("purchase_invoices").update({ status: "cancelled" }).eq("id", invoiceId).eq("status", "draft").select("id");
  if (error) return { ok: false, message: message(error, "Could not cancel.") };
  if (!data?.length) return { ok: false, message: "Only drafts can be cancelled. Reverse a posted purchase instead." };
  refresh(`/app/accounts/purchases/${invoiceId}`);
  return { ok: true, message: "Draft cancelled. The invoice number can now be entered again." };
}

export async function linkDocument(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const entityType = text(formData, "entityType");
  const entityId = text(formData, "entityId");
  const documentId = text(formData, "documentId");
  if (!["purchase_invoice", "voucher", "dispute"].includes(entityType) || !entityId || !documentId) return { ok: false, message: "Choose the document." };
  const supabase = await createClient();
  const { error } = await supabase.from("document_links").insert({
    document_id: documentId, entity_id: entityId, entity_type: entityType, linked_by: session.profile.id,
    role: text(formData, "role") === "primary" ? "primary" : "supporting",
  });
  if (error) return { ok: false, message: error.code === "23505" ? "That document is already attached." : message(error, "Could not attach.") };
  refresh(entityType === "purchase_invoice" ? `/app/accounts/purchases/${entityId}` : `/app/accounts/vouchers/${entityId}`);
  return { ok: true, message: "Document attached." };
}

// ---------------------------------------------------------------- payments, refunds, notes, opening balances

/**
 * Allocation amounts come from fields named alloc_<voucherId>. With
 * "autoAllocate" ticked, the server fills the oldest open bills first.
 */
async function readAllocations(formData: FormData, total: number, firmId: string, partyId: string, side: "credit" | "debit", storeId: string | null) {
  const manual = [...formData.entries()]
    .filter(([key, entry]) => key.startsWith("alloc_") && typeof entry === "string" && entry.trim())
    .map(([key, entry]) => ({ amount: Number(String(entry).replace(/[,₹\s]/g, "")), voucher_id: key.slice(6) }));
  if (manual.some((item) => !Number.isFinite(item.amount) || item.amount < 0 || !/^\d+(\.\d{1,2})?$/.test(String(item.amount)))) {
    return { error: "Adjustment amounts must be rupees with up to two decimals." };
  }
  const chosen = manual.filter((item) => item.amount > 0);
  const sum = Math.round(chosen.reduce((acc, item) => acc + item.amount * 100, 0)) / 100;
  if (sum > total) return { error: "You are adjusting more than the entry amount." };
  if (chosen.length || formData.get("autoAllocate") !== "on") return { allocations: chosen };
  const supabase = await createClient();
  const { data } = await supabase.rpc("open_vouchers", { p_firm: firmId, p_party: partyId, p_side: side });
  let remaining = Math.round(total * 100);
  const allocations: Array<{ voucher_id: string; amount: number }> = [];
  for (const bill of (data ?? []).filter((item) => !storeId || item.store_id === storeId)) {
    if (remaining <= 0) break;
    const open = Math.round(Number(bill.open_amount) * 100);
    const take = Math.min(open, remaining);
    if (take > 0) allocations.push({ amount: take / 100, voucher_id: bill.id });
    remaining -= take;
  }
  return { allocations };
}

export async function recordSupplierEntry(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const type = text(formData, "type");
  if (!["payment", "receipt", "credit_note", "debit_note", "opening"].includes(type)) return { ok: false, message: "Choose the kind of entry." };
  const firmId = text(formData, "firmId");
  const partyId = text(formData, "partyId");
  const date = isoDateOrNull(text(formData, "date"));
  const total = amount(formData, "amount");
  if (!firmId || !partyId || !date) return { ok: false, message: "Choose the firm, supplier and date." };
  if (total === null || Number.isNaN(total) || total <= 0) return { ok: false, message: "Enter the amount in rupees, like 25000 or 25000.50." };
  if (date > indiaToday()) return { ok: false, message: "The date cannot be in the future." };
  const taxable = amount(formData, "taxable");
  const cgst = amount(formData, "cgst");
  const sgst = amount(formData, "sgst");
  const igst = amount(formData, "igst");
  if ([taxable, cgst, sgst, igst].some((value) => Number.isNaN(value))) return { ok: false, message: "Check the tax amounts." };
  const storeId = ["payment", "credit_note", "debit_note"].includes(type) ? text(formData, "storeId") || null : null;
  // Firm-wide entries need a grant without a store limit. A store-scoped
  // accountant posts for their store, set in full against its bills (the
  // database enforces the same rules).
  if (!storeId && !canPostFirmWide(session, firmId)) {
    return { ok: false, message: "Your access is limited to a store: choose the store and set the full amount against its bills. Advances and firm-wide entries need firm-wide permission." };
  }
  const side = type === "receipt" || (type === "opening" && text(formData, "mode") === "payable") ? "credit" : "debit";
  const parsed = type === "opening" && side === "credit" ? { allocations: [] } : await readAllocations(formData, total, firmId, partyId, side === "debit" ? "credit" : "debit", storeId);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? "Check the adjustments." };
  if (storeId && type === "payment" && Math.round(parsed.allocations.reduce((sum, item) => sum + item.amount * 100, 0)) !== Math.round(total * 100)) {
    return { ok: false, message: "A store payment must be set in full against that store's open bills. Adjust the amounts, or leave the store empty for a firm-wide entry." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_supplier_voucher", {
    p_allocations: parsed.allocations,
    p_amount: total,
    p_cgst: cgst,
    p_date: date,
    p_due_date: isoDateOrNull(text(formData, "dueDate")),
    p_firm: firmId,
    p_igst: igst,
    p_mode: text(formData, "mode") || null,
    p_narration: text(formData, "narration", 1000) || null,
    p_party: partyId,
    p_reason: text(formData, "reason") || null,
    p_reference: text(formData, "reference", 80) || null,
    p_reference_date: isoDateOrNull(text(formData, "referenceDate")),
    p_sgst: sgst,
    p_store: storeId,
    p_taxable: taxable,
    p_type: type,
  });
  if (error) return { ok: false, message: message(error, "Could not post.") };
  const documentId = text(formData, "documentId");
  if (documentId) {
    await supabase.from("document_links").insert({ document_id: documentId, entity_id: data, entity_type: "voucher", linked_by: session.profile.id, role: "primary" });
  }
  refresh(`/app/accounts/parties/${partyId}`);
  redirect(`/app/accounts/vouchers/${data}?posted=1`);
}

export async function allocateEntry(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const total = amount(formData, "amount");
  if (total === null || Number.isNaN(total) || total <= 0) return { ok: false, message: "Enter the amount to adjust." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("allocate_voucher", { p_amount: total, p_from: text(formData, "fromId"), p_to: text(formData, "toId") });
  if (error) return { ok: false, message: message(error, "Could not adjust.") };
  refresh(`/app/accounts/vouchers/${text(formData, "fromId")}`, `/app/accounts/vouchers/${text(formData, "toId")}`);
  return { ok: true, message: "Adjusted." };
}

export async function releaseAllocation(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_allocation", { p_id: text(formData, "allocationId"), p_reason: text(formData, "reason", 500) });
  if (error) return { ok: false, message: message(error, "Could not undo.") };
  refresh(`/app/accounts/vouchers/${text(formData, "voucherId")}`);
  return { ok: true, message: "Adjustment undone; both entries are open again." };
}

export async function reverseEntry(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const voucherId = text(formData, "voucherId");
  const date = isoDateOrNull(text(formData, "date"));
  if (!date) return { ok: false, message: "Choose the reversal date." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_voucher", { p_date: date, p_id: voucherId, p_reason: text(formData, "reason", 500) });
  if (error) return { ok: false, message: message(error, "Could not reverse.") };
  refresh(`/app/accounts/vouchers/${voucherId}`);
  redirect(`/app/accounts/vouchers/${data}?posted=1`);
}

// ---------------------------------------------------------------- disputes

export async function saveDispute(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const id = text(formData, "disputeId");
  const supabase = await createClient();
  if (id) {
    const status = text(formData, "status");
    if (!["open", "resolved", "withdrawn"].includes(status)) return { ok: false, message: "Choose the status." };
    const resolution = text(formData, "resolution", 2000);
    if (status !== "open" && resolution.length < 3) return { ok: false, message: "Write how it was resolved." };
    const { error } = await supabase.from("disputes").update({
      resolution: resolution || null, resolved_at: status === "open" ? null : new Date().toISOString(),
      resolved_by: status === "open" ? null : session.profile.id, status,
    }).eq("id", id);
    if (error) return { ok: false, message: message(error, "Could not save.") };
    refresh("/app/accounts/reconciliation");
    return { ok: true, message: "Dispute updated." };
  }
  const total = amount(formData, "amount");
  const title = text(formData, "title");
  if (!total || Number.isNaN(total) || total <= 0 || title.length < 3) return { ok: false, message: "Enter what is disputed and the amount." };
  const { error } = await supabase.from("disputes").insert({
    amount: total, created_by: session.profile.id, details: text(formData, "details", 2000) || null,
    firm_id: text(formData, "firmId"), party_id: text(formData, "partyId"), store_id: text(formData, "storeId") || null,
    title, voucher_id: text(formData, "voucherId") || null,
  });
  if (error) return { ok: false, message: message(error, "Could not record the dispute.") };
  refresh("/app/accounts/reconciliation", `/app/accounts/parties/${text(formData, "partyId")}`);
  return { ok: true, message: "Dispute recorded. It shows under Difference to resolve until settled." };
}
