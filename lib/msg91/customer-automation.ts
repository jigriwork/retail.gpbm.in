import "server-only";

import { normalizePhone } from "@/lib/employees/utils";
import { whatsappBudgetAllowance, whatsappUnitCost } from "@/lib/msg91/budget";
import { getMsg91TemplateStatus, sendMsg91Template, type Msg91Recipient } from "@/lib/msg91/client";
import { getMsg91Config } from "@/lib/msg91/config";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { createAdminClient } from "@/lib/supabase/server";

type CustomerSale = {
  billNo?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  netSale?: number | null;
};

export type CustomerAutomationResult = {
  detail?: string;
  duplicates: number;
  eligible: number;
  failed: number;
  sent: number;
  skippedDoNotContact: number;
  skippedInvalidPhone: number;
  skippedWithoutConsent: number;
};

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function cleanName(value: string | null | undefined) {
  const name = value?.trim().replace(/\s+/g, " ");
  if (!name || /^(nil+|na|n\/a|cash|customer|walk ?in)$/i.test(name)) return "Customer";
  return name.split(" ")[0].slice(0, 80);
}

export async function sendAutomaticCustomerThanks(input: {
  initiatedBy: string;
  reportDate: string;
  reportId: string;
  rows: CustomerSale[];
  storeCode: string;
  storeId: string;
}): Promise<CustomerAutomationResult> {
  const result: CustomerAutomationResult = {
    duplicates: 0,
    eligible: 0,
    failed: 0,
    sent: 0,
    skippedDoNotContact: 0,
    skippedInvalidPhone: 0,
    skippedWithoutConsent: 0,
  };
  const config = getMsg91Config(input.storeCode);
  const admin = createAdminClient();
  if (!config || !admin) return { ...result, detail: "MSG91 is not fully configured for this store." };

  const customers = new Map<string, { localMobile: string; name: string; net: number }>();
  for (const row of input.rows) {
    if (!row.billNo || !row.customerPhone) continue;
    const phone = normalizePhone(row.customerPhone);
    if (!phone.isValid) {
      result.skippedInvalidPhone += 1;
      continue;
    }
    const localMobile = phone.whatsappPhone.slice(2);
    const current = customers.get(phone.whatsappPhone);
    customers.set(phone.whatsappPhone, {
      localMobile,
      name: current?.name !== "Customer" ? current?.name ?? cleanName(row.customerName) : cleanName(row.customerName),
      net: (current?.net ?? 0) + Number(row.netSale ?? 0),
    });
  }

  const purchases = [...customers.entries()].filter(([, customer]) => customer.net > 0);
  if (!purchases.length) return result;
  const { data: existingProfiles, error: existingProfilesError } = await admin
    .from("customer_profiles")
    .select("mobile,preferred_name,marketing_consent,do_not_contact")
    .in("mobile", purchases.map(([, customer]) => customer.localMobile));
  if (existingProfilesError) return { ...result, failed: purchases.length, detail: "Customer consent could not be checked." };

  // Stores collect WhatsApp consent when a customer voluntarily provides a
  // mobile number at billing. Record that evidence for first-time customers,
  // but never overwrite an existing consent choice or do-not-contact record.
  const existingMobiles = new Set((existingProfiles ?? []).map((profile) => profile.mobile));
  const newProfiles = purchases.flatMap(([, customer]) => existingMobiles.has(customer.localMobile) ? [] : [{
    consent_at: new Date().toISOString(),
    consent_by: input.initiatedBy,
    consent_source: "in_store" as const,
    do_not_contact: false,
    marketing_consent: true,
    mobile: customer.localMobile,
    preferred_name: customer.name === "Customer" ? null : customer.name,
    note: "WhatsApp consent recorded at billing when the customer provided this mobile number.",
    updated_by: input.initiatedBy,
  }]);
  if (newProfiles.length) {
    const { error: consentError } = await admin.from("customer_profiles").insert(newProfiles);
    if (consentError) return { ...result, failed: purchases.length, detail: "Customer consent could not be recorded." };
    await admin.from("audit_logs").insert({
      action: "customer_consent_recorded_from_sales",
      actor_id: input.initiatedBy,
      actor_role: null,
      entity_id: input.reportId,
      entity_type: "sales_report",
      metadata: { customer_count: newProfiles.length, source: "in_store_billing" },
      report_date: input.reportDate,
      store_id: input.storeId,
    });
  }

  const { data: profiles, error: profilesError } = await admin
    .from("customer_profiles")
    .select("mobile,preferred_name,marketing_consent,do_not_contact")
    .in("mobile", purchases.map(([, customer]) => customer.localMobile));
  if (profilesError) return { ...result, failed: purchases.length, detail: "Customer consent could not be checked." };
  const profileByMobile = new Map((profiles ?? []).map((profile) => [profile.mobile, profile]));

  const eligible = purchases.flatMap(([recipient, customer]) => {
    const profile = profileByMobile.get(customer.localMobile);
    if (profile?.do_not_contact) {
      result.skippedDoNotContact += 1;
      return [];
    }
    // The approved purchase thank-you templates are classified as MARKETING
    // by WhatsApp, so automated sends require the consent already recorded in
    // the customer profile. Manual operational follow-up remains available.
    if (!profile?.marketing_consent) {
      result.skippedWithoutConsent += 1;
      return [];
    }
    return [{
      dedupeKey: `customer:${input.reportId}:${recipient}`,
      name: cleanName(profile.preferred_name ?? customer.name),
      recipient,
    }];
  });
  result.eligible = eligible.length;
  if (!eligible.length) return result;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentDeliveries, error: recentError } = await admin
    .from("whatsapp_deliveries")
    .select("recipient")
    .eq("store_id", input.storeId)
    .eq("kind", "customer_thank_you")
    .in("recipient", eligible.map((customer) => customer.recipient))
    .in("status", ["processing", "accepted", "delivered", "read"])
    .gte("created_at", thirtyDaysAgo);
  if (recentError) return { ...result, failed: eligible.length, detail: "Recent customer messages could not be checked." };
  const recentlyMessaged = new Set((recentDeliveries ?? []).map((delivery) => delivery.recipient));
  const frequencyEligible = eligible.filter((customer) => !recentlyMessaged.has(customer.recipient));
  result.duplicates += eligible.length - frequencyEligible.length;
  if (!frequencyEligible.length) return result;

  const templateStatus = await getMsg91TemplateStatus(config, config.customerTemplate);
  if (templateStatus !== "approved") {
    return { ...result, failed: eligible.length, detail: `Customer template is ${templateStatus} in MSG91.` };
  }

  const budget = await whatsappBudgetAllowance(input.storeId, "customer_thank_you", frequencyEligible.length);
  const budgetEligible = frequencyEligible.slice(0, budget.allowed);
  if (!budgetEligible.length) return { ...result, detail: "The monthly WhatsApp customer-message budget is reserved or exhausted." };
  const reservation = await claimWhatsAppDeliveries(budgetEligible.map((customer) => ({
    brandCode: config.brand,
    dedupeKey: customer.dedupeKey,
    initiatedBy: input.initiatedBy,
    kind: "customer_thank_you",
    metadata: { report_date: input.reportDate },
    recipient: customer.recipient,
    referenceId: input.reportId,
    storeId: input.storeId,
    templateName: config.customerTemplate,
    unitCostInr: whatsappUnitCost("customer_thank_you"),
  })));
  result.duplicates += reservation.skipped;
  const claimByKey = new Map(reservation.claims.map((claim) => [claim.dedupeKey, claim.id]));
  const claimed = budgetEligible.filter((customer) => claimByKey.has(customer.dedupeKey));

  for (const batch of chunks(claimed, 50)) {
    const recipients: Msg91Recipient[] = batch.map((customer) => ({
      components: { body_1: { type: "text", value: customer.name } },
      to: customer.recipient,
    }));
    const sent = await sendMsg91Template(config, config.customerTemplate, recipients);
    const deliveryIds = batch.map((customer) => claimByKey.get(customer.dedupeKey)!).filter(Boolean);
    await finishWhatsAppDeliveries(deliveryIds, sent);
    if (!sent.ok) {
      result.failed += batch.length;
      continue;
    }
    result.sent += batch.length;
    const { error: logError } = await admin.from("customer_messages").insert(batch.map((customer) => ({
      kind: "thank_you",
      mobile: customer.recipient.slice(-10),
      sent_by: input.initiatedBy,
      store_id: input.storeId,
    })));
    if (logError) console.error("customer_message_log_failed", { count: batch.length, reportId: input.reportId });
  }

  return result;
}
