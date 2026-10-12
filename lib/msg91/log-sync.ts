import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

// Pulls the real WhatsApp status of each message from MSG91's log report
// (kept for about four days), so delivered / read / failed show even when the
// webhook is off. A message MSG91 never logged is marked failed: MSG91
// sometimes accepts a bulk request and silently drops some recipients.

const logsUrl = "https://control.msg91.com/api/v5/report/logs/p/wa";
const lookbackDays = 4;
// Only these recent days count as complete enough to call a message dropped.
const droppedCheckDays = 2;
const notLoggedAfterMs = 2 * 60 * 60 * 1000;
const throttleMs = 5 * 60 * 1000;

type LogRow = {
  customerNumber?: string;
  deliveryTime?: { value?: string } | null;
  direction?: number | string;
  failureReason?: string | null;
  readTime?: { value?: string } | null;
  requestId?: string;
  status?: string | null;
  statusUpdatedAt?: string | null;
};

export type SyncResult = { checked: number; ok: boolean; skipped?: string; updated: number };

/** MSG91 reports times in India time without an offset. */
function indiaTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(`${value.trim().replace(" ", "T")}+05:30`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function indiaDay(offsetDays: number) {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000 - offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fetchDay(authKey: string, day: string): Promise<LogRow[] | null> {
  try {
    const response = await fetch(logsUrl, {
      body: JSON.stringify({ endDate: day, limit: 5000, startDate: day }),
      headers: { accept: "application/json", authkey: authKey, "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { data?: LogRow[]; metadata?: { total?: number } };
    const rows = Array.isArray(body.data) ? body.data : [];
    // An incomplete page would wrongly mark unlisted messages as dropped.
    if ((body.metadata?.total ?? rows.length) > rows.length) return null;
    return rows;
  } catch {
    return null;
  }
}

export async function syncWhatsAppStatuses({ force = false } = {}): Promise<SyncResult> {
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  const admin = createAdminClient();
  if (!authKey || !admin) return { checked: 0, ok: false, skipped: "not_configured", updated: 0 };

  if (!force) {
    const { data: last } = await admin.from("audit_logs").select("created_at").eq("action", "whatsapp_status_sync")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.created_at && Date.now() - Date.parse(last.created_at) < throttleMs) return { checked: 0, ok: true, skipped: "recent", updated: 0 };
  }

  const days = Array.from({ length: lookbackDays }, (_, index) => indiaDay(index));
  const pages = await Promise.all(days.map((day) => fetchDay(authKey, day)));
  if (pages.some((page) => page === null)) return { checked: 0, ok: false, skipped: "msg91_unavailable", updated: 0 };

  const logs = new Map<string, LogRow>();
  for (const row of pages.flat() as LogRow[]) {
    if (String(row.direction ?? "1") !== "1" || !row.requestId || !row.customerNumber) continue;
    logs.set(`${row.requestId}|${row.customerNumber.replace(/\D/g, "")}`, row);
  }

  const windowStart = new Date(Date.parse(`${days[days.length - 1]}T00:00:00+05:30`)).toISOString();
  const droppedStart = Date.parse(`${days[droppedCheckDays - 1]}T00:00:00+05:30`);
  const { data: rows, error } = await admin.from("whatsapp_deliveries")
    .select("id,recipient,provider_request_id,status,created_at,accepted_at")
    .gte("created_at", windowStart)
    .in("status", ["accepted", "delivered", "failed"])
    .not("provider_request_id", "is", null)
    .limit(5000);
  if (error) return { checked: 0, ok: false, skipped: "database", updated: 0 };

  const updates: Array<Record<string, string | null>> = [];
  for (const row of rows ?? []) {
    const log = logs.get(`${row.provider_request_id}|${row.recipient}`);
    if (!log) {
      // A resend keeps its row, so judge by when MSG91 last accepted it.
      const accepted = Date.parse(row.accepted_at ?? row.created_at);
      if (row.status === "accepted" && accepted >= droppedStart && Date.now() - accepted > notLoggedAfterMs) {
        updates.push({ error_code: "not_in_msg91_logs", failed_at: new Date().toISOString(), id: row.id, status: "failed" });
      }
      continue;
    }
    const status = (log.status ?? "").toLowerCase();
    if (status === "read") {
      updates.push({ delivered_at: indiaTime(log.deliveryTime?.value) ?? indiaTime(log.readTime?.value), id: row.id, read_at: indiaTime(log.readTime?.value), status: "read" });
    } else if (status === "delivered" && row.status !== "delivered") {
      updates.push({ delivered_at: indiaTime(log.deliveryTime?.value), id: row.id, status: "delivered" });
    } else if (status === "failed" && row.status === "accepted") {
      updates.push({ error_code: log.failureReason?.slice(0, 120) || "msg91_failed", failed_at: indiaTime(log.statusUpdatedAt), id: row.id, status: "failed" });
    }
  }

  let updated = 0;
  for (let index = 0; index < updates.length; index += 500) {
    const { data } = await admin.rpc("apply_whatsapp_status_updates", { p_updates: updates.slice(index, index + 500) as unknown as Json });
    updated += Number(data ?? 0);
  }
  await admin.from("audit_logs").insert({
    action: "whatsapp_status_sync", actor_id: null, actor_role: null, entity_id: null, entity_type: "whatsapp_deliveries",
    metadata: { checked: rows?.length ?? 0, logged: logs.size, updated },
  });
  return { checked: rows?.length ?? 0, ok: true, updated };
}
