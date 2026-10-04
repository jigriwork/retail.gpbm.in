"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { canAccessStore, requireOwner, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type State = AccountsActionState;

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

const message = (error: { message: string; code?: string } | null, fallback: string) =>
  error?.code === "P0001" ? error.message : fallback;

export async function saveBudget(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner sets buying budgets." };
  const amount = Number(text(formData, "amount", 20).replace(/[₹,\s]/g, ""));
  const starts = text(formData, "startsOn", 10);
  const ends = text(formData, "endsOn", 10);
  if (!text(formData, "brandId", 60)) return { ok: false, message: "Choose the brand." };
  if (text(formData, "season", 40).length < 2) return { ok: false, message: "Name the season, like AW26 or Summer 2027." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends) || ends < starts) return { ok: false, message: "Choose the season's start and end dates." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Enter the budget in rupees (purchase value without GST)." };
  const supabase = await createClient();
  const { error } = await supabase.from("buying_budgets").insert({
    brand_id: text(formData, "brandId", 60), store_id: text(formData, "storeId", 60) || null, season: text(formData, "season", 40),
    starts_on: starts, ends_on: ends, budget_amount: amount, note: text(formData, "note", 300) || null,
  });
  if (error) return { ok: false, message: "Could not save the budget." };
  revalidatePath("/app/buying/budgets");
  return { ok: true, message: "Budget saved." };
}

export async function deleteBudget(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner manages budgets." };
  const supabase = await createClient();
  const { error } = await supabase.from("buying_budgets").delete().eq("id", text(formData, "budgetId", 60));
  if (error) return { ok: false, message: "Could not remove the budget." };
  revalidatePath("/app/buying/budgets");
  return { ok: true, message: "Budget removed." };
}

export async function startStockCount(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  const storeId = text(formData, "storeId", 60);
  if (!profile || !["owner", "manager"].includes(profile.role) || !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You cannot count this store." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_stock_count", {
    p_store: storeId, p_title: text(formData, "title", 80) || null, p_brand: text(formData, "brand", 120) || null, p_category: text(formData, "category", 120) || null,
  });
  if (error || !data) return { ok: false, message: message(error, "The count could not be started. Please retry.") };
  redirect(`/app/stock-counts/${data}`);
}

export async function recordCount(lineId: string, quantity: number | null) {
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0 || quantity > 100000)) return { ok: false, message: "Enter a quantity." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_stock_count", { p_line: lineId, p_qty: quantity });
  return error ? { ok: false, message: message(error, "Not saved. Check the connection and try again.") } : { ok: true, message: "" };
}

export async function addExtraItem(_state: State, formData: FormData): Promise<State> {
  const quantity = Number(text(formData, "qty", 10));
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_stock_count_extra", {
    p_count: text(formData, "countId", 60), p_code: text(formData, "code", 60) || null, p_item: text(formData, "item", 120) || null,
    p_size: text(formData, "size", 20) || null, p_qty: quantity,
  });
  if (error) return { ok: false, message: message(error, "Could not add the item.") };
  revalidatePath(`/app/stock-counts/${text(formData, "countId", 60)}`);
  return { ok: true, message: "Added." };
}

export async function submitCount(_state: State, formData: FormData): Promise<State> {
  const supabase = await createClient();
  const countId = text(formData, "countId", 60);
  const { error } = await supabase.rpc("submit_stock_count", { p_count: countId });
  if (error) return { ok: false, message: message(error, "Could not submit the count.") };
  revalidatePath(`/app/stock-counts/${countId}`);
  revalidatePath("/app/stock-counts");
  return { ok: true, message: "Count submitted. The difference is now shown." };
}

export async function reviewCount(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner reviews stock counts." };
  const supabase = await createClient();
  const countId = text(formData, "countId", 60);
  const { error } = await supabase.rpc("review_stock_count", { p_count: countId, p_note: text(formData, "note", 500) || null });
  if (error) return { ok: false, message: message(error, "Could not review the count.") };
  revalidatePath(`/app/stock-counts/${countId}`);
  return { ok: true, message: "Marked as reviewed." };
}
