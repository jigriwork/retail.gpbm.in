"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { requireProfile } from "@/lib/auth/session";
import { cashCategories, cashEntryTypes } from "@/lib/cash-book/labels";
import type { CashMonth } from "@/lib/cash-book/queries";
import { createClient } from "@/lib/supabase/server";

type State = AccountsActionState;

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** Rupees as typed ("1,250.50", "₹ 300"); null when empty, NaN when not a number. */
function parseRupees(raw: string) {
  const value = raw.replace(/[₹,\s]/g, "");
  if (!value) return null;
  return /^\d+(\.\d{1,2})?$/.test(value) ? Number(value) : Number.NaN;
}
function amount(formData: FormData, key: string) {
  return parseRupees(text(formData, key, 30));
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// The database explains every refusal in plain words (P0001); anything else is generic.
function dbMessage(error: { code?: string; message: string } | null, fallback: string) {
  if (error?.code === "P0001") return error.message;
  return fallback;
}

function refresh() {
  revalidatePath("/app/money");
  revalidatePath("/app/today");
}

/**
 * Who may call cash book actions at all. Store, date and permission checks
 * are repeated by every database function (owner, the store's manager or
 * cashier, or an accountant with a cash book grant); this only stops other
 * roles early.
 */
async function access(storeId: string) {
  const { profile } = await requireProfile();
  if (!profile || profile.is_active !== true || !["owner", "manager", "cashier", "accountant"].includes(profile.role)) return null;
  if (!isUuid(storeId)) return null;
  return { profile, storeId };
}
async function storeFor(formData: FormData) {
  return access(text(formData, "storeId", 60));
}

async function monthFor(storeId: string, month: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cash_book_month", { p_month: month, p_store: storeId });
  return (data ?? null) as unknown as CashMonth | null;
}

export type GridResult = { ok: boolean; message: string; month?: CashMonth | null };

const gridFields = ["book_sales", "card", "upi", "deposit", "counted"] as const;
export type GridField = (typeof gridFields)[number];

/**
 * Saves typed figures for one day from the monthly grid or the phone form.
 * An empty value is saved as "not entered"; 0 must be typed for none.
 * Returns the refreshed month so later openings update at once.
 */
export async function saveCashDay(input: {
  storeId: string; date: string; month: string; revision: number | null; values: Partial<Record<GridField, string>>;
}): Promise<GridResult> {
  const allowed = await access(input.storeId);
  if (!allowed) return { ok: false, message: "You cannot use this store's cash book." };
  if (!isDate(input.date) || !isDate(input.month)) return { ok: false, message: "Choose the day." };
  const values: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(input.values ?? {})) {
    if (!gridFields.includes(key as GridField)) return { ok: false, message: "Unknown field." };
    const parsed = parseRupees(String(raw ?? "").slice(0, 30));
    if (Number.isNaN(parsed)) return { ok: false, message: "Enter rupees only (for example 1250 or 1250.50)." };
    values[key] = parsed === null ? null : String(parsed);
  }
  if (!Object.keys(values).length) return { ok: false, message: "Nothing to save." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_save_day", {
    p_date: input.date, p_revision: input.revision ?? undefined, p_store: allowed.storeId, p_values: values,
  });
  if (error) return { ok: false, message: dbMessage(error, "Not saved. Check the connection and try again."), month: await monthFor(allowed.storeId, input.month) };
  refresh();
  return { ok: true, message: "Saved", month: await monthFor(allowed.storeId, input.month) };
}

/** Closes a day from the grid (figures already saved). */
export async function closeCashDayFromGrid(input: { storeId: string; date: string; month: string; revision: number }): Promise<GridResult> {
  const allowed = await access(input.storeId);
  if (!allowed) return { ok: false, message: "You cannot use this store's cash book." };
  if (!isDate(input.date) || !isDate(input.month)) return { ok: false, message: "Choose the day." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_close", { p_date: input.date, p_revision: input.revision, p_store: allowed.storeId });
  const month = await monthFor(allowed.storeId, input.month);
  if (error || !data) return { ok: false, message: dbMessage(error, "The day could not be closed. Please retry."), month };
  refresh();
  return { ok: true, message: closedMessage(data as { closing: number; difference: number }), month };
}

function closedMessage(result: { closing: number; difference: number }) {
  const difference = Math.round(Number(result.difference) * 100) / 100;
  const closing = `Closing ₹${Number(result.closing).toLocaleString("en-IN")}`;
  if (Math.abs(difference) <= 10) return `Day closed. ${closing}; cash matched.`;
  return `Day closed. ${closing}; counted cash is ${difference < 0 ? "short" : "more"} by ₹${Math.abs(difference).toLocaleString("en-IN")}. It stays visible to the owner.`;
}

export async function closeCashDay(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed) return { ok: false, message: "You cannot use this store's cash book." };
  const date = text(formData, "date", 10);
  const revision = Number(text(formData, "revision", 10));
  if (!isDate(date)) return { ok: false, message: "Choose the day." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_close", {
    p_date: date, p_revision: Number.isInteger(revision) ? revision : undefined, p_store: allowed.storeId,
  });
  if (error || !data) return { ok: false, message: dbMessage(error, "The day could not be closed. Please retry.") };
  refresh();
  return { ok: true, message: closedMessage(data as { closing: number; difference: number }) };
}

/**
 * Adds a line. Expenses paid by UPI or bank go to "Other expenses" (one
 * record, never taken from the drawer); everything else is drawer cash.
 * clientKey makes a repeated submit save once.
 */
export async function addCashEntry(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed) return { ok: false, message: "You cannot use this store's cash book." };
  const date = text(formData, "date", 10);
  const type = text(formData, "type", 20);
  const value = amount(formData, "amount");
  const clientKey = text(formData, "clientKey", 40);
  if (!isDate(date)) return { ok: false, message: "Choose the day." };
  const option = cashEntryTypes.find((item) => item.value === type);
  if (!option) return { ok: false, message: "Choose what the money was for." };
  if (option.ownerOnly && allowed.profile.role !== "owner") return { ok: false, message: "Only the owner can record a cash adjustment." };
  if (value === null || Number.isNaN(value) || value <= 0) return { ok: false, message: "Enter the amount in rupees." };
  const category = type === "expense" ? text(formData, "category", 30) : "";
  if (type === "expense" && !cashCategories.some((item) => item.value === category)) return { ok: false, message: "Choose the expense type." };
  const paidFrom = type === "expense" ? text(formData, "paidFrom", 10) || "cash" : "cash";
  if (!["cash", "upi", "bank"].includes(paidFrom)) return { ok: false, message: "Choose how it was paid." };
  const note = text(formData, "note", 300) || undefined;
  const reference = text(formData, "reference", 80) || undefined;
  const supabase = await createClient();
  if (paidFrom !== "cash") {
    const { error } = await supabase.rpc("cash_book_add_paid_expense", {
      p_amount: value, p_category: category, p_client_key: isUuid(clientKey) ? clientKey : undefined, p_date: date,
      p_note: note, p_paid_from: paidFrom, p_reference: reference, p_store: allowed.storeId,
    });
    if (error) return { ok: false, message: dbMessage(error, "The expense could not be saved. Please retry.") };
    refresh();
    return { ok: true, message: `Saved as paid by ${paidFrom === "upi" ? "UPI" : "bank"}; drawer cash is not reduced.` };
  }
  const employee = type === "staff_payment" ? text(formData, "employeeId", 60) : "";
  const otherStore = type === "to_store" ? text(formData, "otherStoreId", 60) : "";
  const { error } = await supabase.rpc("cash_book_add_entry", {
    p_amount: value, p_category: category || undefined, p_client_key: isUuid(clientKey) ? clientKey : undefined, p_date: date,
    p_employee: employee || undefined, p_note: note, p_other_store: otherStore || undefined, p_reference: reference,
    p_store: allowed.storeId, p_type: type,
  });
  if (error) return { ok: false, message: dbMessage(error, "The line could not be saved. Please retry.") };
  refresh();
  return { ok: true, message: "Added." };
}

export async function deleteCashEntry(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed) return { ok: false, message: "You cannot use this store's cash book." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_delete_entry", {
    p_entry: text(formData, "entryId", 60), p_reason: text(formData, "reason", 300) || undefined,
  });
  if (error) return { ok: false, message: dbMessage(error, "The line could not be removed. Please retry.") };
  refresh();
  return { ok: true, message: "Removed." };
}

export async function receiveCashTransfer(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed) return { ok: false, message: "You cannot use this store's cash book." };
  const date = text(formData, "date", 10);
  if (!isDate(date)) return { ok: false, message: "Choose the day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_receive_transfer", { p_transfer: text(formData, "transferId", 60), p_date: date });
  if (error) return { ok: false, message: dbMessage(error, "The cash could not be marked as received. Please retry.") };
  refresh();
  return { ok: true, message: "Received and added to the book." };
}

export async function reopenCashDay(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed || allowed.profile.role !== "owner") return { ok: false, message: "Only the owner can reopen a closed day." };
  const reason = text(formData, "reason", 500);
  if (reason.length < 5) return { ok: false, message: "Write why the day is being reopened." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_reopen_from", { p_date: text(formData, "date", 10), p_reason: reason, p_store: allowed.storeId });
  if (error) return { ok: false, message: dbMessage(error, "The day could not be reopened. Please retry.") };
  refresh();
  const count = Number(data ?? 1);
  return { ok: true, message: `Reopened ${count} day${count === 1 ? "" : "s"}. Correct the figures, then close the ready days again in order.` };
}

/** Closes open days in date order up to a date, stopping at the first one that is not ready. */
export async function closeReadyDays(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed) return { ok: false, message: "You cannot use this store's cash book." };
  const to = text(formData, "to", 10);
  if (!isDate(to)) return { ok: false, message: "Choose the day." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_book_close_through", { p_store: allowed.storeId, p_to: to });
  if (error || !data) return { ok: false, message: dbMessage(error, "The days could not be closed. Please retry.") };
  refresh();
  const result = data as { closed: number; reason: string | null; stopped_at: string | null };
  const closed = `${result.closed} day${result.closed === 1 ? "" : "s"} closed.`;
  return result.stopped_at
    ? { ok: result.closed > 0, message: `${closed} Stopped at ${result.stopped_at}: ${result.reason}` }
    : { ok: true, message: closed };
}

export async function reviewCashDay(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed || !["owner", "manager"].includes(allowed.profile.role)) return { ok: false, message: "Only the owner or the manager can check a day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_review_day", {
    p_store: allowed.storeId, p_date: text(formData, "date", 10), p_note: text(formData, "note", 500) || undefined,
  });
  if (error) return { ok: false, message: dbMessage(error, "The day could not be marked as checked. Please retry.") };
  refresh();
  return { ok: true, message: "Marked as checked." };
}

/** Owner or an accountant with the correction permission (checked again in the database). */
export async function overrideSoftwareSales(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed || !["owner", "accountant"].includes(allowed.profile.role)) {
    return { ok: false, message: "Only the owner or an authorised accountant can correct Software Sales." };
  }
  const date = text(formData, "date", 10);
  const value = amount(formData, "amount");
  const reason = text(formData, "reason", 500);
  if (!isDate(date)) return { ok: false, message: "Choose the day." };
  if (value === null || Number.isNaN(value)) return { ok: false, message: "Enter the corrected Software Sales in rupees." };
  if (reason.length < 5) return { ok: false, message: "Write why the report figure is being corrected." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_override_software", { p_amount: value, p_date: date, p_reason: reason, p_store: allowed.storeId });
  if (error) return { ok: false, message: dbMessage(error, "The correction could not be saved. Please retry.") };
  refresh();
  return { ok: true, message: "Corrected for the cash book. The uploaded report is unchanged." };
}

export async function restoreSoftwareSales(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed || !["owner", "accountant"].includes(allowed.profile.role)) {
    return { ok: false, message: "Only the owner or an authorised accountant can change Software Sales." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_restore_software", {
    p_date: text(formData, "date", 10), p_reason: text(formData, "reason", 500) || undefined, p_store: allowed.storeId,
  });
  if (error) return { ok: false, message: dbMessage(error, "The report value could not be restored. Please retry.") };
  refresh();
  return { ok: true, message: "Report value restored." };
}

export async function setCashBookStart(_state: State, formData: FormData): Promise<State> {
  const allowed = await storeFor(formData);
  if (!allowed || allowed.profile.role !== "owner") return { ok: false, message: "Only the owner sets where the cash book starts." };
  const date = text(formData, "date", 10);
  const opening = amount(formData, "opening");
  if (!isDate(date)) return { ok: false, message: "Choose the first day of the cash book." };
  if (opening === null || Number.isNaN(opening)) return { ok: false, message: "Enter the opening cash (OB) for that day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_book_set_start", { p_store: allowed.storeId, p_date: date, p_opening: opening });
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
