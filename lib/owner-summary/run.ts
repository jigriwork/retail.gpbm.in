import "server-only";

import { whatsappUnitCost } from "@/lib/msg91/budget";
import { getMsg91TemplateStatus, sendMsg91Template } from "@/lib/msg91/client";
import { getMsg91Config } from "@/lib/msg91/config";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { OWNER_SUMMARY_TEMPLATES, type OwnerSummaryFacts } from "@/lib/owner-summary/format";
import { createAdminClient } from "@/lib/supabase/server";

// Sent from the Go Planet number; covers every store in one message.
const SENDER = "GP" as const;
const MAX_RECIPIENTS = 5;

function indiaNow(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function previousDay(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function ownerSummaryRecipients() {
  return (process.env.MSG91_OWNER_SUMMARY_RECIPIENTS ?? "")
    .split(",").map((value) => value.replace(/\D/g, "")).filter((value) => /^91[6-9]\d{9}$/.test(value))
    .slice(0, MAX_RECIPIENTS);
}

/**
 * Sends yesterday's summary (the 9 AM run). `day` sends a chosen past day on
 * request, e.g. a first report once the template is approved; each day still
 * goes to each recipient only once.
 */
export async function runOwnerDailySummary({ day: requestedDay, now = new Date(), preview = false }: { day?: string; now?: Date; preview?: boolean } = {}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Secure summary service is unavailable.");
  const india = indiaNow(now);
  if (requestedDay !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDay) || requestedDay >= india.date)) {
    return { day: requestedDay, detail: "Choose a past day as YYYY-MM-DD.", sent: 0 };
  }
  const day = requestedDay ?? previousDay(india.date);

  const { data, error } = await admin.rpc("owner_daily_summary_facts", { p_day: day });
  if (error || !data) throw new Error("Summary figures could not be loaded.");
  const facts = data as unknown as OwnerSummaryFacts;
  if (preview) {
    const [detailed, short] = OWNER_SUMMARY_TEMPLATES.map((template) => template.render(template.format(facts)));
    return { day, preview: detailed, previewShort: short, sent: 0 };
  }

  // pg_cron calls at 9:00; the Vercel backup runs later. Never send early.
  if (!requestedDay && india.minutes < 8 * 60 + 55) return { day, detail: "Before 9:00 AM IST; not sent.", sent: 0 };

  // MSG91_OWNER_SUMMARY_TEMPLATE switches the summary on; the detailed
  // template is used once WhatsApp approves it, the short one until then.
  const enabled = Boolean(process.env.MSG91_OWNER_SUMMARY_TEMPLATE?.trim());
  const recipients = ownerSummaryRecipients();
  const config = getMsg91Config(SENDER);
  if (!enabled || !recipients.length || !config) return { day, detail: "Owner summary is not configured.", sent: 0 };
  let chosen: (typeof OWNER_SUMMARY_TEMPLATES)[number] | undefined;
  const statuses: string[] = [];
  for (const candidate of OWNER_SUMMARY_TEMPLATES) {
    const status = await getMsg91TemplateStatus(config, candidate.name);
    statuses.push(`${candidate.name}: ${status}`);
    if (status === "approved") { chosen = candidate; break; }
  }
  if (!chosen) return { day, detail: `No approved summary template (${statuses.join(", ")}).`, sent: 0 };
  const template = chosen.name;
  const values = chosen.format(facts);

  const [{ data: store }, { data: owner }] = await Promise.all([
    admin.from("stores").select("id").eq("code", SENDER).maybeSingle(),
    admin.from("profiles").select("id").eq("role", "owner").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  if (!store || !owner) throw new Error("Summary sender store or owner could not be loaded.");

  const key = (recipient: string) => `owner-summary:${day}:${recipient}`;
  const reservation = await claimWhatsAppDeliveries(recipients.map((recipient) => ({
    brandCode: SENDER,
    dedupeKey: key(recipient),
    initiatedBy: owner.id,
    kind: "owner_summary",
    metadata: { day },
    recipient,
    referenceId: store.id,
    storeId: store.id,
    templateName: template,
    unitCostInr: whatsappUnitCost("owner_summary"),
  })));
  const claims = new Map(reservation.claims.map((claim) => [claim.dedupeKey, claim.id]));
  const claimed = recipients.filter((recipient) => claims.has(key(recipient)));
  if (!claimed.length) return { day, detail: "Already sent for this day.", sent: 0 };

  const components = Object.fromEntries(values.map((value, index) => [`body_${index + 1}`, { type: "text" as const, value }]));
  const delivery = await sendMsg91Template(config, template, claimed.map((recipient) => ({ components, to: recipient })));
  await finishWhatsAppDeliveries(claimed.map((recipient) => claims.get(key(recipient))!), delivery);
  return delivery.ok
    ? { day, sent: claimed.length }
    : { day, detail: delivery.errorCode ?? "MSG91 rejected the summary.", sent: 0 };
}
