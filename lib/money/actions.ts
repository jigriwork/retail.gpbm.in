"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { canAccessStore, requireOwner, requireProfile } from "@/lib/auth/session";
import { expenseCategories, paidFromOptions } from "@/lib/money/format";
import { createClient } from "@/lib/supabase/server";

type State = AccountsActionState;

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** Rupees as typed ("1,250.50", "₹ 300"); null when empty, NaN when not a number. */
function amount(formData: FormData, key: string) {
  const raw = text(formData, key, 30).replace(/[₹,\s]/g, "");
  if (!raw) return null;
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : Number.NaN;
}

function dbMessage(error: { message: string; code?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42501" || /row-level security/i.test(error.message)) return "You cannot do this for this store or date.";
  if (error.code === "P0001") return error.message;
  return fallback;
}

function refresh() {
  for (const path of ["/app/money", "/app/money/expenses", "/app/money/profit"]) revalidatePath(path);
}

async function storeFor(formData: FormData) {
  const { profile } = await requireProfile();
  if (!profile || profile.is_active !== true || !["owner", "manager"].includes(profile.role)) return null;
  const storeId = text(formData, "storeId", 60);
  if (!storeId || !(await canAccessStore(storeId, profile))) return null;
  return { profile, storeId };
}

// ---------------------------------------------------------------- day close

export async function submitDayClose(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access) return { ok: false, message: "You cannot close this store." };
  const date = text(formData, "closeDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Choose the date being closed." };
  const values = {
    cash: amount(formData, "cash"), upi: amount(formData, "upi"), card: amount(formData, "card"),
    other: amount(formData, "other"), deposited: amount(formData, "deposited"), opening: amount(formData, "opening"),
  };
  if (Object.values(values).some((value) => Number.isNaN(value))) return { ok: false, message: "Enter amounts in rupees, like 1250 or 1250.50." };
  if (values.cash === null) return { ok: false, message: "Enter the cash counted in the drawer." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_day_close", {
    p_store: access.storeId, p_date: date, p_opening: values.opening, p_cash: values.cash, p_upi: values.upi ?? 0,
    p_card: values.card ?? 0, p_other: values.other ?? 0, p_other_note: text(formData, "otherNote", 200) || null,
    p_deposited: values.deposited ?? 0, p_note: text(formData, "note", 500) || null,
  });
  if (error) return { ok: false, message: dbMessage(error, "The close could not be saved. Please retry.") };
  refresh();
  return { ok: true, message: "Day closed. The owner will see if the cash matches." };
}

export async function reviewDayClose(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner reviews day closes." };
  const action = text(formData, "action", 10);
  if (!["review", "reopen"].includes(action)) return { ok: false, message: "Unknown action." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_day_close", { p_id: text(formData, "closeId", 60), p_action: action, p_note: text(formData, "note", 500) || null });
  if (error) return { ok: false, message: dbMessage(error, "Could not update the close. Please retry.") };
  refresh();
  return { ok: true, message: action === "review" ? "Marked as checked." : "Reopened. The store can enter it again." };
}

// ---------------------------------------------------------------- expenses

export async function addExpense(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access) return { ok: false, message: "You cannot add expenses for this store." };
  const date = text(formData, "expenseDate", 10);
  const category = text(formData, "category", 30);
  const paidFrom = text(formData, "paidFrom", 10);
  const value = amount(formData, "amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Choose the date of the expense." };
  if (!expenseCategories.some((item) => item.value === category)) return { ok: false, message: "Choose what the money was spent on." };
  if (!paidFromOptions.some((item) => item.value === paidFrom)) return { ok: false, message: "Choose how it was paid." };
  if (value === null || Number.isNaN(value) || value <= 0) return { ok: false, message: "Enter the amount in rupees." };
  if (category === "other" && text(formData, "note", 500).length < 3) return { ok: false, message: "Say what the expense was for." };
  const supabase = await createClient();
  const { error } = await supabase.from("store_expenses").insert({
    store_id: access.storeId, expense_date: date, category, amount: value, paid_from: paidFrom,
    paid_to: text(formData, "paidTo", 120) || null, note: text(formData, "note", 500) || null, created_by: access.profile.id,
  });
  if (error) return { ok: false, message: dbMessage(error, "The expense could not be saved. Please retry.") + (error.code === "42501" ? " Expenses can be entered for the last 7 days." : "") };
  refresh();
  return { ok: true, message: "Expense saved." };
}

export async function reviewExpense(_state: State, formData: FormData): Promise<State> {
  const owner = await requireOwner();
  if (!owner) return { ok: false, message: "Only the owner checks expenses." };
  const status = text(formData, "status", 10);
  const reason = text(formData, "reason", 300);
  if (!["checked", "rejected"].includes(status)) return { ok: false, message: "Unknown action." };
  if (status === "rejected" && reason.length < 3) return { ok: false, message: "Say why the expense is rejected." };
  const supabase = await createClient();
  const { error } = await supabase.from("store_expenses").update({
    status, reject_reason: status === "rejected" ? reason : null, checked_by: owner.profile.id, checked_at: new Date().toISOString(),
  }).eq("id", text(formData, "expenseId", 60));
  if (error) return { ok: false, message: dbMessage(error, "Could not update the expense.") };
  refresh();
  return { ok: true, message: status === "checked" ? "Marked as checked." : "Rejected. It no longer counts in cash or profit." };
}

export async function deleteExpense(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  if (!profile || profile.is_active !== true) return { ok: false, message: "Your account is not active." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_expenses").delete().eq("id", text(formData, "expenseId", 60)).select("id");
  if (error || !data?.length) return { ok: false, message: "Only unchecked entries made in the last day can be removed by the person who made them." };
  refresh();
  return { ok: true, message: "Expense removed." };
}

// ---------------------------------------------------------------- profit settings (owner)

export async function saveMonthlyCost(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner manages fixed costs." };
  const name = text(formData, "name", 80);
  const value = amount(formData, "amount");
  const from = text(formData, "validFrom", 7);
  if (name.length < 2) return { ok: false, message: "Name the cost, like Rent or Electricity." };
  if (value === null || Number.isNaN(value) || value <= 0) return { ok: false, message: "Enter the monthly amount in rupees." };
  if (!/^\d{4}-\d{2}$/.test(from)) return { ok: false, message: "Choose the first month it applies to." };
  const supabase = await createClient();
  const { error } = await supabase.from("store_monthly_costs").insert({ store_id: text(formData, "storeId", 60), name, amount: value, valid_from: `${from}-01` });
  if (error) return { ok: false, message: dbMessage(error, "Could not save the cost.") };
  refresh();
  return { ok: true, message: "Fixed cost saved. It counts in every month from then on." };
}

export async function endMonthlyCost(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner manages fixed costs." };
  const last = text(formData, "validTo", 7);
  if (!/^\d{4}-\d{2}$/.test(last)) return { ok: false, message: "Choose the last month it applies to." };
  const supabase = await createClient();
  const { error } = await supabase.from("store_monthly_costs").update({ valid_to: `${last}-01` }).eq("id", text(formData, "costId", 60));
  if (error) return { ok: false, message: dbMessage(error, "Could not end the cost. The last month cannot be before the first.") };
  refresh();
  return { ok: true, message: "Cost ended." };
}

export async function saveEstimatedMargin(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner sets the estimated margin." };
  const raw = text(formData, "margin", 6);
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 90)) return { ok: false, message: "Enter a margin between 0 and 90 %, or leave it empty." };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({ estimated_margin_pct: value }).eq("id", text(formData, "storeId", 60));
  if (error) return { ok: false, message: dbMessage(error, "Could not save the margin.") };
  refresh();
  return { ok: true, message: value === null ? "Estimate removed." : "Estimated margin saved." };
}
