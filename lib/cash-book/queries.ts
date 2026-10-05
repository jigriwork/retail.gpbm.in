import "server-only";

import type { CashEntryType } from "@/lib/cash-book/labels";
import { createClient } from "@/lib/supabase/server";

export type CashEntry = {
  amount: number; at: string; by: string | null; category: string | null; direction: "in" | "out"; id: string; mine: boolean;
  note: string | null; other_store: string | null; staff_name: string | null; transfer_status: string | null; type: CashEntryType;
};

export type CashDay = {
  bank_day: boolean;
  blocked: "before_start" | "not_started" | "previous_open" | null;
  can_edit: boolean;
  closed_at: string | null;
  closed_by: string | null;
  closing: number | null;
  counted: number | null;
  date: string;
  entries: CashEntry[];
  incoming: Array<{ amount: number; from: string; id: string; note: string | null; sent_date: string }>;
  note: string | null;
  opening: number | null;
  report_matches: boolean | null;
  report_sale: number | null;
  report_uploaded: boolean;
  review_note: string | null;
  reviewed_by: string | null;
  sale: number | null;
  start: { date: string; opening: number } | null;
  status: "closed" | "not_opened" | "open" | "reviewed";
};

export type CashHistoryDay = {
  bank_day: boolean; closing: number | null; counted: number | null; date: string; deposit: number; difference: number | null;
  edc: number; in: number; opening: number; out: number; report_matches: boolean | null; sale: number | null;
  status: "closed" | "open" | "reviewed";
};

export type StoreChecklist = {
  cash_start: string | null;
  /** Latest stock date; stock is uploaded weekly. */
  stock_date?: string | null;
  days: Array<{ cash: "closed" | "not_done" | "open" | "reviewed"; day: string; report: "late" | "missing" | "on_time" | "summary_only" }>;
  tasks_due: number;
};

export async function getCashDay(storeId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_day", { p_date: date, p_store: storeId });
  if (error || !data) throw new Error("The cash book could not be loaded. Please retry.");
  return data as unknown as CashDay;
}

export async function getCashHistory(storeId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_history", { p_from: from, p_store: storeId, p_to: to });
  if (error) throw new Error("The cash book history could not be loaded. Please retry.");
  return (data ?? []) as unknown as CashHistoryDay[];
}

export async function getOtherStores(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cash_book_other_stores", { p_store: storeId });
  return (data ?? []) as unknown as Array<{ id: string; name: string }>;
}

export async function getStoreStaff(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("employee_contacts").select("id,staff_name")
    .eq("store_id", storeId).neq("is_active", false).order("staff_name").limit(300);
  return (data ?? []).map((row) => ({ id: row.id, name: row.staff_name }));
}

export async function getBankHolidays(from: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("bank_holiday_list", { p_from: from });
  return (data ?? []) as unknown as Array<{ day: string; note: string | null }>;
}

export async function getStoreChecklist(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("store_checklist", { p_days: 30, p_store: storeId });
  return (data ?? null) as unknown as StoreChecklist | null;
}

/** The day the cashier should work on: the day after the last closed one (never after today). */
export function nextCashDate(history: CashHistoryDay[], start: string | null, today: string) {
  const open = history.find((day) => day.status === "open");
  if (open) return open.date;
  const lastClosed = history.find((day) => day.status !== "open");
  if (!lastClosed) return start && start <= today ? start : today;
  const next = new Date(`${lastClosed.date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const value = next.toISOString().slice(0, 10);
  return value > today ? today : value;
}
