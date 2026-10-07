import "server-only";

import webpush from "web-push";

import { VAPID_PUBLIC_KEY } from "@/lib/notifications/keys";
import { createAdminClient } from "@/lib/supabase/server";

export type NoticeKind = "alert" | "approval" | "broadcast" | "request" | "request_reply" | "task";
export type Notice = { body?: string | null; createdBy?: string | null; kind: NoticeKind; title: string; url?: string | null };

/** Quiet hours (10:30 PM – 9:00 AM India): notifications arrive without sound. */
export function isQuietHours(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: "Asia/Kolkata" }).formatToParts(now);
  const minutes = Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return minutes >= 22 * 60 + 30 || minutes < 9 * 60;
}

/**
 * Saves the notice in each person's 🔔 inbox, then pushes it to every phone /
 * browser they allowed. Never throws: a notice must not break the action
 * that caused it.
 */
export async function notifyUsers(userIds: Array<string | null | undefined>, notice: Notice) {
  try {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))].filter((id) => id !== notice.createdBy);
    const admin = createAdminClient();
    if (!ids.length || !admin) return 0;
    const title = notice.title.slice(0, 120);
    const body = notice.body?.slice(0, 600) ?? null;
    await admin.from("notifications").insert(ids.map((user_id) => ({ body, created_by: notice.createdBy ?? null, kind: notice.kind, title, url: notice.url ?? null, user_id })));

    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!privateKey) return ids.length;
    webpush.setVapidDetails("https://retail.gpbm.in", VAPID_PUBLIC_KEY, privateKey);
    const { data: subscriptions } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,failures").in("user_id", ids);
    const payload = JSON.stringify({ body, silent: isQuietHours(), tag: `${notice.kind}-${Date.now()}`, title, url: notice.url ?? "/" });
    await Promise.allSettled((subscriptions ?? []).map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { auth: subscription.auth, p256dh: subscription.p256dh } }, payload, { TTL: 12 * 3600, urgency: "high" });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // Gone (uninstalled / permission removed): forget this phone.
        if (status === 404 || status === 410 || subscription.failures >= 5) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        else await admin.from("push_subscriptions").update({ failures: subscription.failures + 1 }).eq("id", subscription.id);
      }
    }));
    return ids.length;
  } catch (error) {
    console.error("notify_failed", error instanceof Error ? error.message : "unknown");
    return 0;
  }
}

/** Active owners. */
export async function ownerIds() {
  const admin = createAdminClient();
  const { data } = await admin!.from("profiles").select("id").eq("role", "owner").eq("is_active", true);
  return (data ?? []).map((row) => row.id);
}

/** People of the chosen stores (all active stores when none): managers, cashiers and/or staff with a login. */
export async function storePeople(storeIds: string[] | null, roles: Array<"cashier" | "manager" | "staff">) {
  const admin = createAdminClient();
  if (!admin) return [];
  const ids: string[] = [];
  const team = roles.filter((role) => role !== "staff");
  if (team.length) {
    let query = admin.from("store_users").select("user_id, store_id, profiles!inner(role,is_active)").in("profiles.role", team).eq("profiles.is_active", true);
    if (storeIds) query = query.in("store_id", storeIds);
    const { data } = await query;
    ids.push(...(data ?? []).map((row) => row.user_id as string));
  }
  if (roles.includes("staff")) {
    let query = admin.from("employee_auth_links").select("auth_user_id").eq("status", "active");
    if (storeIds) query = query.in("store_id", storeIds);
    const { data } = await query;
    ids.push(...(data ?? []).map((row) => row.auth_user_id));
  }
  return [...new Set(ids)];
}

/** The login of a staff member (employee contact), if they have one. */
export async function staffUserId(employeeId: string | null | undefined) {
  if (!employeeId) return null;
  const admin = createAdminClient();
  const { data } = await admin!.from("employee_auth_links").select("auth_user_id").eq("employee_contact_id", employeeId).eq("status", "active").maybeSingle();
  return data?.auth_user_id ?? null;
}

/** A new task: the store's manager and cashier, and the staff member it is assigned to. */
export async function notifyTask(task: { assignedEmployeeId?: string | null; createdBy: string; isPrivate?: boolean; storeId?: string | null; title: string }) {
  if (task.isPrivate || !task.storeId) return;
  const [team, staff] = await Promise.all([storePeople([task.storeId], ["manager", "cashier"]), staffUserId(task.assignedEmployeeId)]);
  await notifyUsers(team, { body: task.title, createdBy: task.createdBy, kind: "task", title: "📋 New task", url: "/app/tasks" });
  if (staff) await notifyUsers([staff], { body: task.title, createdBy: task.createdBy, kind: "task", title: "📋 New task for you", url: "/staff/tasks" });
}
