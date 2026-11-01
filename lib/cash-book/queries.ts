import "server-only";

import type { CashEntryType } from "@/lib/cash-book/labels";
import { createClient } from "@/lib/supabase/server";

export type CashEntry = {
  amount: number; at: string; by: string | null; category: string | null; direction: "in" | "out"; id: string; mine: boolean;
  note: string | null; other_store: string | null; reference: string | null; staff_name: string | null; transfer_status: string | null;
  type: CashEntryType;
};

export type CashSoftware = {
  /** report | override | workbook (imported day) | pending; for a closed day: what it was closed with. */
  status: "override" | "pending" | "report" | "workbook";
  report_status: "pending" | "processing" | "ready";
  basis: "item" | "summary" | "zero_confirmed" | "zero_report" | null;
  summary_ignored: boolean | null;
  /** Hidden (null) for cashiers. */
  amount: number | null;
  report_amount: number | null;
  override: { by: string | null; at: string; corrected: number; original: number | null; original_status: string; reason: string } | null;
  overridden: boolean;
  at_close: { amount: number | null; report_amount: number | null; report_status: string; source: string } | null;
  changed_after_close: boolean;
  /** The figure used (workbook or correction) differs from the uploaded report. */
  report_differs: boolean | null;
  legacy_workbook: number | null;
  matches: boolean | null;
};

export type CashDayStatus = "before_start" | "closed" | "future" | "missing" | "no_access" | "not_started" | "open" | "reviewed";

export type CashRow = {
  date: string;
  exists: boolean;
  status: CashDayStatus;
  source: "app" | "legacy_import";
  opening: number | null;
  opening_rule: string | null;
  book_sales: number | null;
  software: CashSoftware;
  sales_difference: number | null;
  card: number | null;
  upi: number | null;
  edc_legacy: number;
  noncash: number;
  deposit: number;
  deposit_lines: number;
  cash_expenses: number;
  shop_expenses: number;
  staff: number;
  donation: number;
  owner_home: number;
  to_store: number;
  other_out: number;
  other_in: number;
  legacy_combined: number;
  other_net: number;
  bank_paid_expenses: number | null;
  closing: number | null;
  counted: number | null;
  cash_difference: number | null;
  missing: string[];
  legacy_mode: boolean | null;
  previous_closed: boolean;
  can_close: boolean;
  can_edit: boolean;
  can_override: boolean;
  flags: string[];
  bank_day: boolean;
  revision: number;
  lines: number;
  note: string | null;
  closed_by: string | null;
  closed_at: string | null;
  reviewed_by: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

export type CashMonth = {
  month: string; from: string; to: string; today: string;
  start: { date: string; opening: number } | null;
  opening: number | null; opening_date: string | null;
  closing: number | null; closing_date: string | null;
  complete: boolean;
  totals: Record<string, number | null>;
  access: { cashier: boolean; enter: boolean; manager: boolean; override: boolean; owner: boolean };
  days: CashRow[];
};

export type CashDay = CashRow & {
  start: { date: string; opening: number } | null;
  blocked: "before_start" | "not_started" | null;
  entries: CashEntry[];
  paid_expenses: Array<{ amount: number; by: string | null; category: string; id: string; note: string | null; paid_from: string; reference: string | null; status: string }>;
  overrides: Array<{ at: string; by: string | null; corrected: number; id: string; original: number | null; original_status: string; reason: string; restore_reason: string | null; restored_at: string | null; restored_by: string | null }>;
  events: Array<{ action: string; at: string; by: string | null; reason: string | null; role: string | null }>;
  incoming: Array<{ amount: number; from: string; id: string; note: string | null; sent_date: string }>;
};

export type StoreChecklist = {
  cash_start: string | null;
  /** Latest stock date; stock is uploaded weekly. */
  stock_date?: string | null;
  days: Array<{ cash: "closed" | "not_done" | "open" | "reviewed"; day: string; report: "late" | "missing" | "on_time" | "summary_only" }>;
  tasks_due: number;
};

export async function getCashMonth(storeId: string, month: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_month", { p_month: month, p_store: storeId });
  if (error || !data) return null;
  return data as unknown as CashMonth;
}

export async function getCashDay(storeId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_day", { p_date: date, p_store: storeId });
  if (error || !data) return null;
  return data as unknown as CashDay;
}

/** Stores this person may open in the cash book (owner, store staff, or a cash book grant). */
export async function getCashBookStores() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cash_book_stores");
  return (data ?? []) as unknown as Array<{ code: string; id: string; name: string }>;
}

export async function getOtherStores(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cash_book_other_stores", { p_store: storeId });
  return (data ?? []) as unknown as Array<{ id: string; name: string }>;
}

export async function getStoreStaff(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cash_book_staff", { p_store: storeId });
  return (data ?? []) as unknown as Array<{ id: string; name: string }>;
}

export async function getBankHolidays(from: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("bank_holiday_list", { p_from: from });
  return (data ?? []) as unknown as Array<{ day: string; note: string | null }>;
}

export async function getCashImports(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cash_book_import_list", { p_store: storeId });
  return (data ?? []) as unknown as Array<{
    by: string | null; closing: number; file_name: string; id: string; imported_at: string; opening: number;
    period_from: string; period_to: string; sheet: string; totals: Record<string, unknown>;
  }>;
}

export async function getStoreChecklist(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("store_checklist", { p_days: 30, p_store: storeId });
  return (data ?? null) as unknown as StoreChecklist | null;
}

/** The day to work on in a month: the first open or missing day up to today, else the last day with entries. */
export function workDay(month: CashMonth) {
  const usable = month.days.filter((day) => day.date <= month.today && !["before_start", "not_started", "future", "no_access"].includes(day.status));
  return usable.find((day) => day.status === "open" || day.status === "missing")?.date ?? usable.at(-1)?.date ?? null;
}
