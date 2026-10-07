"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { requireProfile } from "@/lib/auth/session";
import { notifyTask } from "@/lib/notifications/send";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

const text = (formData: FormData, key: string, max: number) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

/** Owner: turn a night-plan action into tomorrow's task for that store's manager. */
export async function giveNightTask(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const { profile } = await requireProfile();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can give these tasks." };
  const title = text(formData, "title", 160);
  const code = text(formData, "store", 10);
  if (!title || !code) return { ok: false, message: "Task details are missing." };
  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("id").eq("code", code).maybeSingle();
  if (!store) return { ok: false, message: "Store not found." };
  const { error } = await supabase.from("tasks").insert({
    category: "night plan",
    created_by: profile.id,
    description: text(formData, "detail", 600) || null,
    due_date: addDays(getIndiaToday(), 1),
    is_private: false,
    priority: "high",
    source: "auto",
    status: "pending",
    store_id: store.id,
    title,
  });
  if (error) return { ok: false, message: "Could not create the task. Please retry." };
  await notifyTask({ createdBy: profile.id, storeId: store.id, title });
  revalidatePath("/app/tasks");
  return { ok: true, message: "Task given for tomorrow." };
}
