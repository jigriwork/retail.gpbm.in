"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type StoreActionState = {
  ok: boolean;
  message: string;
};

function text(formData: FormData, key: string, max = 80) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function wholeNumber(formData: FormData, key: string) {
  const raw = text(formData, key, 15).replace(/[,₹\s]/g, "");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : NaN;
}

function refreshStorePages() {
  for (const path of ["/app/stores", "/app/today", "/app/settings", "/app/users", "/app/reports", "/app/payslips/upload"]) {
    revalidatePath(path);
  }
}

async function audit(action: string, actor: { id: string; role: string | null }, storeId: string | null, metadata: Record<string, unknown>) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action,
      actor_id: actor.id,
      actor_role: actor.role,
      entity_id: storeId,
      entity_type: "store",
      metadata: metadata as never,
    });
  } catch {
    // Audit logging must never block store setup.
  }
}

/** Owner adds a new store. It is active straight away; managers are assigned under Users. */
export async function createStore(_previous: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const session = await requireOwner();
  if (!session?.profile) return { ok: false, message: "Only an owner can add stores." };

  const name = text(formData, "name", 60);
  const code = text(formData, "code", 10).toUpperCase();
  const firmName = text(formData, "firmName", 80);
  const location = text(formData, "location", 80);
  const type = text(formData, "type", 40);
  const target = wholeNumber(formData, "monthlyTarget");
  const slowDays = wholeNumber(formData, "slowStockDays");
  const deadDays = wholeNumber(formData, "deadStockDays");

  if (name.length < 2) return { ok: false, message: "Enter the store name." };
  if (!/^[A-Z0-9]{2,10}$/.test(code)) return { ok: false, message: "Store code must be 2–10 letters or numbers, like GP or BM2." };
  if (!firmName) return { ok: false, message: "Enter the billing firm name (used on payslips)." };
  if (Number.isNaN(target)) return { ok: false, message: "Monthly target must be a number." };
  if (Number.isNaN(slowDays) || Number.isNaN(deadDays)) return { ok: false, message: "Stock days must be whole numbers." };
  const slow = slowDays ?? 45;
  const dead = deadDays ?? 90;
  if (slow < 1 || dead <= slow || dead > 730) return { ok: false, message: "Dead-stock days must be more than slow-stock days (and under 730)." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("stores").select("id,is_active").eq("code", code).maybeSingle();
  if (existing) {
    return {
      ok: false,
      message: existing.is_active
        ? `A store with code ${code} already exists.`
        : `A switched-off store already uses code ${code}. Switch it on below instead of adding it again.`,
    };
  }

  const { data: store, error } = await supabase
    .from("stores")
    .insert({
      code,
      dead_stock_days: dead,
      firm_name: firmName,
      is_active: true,
      location: location || null,
      monthly_target: target,
      monthly_target_enabled: target !== null && target > 0,
      name,
      slow_stock_days: slow,
      type: type || "store",
    })
    .select("id")
    .single();
  if (error || !store) return { ok: false, message: error?.message ?? "The store could not be added." };

  await audit("store_created", session.profile, store.id, { code, name });
  refreshStorePages();
  return { ok: true, message: `${name} added. Assign its manager under Users.` };
}

/** Owner switches a store on or off. Its data is kept either way. */
export async function setStoreActive(_previous: StoreActionState, formData: FormData): Promise<StoreActionState> {
  const session = await requireOwner();
  if (!session?.profile) return { ok: false, message: "Only an owner can change stores." };

  const storeId = text(formData, "storeId", 60);
  const active = text(formData, "active", 5) === "true";
  if (!storeId) return { ok: false, message: "Store is required." };

  const supabase = await createClient();
  if (!active) {
    const { count } = await supabase.from("stores").select("id", { count: "exact", head: true }).eq("is_active", true);
    if ((count ?? 0) <= 1) return { ok: false, message: "At least one store must stay switched on." };
  }
  const { data: store, error } = await supabase
    .from("stores")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", storeId)
    .select("id,name")
    .maybeSingle();
  if (error || !store) return { ok: false, message: error?.message ?? "Store not found." };

  await audit(active ? "store_activated" : "store_deactivated", session.profile, store.id, { name: store.name });
  refreshStorePages();
  return { ok: true, message: active ? `${store.name} is switched on.` : `${store.name} is switched off. Its history is kept.` };
}
