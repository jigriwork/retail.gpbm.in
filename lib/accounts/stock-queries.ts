import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function attributionSummary(storeId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attribution_summary", { p_from: from, p_store: storeId, p_to: to });
  if (error) throw new Error("Attribution could not be loaded. Please retry.");
  return data ?? [];
}

export async function unresolvedLines(storeId: string, from: string, to: string, limit = 100) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_allocations")
    .select("id,sale_date,qty,note,sales_row_id, sales_rows(bill_no,item_name,lot_code,mrp,brand)")
    .eq("store_id", storeId).eq("status", "active").eq("method", "unresolved")
    .gte("sale_date", from).lte("sale_date", to)
    .order("sale_date").limit(limit);
  return data ?? [];
}

/** Active batches with stock left, filtered by supplier/lot/barcode text. One bounded query. */
export async function findBatches(filters: { storeId?: string; partyId?: string; search?: string; unattributed?: boolean; limit?: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("batches_with_remaining", {
    p_limit: filters.limit ?? 60, p_party: filters.partyId ?? null, p_search: filters.search ?? null,
    p_store: filters.storeId ?? null, p_unattributed: filters.unattributed ?? false,
  });
  if (error) throw new Error("Stock could not be loaded. Please retry.");
  const rows = data ?? [];
  const [{ data: parties }, { data: brands }, { data: stores }] = await Promise.all([
    supabase.from("parties").select("id,legal_name").in("id", [...new Set(rows.map((row) => row.party_id).filter((id): id is string => Boolean(id)))]),
    supabase.from("brands").select("id,name").in("id", [...new Set(rows.map((row) => row.brand_id).filter((id): id is string => Boolean(id)))]),
    supabase.from("stores").select("id,name").in("id", [...new Set(rows.map((row) => row.store_id))]),
  ]);
  const name = <T extends { id: string }>(list: T[] | null, id: string | null, key: keyof T) => (id ? (list ?? []).find((item) => item.id === id)?.[key] ?? null : null);
  return rows.map((row) => ({
    ...row,
    brands: row.brand_id ? { name: name(brands, row.brand_id, "name") as string | null } : null,
    parties: row.party_id ? { legal_name: name(parties, row.party_id, "legal_name") as string | null } : null,
    remaining: Number(row.remaining),
    stores: { name: name(stores, row.store_id, "name") as string | null },
  }));
}

/** Unattributed opening stock grouped by store and brand (pieces and lots). */
export async function unattributedByBrand() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_batches")
    .select("store_id,brand_id,qty_in, brands(name), stores(name)")
    .eq("status", "active").eq("attribution", "unattributed").limit(20000);
  const groups = new Map<string, { storeId: string; storeName: string; brandId: string | null; brandName: string; lots: number; pieces: number }>();
  for (const row of data ?? []) {
    const key = `${row.store_id}:${row.brand_id ?? "none"}`;
    const group = groups.get(key) ?? { brandId: row.brand_id, brandName: row.brands?.name ?? "Brand not recognised", lots: 0, pieces: 0, storeId: row.store_id, storeName: row.stores?.name ?? "" };
    group.lots += 1;
    group.pieces += Number(row.qty_in);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.pieces - a.pieces);
}

export async function openingSources() {
  const supabase = await createClient();
  const [{ data: reports }, { data: used }] = await Promise.all([
    supabase.from("reports").select("id,store_id,period_month,file_name,row_count, stores(name)").eq("report_type", "stock").eq("is_current", true).order("period_month", { ascending: false }).limit(20),
    supabase.from("purchase_batches").select("opening_report_id").eq("source", "opening").eq("status", "active").not("opening_report_id", "is", null).limit(1),
  ]);
  return { reports: reports ?? [], anyOpening: Boolean(used?.length) };
}

export async function listReturns() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("supplier_returns")
    .select("id,return_no,status,request_date,dispatch_date,expected_credit,accepted_value,supplier_credit_amount,firm_id,party_id, parties(legal_name), stores(name), billing_firms(name)")
    .order("created_at", { ascending: false }).limit(100);
  return data ?? [];
}

export async function getReturn(id: string) {
  const supabase = await createClient();
  const [{ data: ret }, { data: lines }] = await Promise.all([
    supabase.from("supplier_returns").select("*, parties(legal_name), stores(name), billing_firms(name)").eq("id", id).maybeSingle(),
    supabase.from("supplier_return_lines").select("*").eq("return_id", id).order("created_at"),
  ]);
  return { ret, lines: lines ?? [] };
}

export async function returnCreditPending(firmId: string | null) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("return_credit_pending", { p_firm: firmId });
  return data ?? [];
}

export async function listTransfers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("distributor_transfers")
    .select("id,transfer_date,liability_amount,batches_moved,narration,from_voucher_id,to_voucher_id,from_party_id,to_party_id, billing_firms(name)")
    .order("transfer_date", { ascending: false }).limit(50);
  return data ?? [];
}
