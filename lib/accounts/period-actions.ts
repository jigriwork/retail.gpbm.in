"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFinanceSession, requireFinance } from "@/lib/accounts/access";
import { isoDateOrNull } from "@/lib/accounts/format";
import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export async function closeMonth(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("close"))) return { ok: false, message: "You cannot close months." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_period", { p_firm: text(formData, "firmId"), p_month: `${text(formData, "month", 7)}-01` });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/app/accounts/periods");
  return { ok: true, message: "Month closed. Corrections now go into an open month as reversals." };
}

export async function reopenMonth(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await getFinanceSession()).isOwner) return { ok: false, message: "Only an owner can reopen a month." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_period", { p_firm: text(formData, "firmId"), p_month: `${text(formData, "month", 7)}-01`, p_reason: text(formData, "reason", 500) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/app/accounts/periods");
  return { ok: true, message: "Month reopened; the reason is recorded." };
}

/**
 * Lines are pasted one per row as: date, document no, description, debit,
 * credit (comma or tab separated) — the supplier's view: debit = their bill.
 */
export async function saveStatement(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return { ok: false, message: "You cannot record statements." };
  const from = isoDateOrNull(text(formData, "from"));
  const to = isoDateOrNull(text(formData, "to"));
  const closing = Number(text(formData, "closing", 20).replace(/[,₹\s]/g, ""));
  const openingText = text(formData, "opening", 20).replace(/[,₹\s]/g, "");
  if (!from || !to || !Number.isFinite(closing) || !text(formData, "closing")) return { ok: false, message: "Enter the period and their closing balance." };
  const raw = typeof formData.get("lines") === "string" ? String(formData.get("lines")) : "";
  const lines = [];
  for (const [index, row] of raw.split(/\r?\n/).entries()) {
    if (!row.trim()) continue;
    const cells = row.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const [date, docNo, description, debit, credit] = cells;
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.test(date) ? date.replace(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/, (_, d, m, y) => `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`) : null;
    const amount = (value?: string) => (value ? Number(value.replace(/[,₹\s]/g, "")) : 0);
    if (!Number.isFinite(amount(debit)) || !Number.isFinite(amount(credit))) return { ok: false, message: `Line ${index + 1}: debit and credit must be numbers.` };
    lines.push({ credit: amount(credit), date: parsedDate, debit: amount(debit), description: description ?? null, doc_no: docNo ?? null });
  }
  if (lines.length > 2000) return { ok: false, message: "Up to 2,000 lines per statement." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_supplier_statement", {
    p_closing: closing, p_document: text(formData, "documentId") || null, p_firm: text(formData, "firmId"), p_from: from, p_lines: lines,
    p_notes: text(formData, "notes", 1000) || null, p_opening: openingText ? Number(openingText) : null, p_party: text(formData, "partyId"), p_to: to,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/app/accounts/statements");
  redirect(`/app/accounts/statements/${data}`);
}
