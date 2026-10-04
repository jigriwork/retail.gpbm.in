import "server-only";

import { indiaToday } from "@/lib/accounts/format";
import { createClient } from "@/lib/supabase/server";

// All figures come from SQL numeric (party_balances, party_ledger,
// voucher_open_amount); nothing here adds money up in JavaScript floats
// except display totals of already-rounded rupee amounts.

export type PartyBalance = {
  firm_id: string; party_id: string; ledger_balance: number; open_bills: number; due_now: number; overdue: number;
  due_unknown: number; sales_basis_open: number; advance: number; unadjusted_notes: number; cn_received: number; disputed: number;
};

export async function partyBalances(firmId: string | null, partyId?: string | null, asOf?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("party_balances", { p_as_of: asOf ?? null, p_firm: firmId, p_party: partyId ?? null });
  if (error) throw new Error("Balances could not be loaded. Please retry; totals are unavailable.");
  return (data ?? []) as PartyBalance[];
}

export async function partyNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.from("parties").select("id,legal_name").in("id", [...new Set(ids)].slice(0, 1000));
  return new Map((data ?? []).map((party) => [party.id, party.legal_name]));
}

/** Open bills (and opening balances owed) of one supplier in one firm, oldest due first. */
export async function openBills(firmId: string, partyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_vouchers", { p_firm: firmId, p_party: partyId, p_side: "credit" });
  if (error) throw new Error("Open bills could not be loaded. Please retry.");
  return (data ?? []).map((bill) => ({ ...bill, open: Number(bill.open_amount) }));
}

/** Unadjusted payments, notes and advances that can still be set against bills. */
export async function openCredits(firmId: string, partyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_vouchers", { p_firm: firmId, p_party: partyId, p_side: "debit" });
  if (error) throw new Error("Unadjusted entries could not be loaded. Please retry.");
  return (data ?? []).map((item) => ({ ...item, open: Number(item.open_amount) }));
}

export async function partyLedger(firmId: string, partyId: string, from: string, to: string, page: number, pageSize = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("party_ledger", { p_firm: firmId, p_from: from, p_limit: pageSize, p_offset: page * pageSize, p_party: partyId, p_to: to });
  if (error) throw new Error("The ledger could not be loaded. Please retry.");
  return data ?? [];
}

export async function listPurchases(page: number, status: string, pageSize = 25) {
  const supabase = await createClient();
  let query = supabase
    .from("purchase_invoices")
    .select("id,supplier_invoice_no,invoice_date,invoice_total,total_qty,status,due_date,settlement_basis,firm_id,store_id,party_id, parties(legal_name), stores(name), billing_firms(name)", { count: "exact" })
    .order("invoice_date", { ascending: false }).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, count } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
  return { purchases: data ?? [], total: count ?? 0, pageSize };
}

export async function getPurchase(id: string) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: lines }, { data: check }, { data: links }] = await Promise.all([
    supabase.from("purchase_invoices").select("*, parties(legal_name), stores(name), billing_firms(name)").eq("id", id).maybeSingle(),
    supabase.from("purchase_invoice_lines").select("*, brands(name)").eq("invoice_id", id).order("line_no").limit(2000),
    supabase.rpc("purchase_invoice_check", { p_id: id }),
    supabase.from("document_links").select("id,role, finance_documents(id,kind,title,file_name,doc_no,status)").eq("entity_type", "purchase_invoice").eq("entity_id", id),
  ]);
  return { invoice, lines: lines ?? [], check: (check ?? {}) as Record<string, number | boolean>, links: links ?? [] };
}

export async function linkableDocuments(storeId: string | null) {
  const supabase = await createClient();
  let query = supabase.from("finance_documents").select("id,kind,title,file_name,doc_no,doc_date").in("status", ["stored", "reviewed"]).order("created_at", { ascending: false }).limit(50);
  if (storeId) query = query.or(`store_id.eq.${storeId},store_id.is.null`);
  const { data } = await query;
  return data ?? [];
}

export async function getVoucher(id: string) {
  const supabase = await createClient();
  const [{ data: voucher }, { data: lines }, { data: outgoing }, { data: incoming }, { data: links }] = await Promise.all([
    supabase.from("vouchers").select("*, parties(legal_name), stores(name), billing_firms(name)").eq("id", id).maybeSingle(),
    supabase.from("voucher_lines").select("*, brands(name)").eq("voucher_id", id).order("line_no"),
    supabase.from("voucher_allocations").select("id,amount,allocated_at,released_at,release_reason,to_voucher_id").eq("from_voucher_id", id),
    supabase.from("voucher_allocations").select("id,amount,allocated_at,released_at,release_reason,from_voucher_id").eq("to_voucher_id", id),
    supabase.from("document_links").select("id, finance_documents(id,kind,title,file_name)").eq("entity_type", "voucher").eq("entity_id", id),
  ]);
  const otherIds = [...(outgoing ?? []).map((item) => item.to_voucher_id), ...(incoming ?? []).map((item) => item.from_voucher_id)];
  const { data: others } = otherIds.length ? await supabase.from("vouchers").select("id,voucher_no,voucher_type,voucher_date").in("id", otherIds) : { data: [] };
  const { data: open } = voucher ? await supabase.rpc("voucher_open_amount", { p_voucher: id }) : { data: null };
  const { data: invoice } = voucher?.voucher_type === "purchase"
    ? await supabase.from("purchase_invoices").select("id").eq("voucher_id", id).maybeSingle()
    : { data: null };
  return { voucher, lines: lines ?? [], outgoing: outgoing ?? [], incoming: incoming ?? [], links: links ?? [], others: new Map((others ?? []).map((item) => [item.id, item])), open: open === null ? null : Number(open), invoiceId: invoice?.id ?? null };
}

export async function dayBook(firmId: string | null, from: string, to: string, page: number, type: string, pageSize = 40) {
  const supabase = await createClient();
  let query = supabase
    .from("vouchers")
    .select("id,voucher_no,voucher_type,voucher_date,amount,supplier_side,status,reference_no,firm_id, parties(legal_name), billing_firms(name)", { count: "exact" })
    .gte("voucher_date", from).lte("voucher_date", to)
    .order("voucher_date", { ascending: false }).order("posted_at", { ascending: false });
  if (firmId) query = query.eq("firm_id", firmId);
  if (type) query = query.eq("voucher_type", type);
  const { data, count } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
  return { vouchers: data ?? [], total: count ?? 0, pageSize };
}

export async function listDisputes(partyId?: string) {
  const supabase = await createClient();
  let query = supabase.from("disputes").select("*, parties(legal_name), billing_firms(name)").order("created_at", { ascending: false }).limit(100);
  if (partyId) query = query.eq("party_id", partyId);
  const { data } = await query;
  return data ?? [];
}

export function monthRange(month?: string) {
  const today = indiaToday();
  const value = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [year, monthNumber] = value.split("-").map(Number);
  return { from: `${value}-01`, month: value, to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) };
}

export async function supplierDues(until: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("supplier_dues", { p_until: until });
  return data ?? [];
}

export async function gstr2bMatch(firmId: string, period: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gstr2b_reconcile", { p_firm: firmId, p_period: period });
  if (error) throw new Error("GST matching could not be loaded. Please retry.");
  return data ?? [];
}

export async function gstReturnDocuments() {
  const supabase = await createClient();
  const { data } = await supabase.from("finance_documents").select("id,file_name,created_at,status,firm_id")
    .eq("kind", "gst_return").in("status", ["stored", "reviewed"]).order("created_at", { ascending: false }).limit(24);
  return data ?? [];
}

export async function gstImportedPeriods(firmId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("gstr2b_lines").select("return_period").eq("firm_id", firmId).limit(5000);
  return [...new Set((data ?? []).map((row) => row.return_period))].sort((a, b) => `${b.slice(2)}${b.slice(0, 2)}`.localeCompare(`${a.slice(2)}${a.slice(0, 2)}`));
}
