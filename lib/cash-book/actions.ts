"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { cashCategories, cashEntryTypes } from "@/lib/cash-book/labels";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
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

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// The database explains every refusal in plain words (P0001); anything else is generic.
function dbMessage(error: { code?: string; message: string } | null, fallback: string) {
  if (error?.code === "P0001") return error.message;
  return fallback;
}

function refresh() {
  revalidatePath("/app/money");
  revalidatePath("/app/today");
}

async function storeFor(formData: FormData) {
  const { profile } = await requireProfile();
  if (!profile || profile.is_active !== true || !["owner", "manager", "cashier"].includes(profile.role)) return null;
  const storeId = text(formData, "storeId", 60);
  if (!storeId || !(await canAccessStore(storeId, profile))) return null;
  return { profile, storeId };
}

export async function addCashEntry(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access) return { ok: false, message: "You cannot use this store's cash book." };
  const date = text(formData, "date", 10);
  const type = text(formData, "type", 20);
  const value = amount(formData, "amount");
  if (!isDate(date)) return { ok: false, message: "Choose the day." };
  if (!cashEntryTypes.some((item) => item.value === type)) return { ok: false, message: "Choose what the money was for." };
  if (value === null || Number.isNaN(value) || value <= 0) return { ok: false, message: "Enter the amount in rupees." };
  const category = type === "expense" ? text(formData, "category", 30) : "";
  if (type === "expense" && !cashCategories.some((item) => item.value === category)) return { ok: false, message: "Choose the expense type." };
  const employee = type === "staff_payment" ? text(formData, "employeeId", 60) : "";
  const otherStore = type === "to_store" ? text(formData, "otherStoreId", 60) : "";
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_add_entry", {
    p_store: access.storeId, p_date: date, p_type: type, p_amount: value,
    p_category: category || undefined, p_note: text(formData, "note", 300) || undefined,
    p_employee: employee || undefined, p_other_store: otherStore || undefined,
  });
  if (error) return { ok: false, message: dbMessage(error, "The line could not be saved. Please retry.") };
  refresh();
  return { ok: true, message: "Added." };
}

export async function deleteCashEntry(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access) return { ok: false, message: "You cannot use this store's cash book." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_delete_entry", { p_entry: text(formData, "entryId", 60) });
  if (error) return { ok: false, message: dbMessage(error, "The line could not be removed. Please retry.") };
  refresh();
  return { ok: true, message: "Removed." };
}

export async function receiveCashTransfer(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access) return { ok: false, message: "You cannot use this store's cash book." };
  const date = text(formData, "date", 10);
  if (!isDate(date)) return { ok: false, message: "Choose the day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_receive_transfer", { p_transfer: text(formData, "transferId", 60), p_date: date });
  if (error) return { ok: false, message: dbMessage(error, "The cash could not be marked as received. Please retry.") };
  refresh();
  return { ok: true, message: "Received and added to the book." };
}

export async function closeCashDay(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access) return { ok: false, message: "You cannot use this store's cash book." };
  const date = text(formData, "date", 10);
  const sale = amount(formData, "sale");
  const counted = amount(formData, "counted");
  if (!isDate(date)) return { ok: false, message: "Choose the day." };
  if (sale === null || Number.isNaN(sale)) return { ok: false, message: "Enter the day's total sale from Logic." };
  if (counted === null || Number.isNaN(counted)) return { ok: false, message: "Count the cash in the drawer and enter it." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_close_day", {
    p_store: access.storeId, p_date: date, p_sale: sale, p_counted: counted, p_note: text(formData, "note", 500) || undefined,
  });
  if (error || !data) return { ok: false, message: dbMessage(error, "The day could not be closed. Please retry.") };
  refresh();
  const result = data as { closing: number; difference: number };
  const difference = Math.round(Number(result.difference));
  const cb = `CB ₹${Math.round(Number(result.closing)).toLocaleString("en-IN")}`;
  return {
    ok: true,
    message: Math.abs(difference) <= 10
      ? `Day closed. ${cb}, cash matched.`
      : `Day closed. ${cb}; counted cash is ${difference < 0 ? "short" : "more"} by ₹${Math.abs(difference).toLocaleString("en-IN")}. The owner will see this.`,
  };
}

export async function reopenCashDay(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access || access.profile.role !== "owner") return { ok: false, message: "Only the owner can reopen a closed day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_reopen_day", { p_store: access.storeId, p_date: text(formData, "date", 10) });
  if (error) return { ok: false, message: dbMessage(error, "The day could not be reopened. Please retry.") };
  refresh();
  return { ok: true, message: "Reopened. Lines can be changed and the day closed again." };
}

export async function reviewCashDay(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access || access.profile.role === "cashier") return { ok: false, message: "Only the owner or the manager can check a day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_review_day", {
    p_store: access.storeId, p_date: text(formData, "date", 10), p_note: text(formData, "note", 500) || undefined,
  });
  if (error) return { ok: false, message: dbMessage(error, "The day could not be marked as checked. Please retry.") };
  refresh();
  return { ok: true, message: "Marked as checked." };
}

export async function setCashBookStart(_state: State, formData: FormData): Promise<State> {
  const access = await storeFor(formData);
  if (!access || access.profile.role !== "owner") return { ok: false, message: "Only the owner sets where the cash book starts." };
  const date = text(formData, "date", 10);
  const opening = amount(formData, "opening");
  if (!isDate(date)) return { ok: false, message: "Choose the first day of the cash book." };
  if (opening === null || Number.isNaN(opening)) return { ok: false, message: "Enter the opening cash (OB) for that day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_set_start", { p_store: access.storeId, p_date: date, p_opening: opening });
  if (error) return { ok: false, message: dbMessage(error, "The start could not be saved. Please retry.") };
  refresh();
  return { ok: true, message: "Cash book started." };
}

export async function setBankHoliday(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  if (profile?.role !== "owner") return { ok: false, message: "Only the owner marks bank holidays." };
  const day = text(formData, "day", 10);
  if (!isDate(day)) return { ok: false, message: "Choose the date." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_set_holiday", {
    p_day: day, p_note: text(formData, "note", 80) || undefined, p_remove: text(formData, "remove", 5) === "1",
  });
  if (error) return { ok: false, message: dbMessage(error, "The holiday could not be saved. Please retry.") };
  refresh();
  return { ok: true, message: text(formData, "remove", 5) === "1" ? "Holiday removed." : "Bank holiday saved." };
}
