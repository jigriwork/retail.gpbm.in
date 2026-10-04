import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Recalculate the saved stock position of each store if its reports changed (one request per store). */
export async function refreshStockPositions(storeIds: string[]) {
  const supabase = await createClient();
  for (const storeId of storeIds) {
    const { error } = await supabase.rpc("refresh_stock_position", { p_store: storeId });
    if (error) throw new Error("Stock position could not be updated. Please retry.");
  }
}

/** Refresh every active store (reorder and transfers compare stores). */
export async function refreshAllStockPositions() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_position_store_ids");
  if (error) throw new Error("Stock position could not be updated. Please retry.");
  await refreshStockPositions((data ?? []) as string[]);
}

export async function brandSellThrough(storeId: string, days: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("brand_sell_through", { p_store: storeId, p_days: days });
  if (error) throw new Error("Sell-through could not be loaded. Please retry.");
  return data ?? [];
}

export async function reorderSuggestions(storeId: string, days: number, coverDays: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reorder_suggestions", { p_store: storeId, p_days: days, p_cover_days: coverDays });
  if (error) throw new Error("Reorder suggestions could not be loaded. Please retry.");
  return data ?? [];
}

export async function transferSuggestions() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_suggestions");
  if (error) throw new Error("Transfer suggestions could not be loaded. Please retry.");
  return data ?? [];
}

export async function markdownCandidates(storeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("markdown_candidates", { p_store: storeId });
  if (error) throw new Error("The markdown list could not be loaded. Please retry.");
  return data ?? [];
}

export async function budgetStatus() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("budget_status");
  if (error) throw new Error("Budgets could not be loaded. Please retry.");
  return data ?? [];
}

export async function listBrandsForBudget() {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("id,name").eq("is_active", true).order("name").limit(1000);
  return data ?? [];
}

export async function listStockCounts(storeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_counts")
    .select("id,title,status,snapshot_date,created_at,submitted_at,reviewed_at,review_note,profiles!stock_counts_created_by_fkey(full_name)")
    .eq("store_id", storeId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Stock counts could not be loaded. Please retry.");
  return data ?? [];
}

export async function stockCount(countId: string) {
  const supabase = await createClient();
  const [{ data: count }, { data: sheet, error }, { data: summary }] = await Promise.all([
    supabase.from("stock_counts").select("id,store_id,title,status,scope_brand,scope_category,snapshot_date,created_at,submitted_at,review_note,stores(name)").eq("id", countId).maybeSingle(),
    supabase.rpc("stock_count_sheet", { p_count: countId }),
    supabase.rpc("stock_count_summary", { p_count: countId }),
  ]);
  if (error) throw new Error("The count sheet could not be loaded. Please retry.");
  return { count, sheet: sheet ?? [], summary: summary as Record<string, number | null> | null };
}

/** Brands and categories in the store's latest stock report, for choosing what to count. */
export async function countScopes(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("brand_sell_through", { p_store: storeId, p_days: 30 });
  return (data ?? []).filter((row) => Number(row.on_hand) > 0).map((row) => row.brand).sort();
}
