import "server-only";

import { indiaToday } from "@/lib/accounts/format";
import { whatsappBudgetAllowance, whatsappUnitCost } from "@/lib/msg91/budget";
import { getMsg91TemplateStatus, sendMsg91Template } from "@/lib/msg91/client";
import { getMsg91Config, type Msg91BrandConfig } from "@/lib/msg91/config";
import { cleanName } from "@/lib/msg91/customer-automation";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { createAdminClient } from "@/lib/supabase/server";

// One customer message through MSG91 (the "Send via WhatsApp API" buttons), and
// automatic resends of messages MSG91 accepted but never sent.

export type ApiMessageKind = "thank_you" | "lapsed_offer";

const kindMap = {
  lapsed_offer: { delivery: "customer_follow_up", template: (config: Msg91BrandConfig) => config.followupTemplate },
  thank_you: { delivery: "customer_thank_you", template: (config: Msg91BrandConfig) => config.customerTemplate },
} as const;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function customerFirstName(admin: Admin, mobile: string) {
  const [{ data: profile }, { data: sale }] = await Promise.all([
    admin.from("customer_profiles").select("preferred_name").eq("mobile", mobile).maybeSingle(),
    admin.from("sales_rows").select("customer_name").eq("customer_mobile", mobile).not("customer_name", "is", null)
      .order("sale_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return cleanName(profile?.preferred_name ?? sale?.customer_name);
}

async function sendOne(config: Msg91BrandConfig, template: string, recipient: string, name: string, claimId: string) {
  const delivery = await sendMsg91Template(config, template, [{ components: { body_1: { type: "text", value: name } }, to: recipient }]);
  await finishWhatsAppDeliveries([claimId], delivery);
  return delivery;
}

/** Sends a thank-you or "we miss you" to one customer through MSG91, with the same rules as the WhatsApp buttons. */
export async function sendCustomerTemplate(input: { initiatedBy: string; kind: ApiMessageKind; mobile: string; storeId: string }) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "WhatsApp sending is not configured." };
  const { data: store } = await admin.from("stores").select("id,code").eq("id", input.storeId).maybeSingle();
  const code = store?.code?.toUpperCase();
  const config = code === "GP" || code === "BM" ? getMsg91Config(code) : null;
  const map = kindMap[input.kind];
  const template = config ? map.template(config) : "";
  if (!store || !config || !template) return { ok: false, message: "MSG91 is not set up for this store." };

  const today = indiaToday();
  const [{ data: profile }, { data: purchase }] = await Promise.all([
    admin.from("customer_profiles").select("marketing_consent,do_not_contact").eq("mobile", input.mobile).maybeSingle(),
    admin.from("sales_rows").select("sale_date").eq("customer_mobile", input.mobile).eq("store_id", store.id)
      .order("sale_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!purchase) return { ok: false, message: "This customer has not bought at this store." };
  if (profile?.do_not_contact) return { ok: false, message: "This customer asked not to be contacted." };
  // Both approved templates are MARKETING in WhatsApp's eyes.
  if (!profile?.marketing_consent) return { ok: false, message: "Needs the customer's consent first (tick it on their page)." };
  if (input.kind === "thank_you" && (purchase.sale_date ?? "") < new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 864e5).toISOString().slice(0, 10)) {
    return { ok: false, message: "A thank-you is only for a purchase in the last 3 days." };
  }
  if ((await getMsg91TemplateStatus(config, template)) !== "approved") return { ok: false, message: "The WhatsApp template is not approved in MSG91." };
  const allowance = await whatsappBudgetAllowance(store.id, map.delivery, 1);
  if (!allowance.allowed) return { ok: false, message: "This store's WhatsApp budget for the month is used up." };

  const recipient = `91${input.mobile}`;
  const dedupeKey = `button:${input.kind}:${store.id}:${input.mobile}:${today}`;
  const { claims } = await claimWhatsAppDeliveries([{
    brandCode: config.brand, dedupeKey, initiatedBy: input.initiatedBy, kind: map.delivery, metadata: { source: "button" },
    recipient, referenceId: store.id, storeId: store.id, templateName: template, unitCostInr: whatsappUnitCost(map.delivery),
  }]);
  const claim = claims.find((item) => item.dedupeKey === dedupeKey);
  if (!claim) return { ok: false, message: "Already sent to this customer today." };

  const delivery = await sendOne(config, template, recipient, await customerFirstName(admin, input.mobile), claim.id);
  if (!delivery.ok) return { ok: false, message: `MSG91 did not accept it (${delivery.errorCode ?? "error"}). Try again.` };
  await admin.from("customer_messages").insert({ kind: input.kind, mobile: input.mobile, sent_by: input.initiatedBy, store_id: store.id });
  return { ok: true, message: "Sent through MSG91 ✓" };
}

function indiaHour() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
}

/**
 * Resends customer messages that MSG91 accepted but never sent (marked by the
 * log sync), one recipient per request, at most twice more, 9 AM–9 PM only.
 */
export async function retryDroppedMessages() {
  const admin = createAdminClient();
  if (!admin) return { retried: 0, sent: 0 };
  const hour = indiaHour();
  if (hour < 9 || hour >= 21) return { retried: 0, sent: 0, skipped: "outside_hours" };
  const { data: rows } = await admin.from("whatsapp_deliveries")
    .select("id,dedupe_key,kind,recipient,store_id,template_name,reference_id,initiated_by,brand_code,metadata,attempt_count")
    .eq("status", "failed").eq("error_code", "not_in_msg91_logs")
    .in("kind", ["customer_thank_you", "customer_follow_up"])
    .lt("attempt_count", 3)
    .gte("created_at", new Date(Date.now() - 3 * 864e5).toISOString())
    .limit(100);
  let sent = 0;
  for (const row of rows ?? []) {
    const config = row.brand_code === "GP" || row.brand_code === "BM" ? getMsg91Config(row.brand_code) : null;
    const mobile = row.recipient.slice(-10);
    if (!config || !row.initiated_by) continue;
    const { data: profile } = await admin.from("customer_profiles").select("marketing_consent,do_not_contact").eq("mobile", mobile).maybeSingle();
    if (profile?.do_not_contact || !profile?.marketing_consent) continue;
    const { claims } = await claimWhatsAppDeliveries([{
      brandCode: config.brand, dedupeKey: row.dedupe_key, initiatedBy: row.initiated_by, kind: row.kind as "customer_thank_you" | "customer_follow_up",
      recipient: row.recipient, referenceId: row.reference_id, storeId: row.store_id, templateName: row.template_name, unitCostInr: whatsappUnitCost(row.kind as "customer_thank_you"),
    }]);
    const claim = claims.find((item) => item.dedupeKey === row.dedupe_key);
    if (!claim) continue;
    const delivery = await sendOne(config, row.template_name, row.recipient, await customerFirstName(admin, mobile), claim.id);
    if (delivery.ok) sent += 1;
  }
  return { retried: rows?.length ?? 0, sent };
}
