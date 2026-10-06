import "server-only";

import { whatsappUnitCost } from "@/lib/msg91/budget";
import { createMsg91Template, getMsg91TemplateInfo, sendMsg91Template } from "@/lib/msg91/client";
import { getMsg91Config } from "@/lib/msg91/config";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { formatNightPlan, OWNER_NIGHT_TEMPLATES, renderNightPlan, type NightPlan } from "@/lib/owner-night/format";
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

/** The newest approved template, preferring one WhatsApp classed as utility. */
async function chooseTemplate(config: NonNullable<ReturnType<typeof getMsg91Config>>) {
  const infos = await Promise.all(OWNER_NIGHT_TEMPLATES.map(async (template) => ({ ...template, ...(await getMsg91TemplateInfo(config, template.name)) })));
  const approved = infos.filter((info) => info.status === "approved");
  return (approved.find((info) => info.category?.toUpperCase() === "UTILITY") ?? approved[0])?.name ?? null;
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
  if (preview) return { day, preview: renderNightPlan(values, OWNER_NIGHT_TEMPLATES[0].body), sent: 0 };

  if (!requestedDay && india.minutes < 22 * 60 + 55) return { day, detail: "Before 11:00 PM IST; not sent.", sent: 0 };
  const enabled = Boolean(process.env.MSG91_OWNER_NIGHT_TEMPLATE?.trim());
  const recipients = ownerSummaryRecipients();
  const config = getMsg91Config(SENDER);
  if (!enabled || !recipients.length || !config) return { day, detail: "Night plan is not configured.", sent: 0 };
  const template = await chooseTemplate(config);
  if (!template) return { day, detail: "No approved night plan template.", sent: 0 };

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

// Example values Meta reviews with the template.
const TEMPLATE_EXAMPLES = [
  "Wed 7 Oct",
  "GP ✅ uploaded · BM ✅ uploaded",
  "GP: US Polo shirt 4 pcs, only XL XXL left · BM: Mufti jeans 7 pcs, selling well at GP",
  "GP: Lunica top XL (0 left, 3 sold in 30 days)",
  "Mufti jeans 7 pcs BM→GP",
  "Biswanath (GP) top seller of the week",
  "Deva (GP) 1.3 items per bill (store 1.9)",
  "Akhtar (GP) no sale in 3 days, maybe a day off?",
  "1) GP: Lunica top XL could come from BM 2) a supportive chat with Deva",
  "https://retail.gpbm.in/app/owner/night?day=2026-10-06",
];

/** Submits the night plan templates to MSG91 / WhatsApp (each once); reports their status and category. */
export async function setupOwnerNightTemplate() {
  const config = getMsg91Config(SENDER);
  if (!config) return { detail: "MSG91 is not configured for GP." };
  const results = [];
  for (const template of OWNER_NIGHT_TEMPLATES) {
    const before = await getMsg91TemplateInfo(config, template.name);
    if (before.status === "not_found") {
      const created = await createMsg91Template(config, { body: template.body, category: "UTILITY", examples: TEMPLATE_EXAMPLES, name: template.name });
      results.push({ created: created.ok, name: template.name, ...(await getMsg91TemplateInfo(config, template.name)) });
    } else results.push({ name: template.name, ...before });
  }
  return { templates: results, using: await chooseTemplate(config), summary: await getMsg91TemplateInfo(config, "gpbm_owner_daily_summary_v2") };
}

/**
 * One test message of today's plan to a single number, outside the nightly
 * once-per-night record (so tonight's 11 PM message still goes).
 */
export async function sendOwnerNightTest(number: string) {
  const to = number.replace(/\D/g, "").replace(/^(?=[6-9]\d{9}$)/, "91");
  if (!/^91[6-9]\d{9}$/.test(to)) return { detail: "Give a 10-digit Indian mobile number.", sent: 0 };
  const admin = createAdminClient();
  const config = getMsg91Config(SENDER);
  if (!admin || !config) return { detail: "Not configured.", sent: 0 };
  const template = await chooseTemplate(config);
  if (!template) return { detail: "No approved night plan template.", sent: 0 };
  const day = indiaNow(new Date()).date;
  const { data, error } = await admin.rpc("owner_night_plan_internal", { p_day: day, p_limit: 5 });
  if (error || !data) throw new Error("Night plan figures could not be loaded.");
  const values = formatNightPlan(data as unknown as NightPlan, nightPlanLink(day));
  const [{ data: store }, { data: owner }] = await Promise.all([
    admin.from("stores").select("id").eq("code", SENDER).maybeSingle(),
    admin.from("profiles").select("id").eq("role", "owner").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  if (!store || !owner) throw new Error("Sender store or owner could not be loaded.");
  const dedupeKey = `owner-night-test:${Date.now()}:${to}`;
  const reservation = await claimWhatsAppDeliveries([{
    brandCode: SENDER, dedupeKey, initiatedBy: owner.id, kind: "owner_night_plan", metadata: { day, test: true }, recipient: to,
    referenceId: store.id, storeId: store.id, templateName: template, unitCostInr: whatsappUnitCost("owner_night_plan"),
  }]);
  const claim = reservation.claims.find((item) => item.dedupeKey === dedupeKey);
  if (!claim) return { detail: "Could not record the test message.", sent: 0 };
  const components = Object.fromEntries(values.map((value, index) => [`body_${index + 1}`, { type: "text" as const, value }]));
  const delivery = await sendMsg91Template(config, template, [{ components, to }]);
  await finishWhatsAppDeliveries([claim.id], delivery);
  return delivery.ok ? { day, sent: 1 } : { day, detail: delivery.errorCode ?? "MSG91 rejected the message.", sent: 0 };
}
