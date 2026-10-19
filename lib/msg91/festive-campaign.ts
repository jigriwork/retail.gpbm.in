import "server-only";

import { sendMsg91Template, type Msg91Component } from "@/lib/msg91/client";
import { getMsg91Config } from "@/lib/msg91/config";
import { cleanName } from "@/lib/msg91/customer-automation";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { createAdminClient } from "@/lib/supabase/server";

// Brand Mark festive offer (owner, 18 Oct): 1,100 were sent on 18 Oct; on
// 19 Oct the 30-minute WhatsApp job keeps sending down the list from 10 AM.
// The list lives in audit_logs (action festive_campaign_list). The owner wants
// the whole ₹1,500 used: failures MSG91 confirmed are not counted, so their
// money goes to the next customers on later runs, until the budget is spent.

const template = "bm_festive_welcome_v1";
const sendDay = "2026-10-19";
const budgetInr = 1500;
const rateInr = 0.8631;
const batchesPerRun = 10;
// Meta caps how many new people one number can message a day.
const dailyAttemptCap = 2500;
const ownerNumber = "917809790000";

const text = (value: string): Msg91Component => ({ type: "text", value });

export async function runFestiveCampaign() {
  const admin = createAdminClient();
  if (!admin) return { skipped: "not_configured" };
  const india = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if (india.toISOString().slice(0, 10) !== sendDay) return { skipped: "not_today" };
  if (india.getUTCHours() < 10 || india.getUTCHours() >= 21) return { skipped: "outside_hours" };

  const { data: done } = await admin.from("audit_logs").select("id").eq("action", "festive_campaign_done").limit(1);
  if (done?.length) return { skipped: "already_done" };
  const { data: listRow } = await admin.from("audit_logs").select("metadata,store_id,actor_id")
    .eq("action", "festive_campaign_list").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const meta = listRow?.metadata as { recipients?: Array<{ mobile: string; name: string | null }> } | null;
  const config = getMsg91Config("BM");
  if (!listRow?.store_id || !listRow.actor_id || !meta?.recipients?.length || !config) return { skipped: "no_list" };

  // The database returns at most 1,000 rows per request, so read every page:
  // a partial list would resend to people already messaged and misjudge the budget.
  const booked: Array<{ created_at: string; recipient: string; status: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("whatsapp_deliveries").select("recipient,status,created_at")
      .eq("kind", "customer_campaign").eq("template_name", template).order("id").range(from, from + 999);
    if (error) return { skipped: "deliveries_unavailable" };
    booked.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const already = new Set(booked.map((row) => row.recipient));
  const slots = Math.floor((budgetInr - booked.filter((row) => row.status !== "failed").length * rateInr + 1e-8) / rateInr);
  const attemptedToday = booked.filter((row) => row.created_at >= `${sendDay}T04:30:00Z`).length;
  const todo = meta.recipients.map((row) => ({ name: cleanName(row.name), recipient: `91${row.mobile}` }))
    .filter((row) => !already.has(row.recipient)).slice(0, Math.max(0, Math.min(slots, dailyAttemptCap - attemptedToday)));

  let sent = 0;
  let stopped: string | null = null;
  for (let index = 0; index < Math.min(todo.length, batchesPerRun * 50); index += 50) {
    const batch = todo.slice(index, index + 50);
    const reservation = await claimWhatsAppDeliveries(batch.map((row) => ({
      brandCode: "BM", dedupeKey: `campaign:${template}:${row.recipient}`, initiatedBy: listRow.actor_id!, kind: "customer_campaign",
      metadata: { campaign: template, source: "festive_oct_2026" }, recipient: row.recipient, referenceId: listRow.store_id!,
      storeId: listRow.store_id!, templateName: template, unitCostInr: rateInr,
    })));
    const claimByKey = new Map(reservation.claims.map((claim) => [claim.dedupeKey, claim.id]));
    const claimed = batch.filter((row) => claimByKey.has(`campaign:${template}:${row.recipient}`));
    if (!claimed.length) continue;
    const result = await sendMsg91Template(config, template, claimed.map((row) => ({ components: { body_1: text(row.name) }, to: row.recipient })));
    await finishWhatsAppDeliveries(claimed.map((row) => claimByKey.get(`campaign:${template}:${row.recipient}`)!), result);
    if (!result.ok) { stopped = result.errorCode ?? "msg91_rejected"; break; }
    sent += claimed.length;
  }

  // Done at the day's last run (8:30 PM), or when the list or Meta's daily cap
  // runs out; until then, each run spends money freed by confirmed failures.
  const listLeft = meta.recipients.filter((row) => !already.has(`91${row.mobile}`)).length - sent;
  const lastRun = india.getUTCHours() === 20 && india.getUTCMinutes() >= 25;
  const finished = stopped !== null || lastRun || listLeft <= 0 || attemptedToday + sent >= dailyAttemptCap;
  if (finished) {
    const { count } = await admin.from("whatsapp_deliveries").select("id", { count: "exact", head: true })
      .eq("kind", "customer_campaign").eq("template_name", template).neq("status", "failed");
    await admin.from("audit_logs").insert({
      action: "festive_campaign_done", actor_id: listRow.actor_id, actor_role: "owner", entity_id: null, entity_type: "whatsapp_deliveries",
      metadata: { sent_last_run: sent, stopped, template, total_not_failed: count ?? null }, store_id: listRow.store_id,
    });
    const gp = getMsg91Config("GP");
    if (gp) {
      await sendMsg91Template(gp, "gpbm_owner_night_plan_v2", [{ to: ownerNumber, components: {
        body_1: text("Brand Mark festive offer, day 2"),
        body_2: text(stopped ? `⚠️ Sending stopped: MSG91 refused a batch (${stopped})` : "✅ Day 2 messages sent automatically"),
        body_3: text(`Messages that went through, both days: ${count ?? "?"}`),
        body_4: text(`Spent about ₹${Math.round((count ?? 0) * rateInr)} of ₹${budgetInr}`), body_5: text("—"), body_6: text("—"), body_7: text("—"), body_8: text("—"),
        body_9: text("Counter staff: show message = flat 10% off or free gift, till 8 Nov"),
        body_10: text("https://retail.gpbm.in/app/customers/whatsapp"),
      } }]);
    }
  }
  return { remaining: Math.max(0, todo.length - sent), sent, slots, stopped };
}
