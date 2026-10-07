"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { requireProfile } from "@/lib/auth/session";
import { categoryLabel, requestCategories } from "@/lib/notifications/labels";
import { notifyUsers, ownerIds, storePeople } from "@/lib/notifications/send";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type State = AccountsActionState;
const text = (formData: FormData, key: string, max: number) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
};

/** This phone / browser allowed notifications: remember where to send them. */
export async function savePushSubscription(subscription: { endpoint: string; keys: { auth: string; p256dh: string } }, userAgent: string) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_auth: subscription.keys.auth, p_endpoint: subscription.endpoint, p_p256dh: subscription.keys.p256dh, p_user_agent: userAgent,
  });
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
  return { ok: true };
}

export async function markNotificationsRead() {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read");
  return { ok: true };
}

/** Owner: a notice to everyone, a store, a role, or one person. */
export async function sendBroadcast(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can send notifications." };
  const title = text(formData, "title", 80);
  const body = text(formData, "body", 500);
  if (!title) return { ok: false, message: "Write a short title." };
  const audience = text(formData, "audience", 20);
  const store = text(formData, "store", 60) || null;
  let ids: string[] = [];
  if (audience === "person") {
    const person = text(formData, "person", 60);
    if (!person) return { ok: false, message: "Choose the person." };
    ids = [person];
  } else {
    const roles = audience === "managers" ? (["manager", "cashier"] as const) : audience === "staff" ? (["staff"] as const) : (["manager", "cashier", "staff"] as const);
    ids = await storePeople(store ? [store] : null, [...roles]);
    if (audience === "everyone") ids.push(...(await ownerIds()));
  }
  const sent = await notifyUsers(ids, { body: body || null, createdBy: profile.id, kind: "broadcast", title: `📣 ${title}`, url: null });
  return sent ? { ok: true, message: `Sent to ${sent} ${sent === 1 ? "person" : "people"}.` } : { ok: false, message: "Nobody to send to (no logins in that group yet)." };
}

const categories = new Set<string>(requestCategories);

/** Staff, managers and cashiers: a request to the owners. */
export async function createRequest(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  const category = text(formData, "category", 20);
  const message = text(formData, "message", 1000);
  if (!categories.has(category)) return { ok: false, message: "Choose what it is about." };
  if (message.length < 3) return { ok: false, message: "Write a few words." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_team_request", { p_category: category, p_message: message });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not send. Please retry." };
  await notifyUsers(await ownerIds(), { body: message, createdBy: profile.id, kind: "request", title: `${categoryLabel[category]} from ${profile.full_name ?? "staff"}`, url: "/app/requests" });
  revalidatePath("/staff/requests");
  revalidatePath("/app/requests");
  return { ok: true, message: "Sent to the owner. You will get a notification when they reply." };
}

/** Owner: mark a request done / declined with an optional reply; the writer is notified. */
export async function answerRequest(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner answers requests." };
  const status = text(formData, "status", 10);
  const reply = text(formData, "reply", 600);
  const supabase = await createClient();
  const { data: writer, error } = await supabase.rpc("answer_team_request", { p_reply: reply, p_request: text(formData, "requestId", 60), p_status: status });
  if (error || !writer) return { ok: false, message: error?.code === "P0001" ? error.message : "Could not save. Please retry." };
  const admin = createAdminClient();
  const { data: person } = await admin!.from("profiles").select("role").eq("id", writer).maybeSingle();
  await notifyUsers([writer], {
    body: reply || (status === "done" ? "Your request is done." : "Your request was declined."),
    createdBy: profile.id, kind: "request_reply",
    title: status === "done" ? "✅ Owner replied to your request" : "Owner replied to your request",
    url: person?.role === "staff" ? "/staff/requests" : "/app/requests",
  });
  revalidatePath("/app/requests");
  return { ok: true, message: "Saved and sent." };
}
