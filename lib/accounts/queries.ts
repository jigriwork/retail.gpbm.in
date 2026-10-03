import "server-only";

import { indiaToday } from "@/lib/accounts/format";
import { createClient } from "@/lib/supabase/server";

// Every query runs as the signed-in person: row-level security decides what
// comes back, so a scoped accountant only ever sees their firms and stores.

export async function listFirms() {
  const supabase = await createClient();
  const { data } = await supabase.from("billing_firms").select("*").order("name");
  return data ?? [];
}

export async function listFinanceStores() {
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("id,name,code,is_active,firm_name").order("name");
  return data ?? [];
}

export async function listStoreFirmPeriods() {
  const supabase = await createClient();
  const { data } = await supabase.from("store_firm_periods").select("*").order("valid_from", { ascending: true, nullsFirst: true });
  return data ?? [];
}

export async function listBillingSeries() {
  const supabase = await createClient();
  const { data } = await supabase.from("billing_series").select("*").order("prefix");
  return data ?? [];
}

/** Each store with the firm it bills under today ("Billed under"). */
export async function storesWithFirmToday() {
  const [stores, firms, periods] = await Promise.all([listFinanceStores(), listFirms(), listStoreFirmPeriods()]);
  const today = indiaToday();
  return stores.filter((store) => store.is_active).map((store) => {
    const current = periods.filter((period) => period.store_id === store.id && period.status === "confirmed"
      && (!period.valid_from || period.valid_from <= today) && (!period.valid_to || period.valid_to >= today));
    const firm = current.length === 1 ? firms.find((item) => item.id === current[0].firm_id) ?? null : null;
    return { ...store, firm };
  });
}

export async function listParties(search: string, page: number, pageSize = 30) {
  const supabase = await createClient();
  let query = supabase.from("parties").select("id,legal_name,display_name,gstin,state_code,phone,is_active", { count: "exact" }).order("legal_name");
  if (search) {
    const term = search.replace(/[%_,()]/g, " ").trim();
    query = query.or(`legal_name.ilike.%${term}%,display_name.ilike.%${term}%,gstin.ilike.%${term}%`);
  }
  const { data, count } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
  return { parties: data ?? [], total: count ?? 0, pageSize };
}

export async function getParty(id: string) {
  const supabase = await createClient();
  const [{ data: party }, { data: aliases }, { data: links }, { data: arrangements }] = await Promise.all([
    supabase.from("parties").select("*").eq("id", id).maybeSingle(),
    supabase.from("party_aliases").select("id,alias,created_at").eq("party_id", id).order("alias"),
    supabase.from("agent_parties").select("id,role,is_active,agents(id,name,phone,email,is_active)").eq("party_id", id),
    supabase.from("supply_arrangements").select("*, brands(name), billing_firms(name), stores(name)").eq("party_id", id).order("valid_from", { ascending: false }),
  ]);
  return { party, aliases: aliases ?? [], agents: links ?? [], arrangements: arrangements ?? [] };
}

export async function listBrands() {
  const supabase = await createClient();
  const [{ data: brands }, { data: aliases }, { data: arrangements }] = await Promise.all([
    supabase.from("brands").select("*").order("name"),
    supabase.from("brand_aliases").select("id,brand_id,alias,source").order("alias"),
    supabase.from("supply_arrangements").select("id,brand_id,party_id,firm_id,store_id,valid_from,valid_to,status,settlement_basis, parties(legal_name), billing_firms(name), stores(name)"),
  ]);
  return (brands ?? []).map((brand) => ({
    ...brand,
    aliases: (aliases ?? []).filter((alias) => alias.brand_id === brand.id),
    arrangements: (arrangements ?? []).filter((arrangement) => arrangement.brand_id === brand.id),
  }));
}

export async function listAllParties() {
  const supabase = await createClient();
  const { data } = await supabase.from("parties").select("id,legal_name").eq("is_active", true).order("legal_name").limit(2000);
  return data ?? [];
}

export async function listAllBrands() {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("id,name").eq("is_active", true).order("name").limit(2000);
  return data ?? [];
}

export async function listArrangementsWithTerms() {
  const supabase = await createClient();
  const [{ data: arrangements }, { data: terms }] = await Promise.all([
    supabase.from("supply_arrangements").select("*, parties(legal_name), brands(name), billing_firms(name), stores(name)").order("valid_from", { ascending: false }),
    supabase.from("company_terms").select("*").order("version", { ascending: false }),
  ]);
  return (arrangements ?? []).map((arrangement) => ({
    ...arrangement,
    terms: (terms ?? []).filter((item) => item.arrangement_id === arrangement.id),
  }));
}

export async function listDocuments(page: number, pageSize = 25) {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("finance_documents")
    .select("id,kind,title,doc_no,doc_date,amount,file_name,status,submitted_role,created_at,notes,firm_id,store_id,party_id, billing_firms(name), stores(name), parties(legal_name)", { count: "exact" })
    .neq("status", "reserved")
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  return { documents: data ?? [], total: count ?? 0, pageSize };
}

export async function listGrantsWithPeople() {
  const supabase = await createClient();
  const [{ data: grants }, { data: people }] = await Promise.all([
    supabase.from("finance_grants").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,full_name,email,role,is_active").in("role", ["accountant", "manager"]).order("full_name"),
  ]);
  return { grants: grants ?? [], people: people ?? [] };
}

export async function recentFinanceEvents(entityType: string, entityId: string, limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("finance_events")
    .select("id,action,actor_role,created_at,before,after")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function salesCoverage(storeId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_input_coverage", { p_from: from, p_store: storeId, p_to: to });
  if (error) throw new Error("Sales input coverage could not be loaded. Please retry.");
  return data ?? [];
}

export async function mastersSummary() {
  const supabase = await createClient();
  const count = async (table: "parties" | "brands" | "agents" | "supply_arrangements" | "finance_documents" | "company_terms") => {
    const { count: total } = await supabase.from(table).select("id", { count: "exact", head: true });
    return total ?? 0;
  };
  const [parties, brands, agents, arrangements, documents, terms] = await Promise.all([
    count("parties"), count("brands"), count("agents"), count("supply_arrangements"), count("finance_documents"), count("company_terms"),
  ]);
  const { count: confirmedTerms } = await supabase.from("company_terms").select("id", { count: "exact", head: true }).eq("status", "confirmed");
  return { agents, arrangements, brands, confirmedTerms: confirmedTerms ?? 0, documents, parties, terms };
}
