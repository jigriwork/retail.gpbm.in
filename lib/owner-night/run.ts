import "server-only";

import { whatsappUnitCost } from "@/lib/msg91/budget";
import { getMsg91TemplateStatus, sendMsg91Template } from "@/lib/msg91/client";
import { getMsg91Config } from "@/lib/msg91/config";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { formatNightPlan, OWNER_NIGHT_TEMPLATE, renderNightPlan, type NightPlan } from "@/lib/owner-night/format";
import { ownerSummaryRecipients } from "@/lib/owner-summary/run";
import { createAdminClient } from "@/lib/supabase/server";

// Same number and recipients as the 9 AM summary; both stores in one message.
const SENDER = "GP" as const;

function indiaNow(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata", year: "numeric",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const nightPlanLink = (day: string) => `https://retail.gpbm.in/app/owner/night?day=${day}`;

/**
 * The 11 PM plan for tomorrow (today's facts). Sent once per night and
 * recipient, never before 10:55 PM IST, only when MSG91_OWNER_NIGHT_TEMPLATE
 * is set and WhatsApp has approved the template. ?preview returns the text.
 */
export async function runOwnerNightPlan({ day: requestedDay, now = new Date(), preview = false }: { day?: string; now?: Date; preview?: boolean } = {}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Secure summary service is unavailable.");
  const india = indiaNow(now);
  if (requestedDay !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDay) || requestedDay > india.date)) {
    return { day: requestedDay, detail: "Choose today or a past day as YYYY-MM-DD.", sent: 0 };
  }
  const day = requestedDay ?? india.date;
  const { data, error } = await admin.rpc("owner_night_plan_internal", { p_day: day, p_limit: 5 });
  if (error || !data) throw new Error("Night plan figures could not be loaded.");
  const values = formatNightPlan(data as unknown as NightPlan, nightPlanLink(day));
  if (preview) return { day, preview: renderNightPlan(values), sent: 0 };

  if (!requestedDay && india.minutes < 22 * 60 + 55) return { day, detail: "Before 11:00 PM IST; not sent.", sent: 0 };
  const enabled = Boolean(process.env.MSG91_OWNER_NIGHT_TEMPLATE?.trim());
  const recipients = ownerSummaryRecipients();
  const config = getMsg91Config(SENDER);
  if (!enabled || !recipients.length || !config) return { day, detail: "Night plan is not configured.", sent: 0 };
  const template = process.env.MSG91_OWNER_NIGHT_TEMPLATE!.trim() || OWNER_NIGHT_TEMPLATE;
  const status = await getMsg91TemplateStatus(config, template);
  if (status !== "approved") return { day, detail: `Template ${template} is ${status}.`, sent: 0 };

  const [{ data: store }, { data: owner }] = await Promise.all([
    admin.from("stores").select("id").eq("code", SENDER).maybeSingle(),
    admin.from("profiles").select("id").eq("role", "owner").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  if (!store || !owner) throw new Error("Night plan sender store or owner could not be loaded.");

  const key = (recipient: string) => `owner-night:${day}:${recipient}`;
  const reservation = await claimWhatsAppDeliveries(recipients.map((recipient) => ({
    brandCode: SENDER,
    dedupeKey: key(recipient),
    initiatedBy: owner.id,
    kind: "owner_night_plan",
    metadata: { day },
    recipient,
    referenceId: store.id,
    storeId: store.id,
    templateName: template,
    unitCostInr: whatsappUnitCost("owner_night_plan"),
  })));
  const claims = new Map(reservation.claims.map((claim) => [claim.dedupeKey, claim.id]));
  const claimed = recipients.filter((recipient) => claims.has(key(recipient)));
  if (!claimed.length) return { day, detail: "Already sent for this night.", sent: 0 };

  const components = Object.fromEntries(values.map((value, index) => [`body_${index + 1}`, { type: "text" as const, value }]));
  const delivery = await sendMsg91Template(config, template, claimed.map((recipient) => ({ components, to: recipient })));
  await finishWhatsAppDeliveries(claimed.map((recipient) => claims.get(key(recipient))!), delivery);
  return delivery.ok ? { day, sent: claimed.length } : { day, detail: delivery.errorCode ?? "MSG91 rejected the night plan.", sent: 0 };
}
