import "server-only";

import { monthEnd, monthStart } from "@/lib/money/format";
import { createClient } from "@/lib/supabase/server";

export type DayCloseRow = {
  id: string; close_date: string; status: string; opening_cash: number; cash_counted: number; upi_amount: number;
  card_amount: number; other_amount: number; other_note: string | null; cash_deposited: number; note: string | null;
  review_note: string | null; submitted_by_name: string | null; submitted_at: string; logic_net_sale: number | null;
  sales_report_uploaded: boolean; cash_expenses: number; expected_cash: number | null; difference: number | null;
};

export type ProfitStatement = {
  month: string; days_elapsed: number; sales_days: number; sales_incl_gst: number; gst: number; net_sales: number;
  taxable_estimated_sales: number; cost_known: number; cost_known_sales: number; cost_unknown_sales: number;
  estimated_margin_pct: number | null; cost_estimated: number | null; gross_profit: number; gross_profit_complete: boolean;
  salaries: number; salary_people: number; salary_file: string | null; salary_uploaded_at: string | null;
  expenses: Array<{ category: string; amount: number }>; expenses_total: number;
  fixed_costs: Array<{ id: string; name: string; amount: number }>; fixed_total: number; net_profit: number;
};

export async function listDayCloses(storeId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("day_close_overview", { p_store: storeId, p_from: from, p_to: to });
  if (error) throw new Error("Day closes could not be loaded. Please retry.");
  return (data ?? []) as DayCloseRow[];
}

export async function missingDayCloses(storeId: string, days = 14) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("missing_day_closes", { p_store: storeId, p_days: days });
  if (error) return [];
  return (data ?? []) as string[];
}

/** The close before a date: its cash kept becomes the next day's opening cash. */
export async function previousDayClose(storeId: string, date: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("store_day_closes").select("close_date,cash_counted,cash_deposited")
    .eq("store_id", storeId).lt("close_date", date).order("close_date", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function dayCloseFor(storeId: string, date: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("store_day_closes").select("id,status").eq("store_id", storeId).eq("close_date", date).maybeSingle();
  return data;
}

export async function listExpenses(storeId: string, month: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_expenses")
    .select("id,expense_date,category,amount,paid_from,paid_to,note,status,reject_reason,created_by,created_at,profiles!store_expenses_created_by_fkey(full_name)")
    .eq("store_id", storeId).gte("expense_date", monthStart(month)).lte("expense_date", monthEnd(month))
    .order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error("Expenses could not be loaded. Please retry.");
  return data ?? [];
}

export async function storeProfit(storeId: string, month: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_profit", { p_store: storeId, p_month: monthStart(month) });
  if (error) throw new Error("Profit could not be calculated. Please retry.");
  return data as unknown as ProfitStatement;
}

export async function listMonthlyCosts(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("store_monthly_costs").select("id,name,amount,valid_from,valid_to")
    .eq("store_id", storeId).order("valid_from", { ascending: false });
  return data ?? [];
}
