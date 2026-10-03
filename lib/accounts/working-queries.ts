import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function listWorkings(limit = 60) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calculation_runs")
    .select("id,period_from,period_to,rule_set,status,complete,source_changed,totals,company_figures,created_at,arrangement_id, parties(legal_name), brands(name), billing_firms(name), stores(name)")
    .order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function getWorking(id: string, page: number, pageSize = 100) {
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("calculation_runs")
    .select("*, parties(legal_name), brands(name), billing_firms(name), stores(name), supply_arrangements(settlement_basis)")
    .eq("id", id).maybeSingle();
  if (!run) return { run: null, lines: [], total: 0, sibling: null, claims: [], settlement: null, pageSize };
  const [{ data: lines, count }, { data: siblings }, { data: claims }, { data: settlement }] = await Promise.all([
    supabase.from("calculation_lines").select("*", { count: "exact" }).eq("run_id", id).order("ord").range(page * pageSize, page * pageSize + pageSize - 1),
    supabase.from("calculation_runs").select("id,rule_set,totals,status,created_at")
      .eq("arrangement_id", run.arrangement_id).eq("period_from", run.period_from).eq("period_to", run.period_to)
      .neq("rule_set", run.rule_set).neq("status", "superseded").order("created_at", { ascending: false }).limit(1),
    supabase.from("claims").select("id,kind,expected_amount,status,matched_voucher_id,received_amount").eq("run_id", id),
    supabase.from("settlements").select("id,payable,due_date,status").eq("run_id", id).maybeSingle(),
  ]);
  return { run, lines: lines ?? [], total: count ?? 0, sibling: siblings?.[0] ?? null, claims: claims ?? [], settlement, pageSize };
}

export async function listClaims() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("claims")
    .select("id,kind,period_from,period_to,expected_amount,status,received_amount,matched_voucher_id,run_id,firm_id,party_id, parties(legal_name), billing_firms(name)")
    .order("created_at", { ascending: false }).limit(200);
  return data ?? [];
}

export async function listSettlements() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settlements")
    .select("id,payable,due_date,status,run_id,firm_id,party_id, parties(legal_name), billing_firms(name)")
    .order("created_at", { ascending: false }).limit(200);
  const ids = (data ?? []).map((settlement) => settlement.id);
  const { data: payments } = ids.length
    ? await supabase.from("settlement_payments").select("settlement_id,amount").in("settlement_id", ids).is("released_at", null)
    : { data: [] };
  return (data ?? []).map((settlement) => ({
    ...settlement,
    paid: (payments ?? []).filter((row) => row.settlement_id === settlement.id).reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100,
  }));
}

/** Posted credit notes not yet matched to an expected credit, for one supplier and firm. */
export async function unmatchedCreditNotes(firmId: string, partyId: string) {
  const supabase = await createClient();
  const [{ data: notes }, { data: matched }] = await Promise.all([
    supabase.from("vouchers").select("id,voucher_no,voucher_date,amount,reference_no").eq("firm_id", firmId).eq("party_id", partyId)
      .eq("voucher_type", "credit_note").eq("status", "posted").order("voucher_date", { ascending: false }).limit(100),
    supabase.from("claims").select("matched_voucher_id").not("matched_voucher_id", "is", null).limit(5000),
  ]);
  const used = new Set((matched ?? []).map((row) => row.matched_voucher_id));
  return (notes ?? []).filter((note) => !used.has(note.id));
}

export async function paymentsForSettlement(firmId: string, partyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("vouchers").select("id,voucher_no,voucher_date,amount,reference_no").eq("firm_id", firmId).eq("party_id", partyId)
    .eq("voucher_type", "payment").eq("status", "posted").order("voucher_date", { ascending: false }).limit(50);
  return data ?? [];
}

export async function settlementBalances(firmId: string | null) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("settlement_balances", { p_firm: firmId });
  return data ?? [];
}
