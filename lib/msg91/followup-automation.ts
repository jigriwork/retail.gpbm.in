import "server-only";

import { whatsappBudgetAllowance, whatsappBudgetConfig, whatsappUnitCost } from "@/lib/msg91/budget";
import { getMsg91TemplateStatus, sendMsg91Template } from "@/lib/msg91/client";
import { getMsg91Config, type Msg91BrandCode } from "@/lib/msg91/config";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { createAdminClient } from "@/lib/supabase/server";

type StoreResult = {
  allowed: number;
  candidates: number;
  detail?: string;
  failed: number;
  sent: number;
  store: Msg91BrandCode;
};

function firstName(value: string | null) {
  const clean = value?.trim().replace(/\s+/g, " ");
  if (!clean || /^(nil+|na|n\/a|cash|customer|walk ?in)$/i.test(clean)) return "Customer";
  return clean.split(" ")[0].slice(0, 80);
}

function indiaMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}`;
}

export async function runCustomerFollowups() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Secure customer follow-up service is unavailable.");

  const [{ data: stores, error: storesError }, { data: owner, error: ownerError }] = await Promise.all([
    admin.from("stores").select("id,code").eq("is_active", true).in("code", ["GP", "BM"]),
    admin.from("profiles").select("id").eq("role", "owner").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  if (storesError || ownerError || !owner) throw new Error("Follow-up store or owner routing could not be loaded.");

  const settings = whatsappBudgetConfig();
  const month = indiaMonthKey();
  const results: StoreResult[] = [];

  for (const store of stores ?? []) {
    const code = store.code.toUpperCase();
    if (code !== "GP" && code !== "BM") continue;
    const base: StoreResult = { allowed: 0, candidates: 0, failed: 0, sent: 0, store: code };
    const config = getMsg91Config(code);
    if (!config?.followupTemplate) {
      results.push({ ...base, detail: "Follow-up template is not configured." });
      continue;
    }
    const status = await getMsg91TemplateStatus(config, config.followupTemplate);
    if (status !== "approved") {
      results.push({ ...base, detail: `Follow-up template is ${status}.` });
      continue;
    }

    const { data: candidates, error: candidateError } = await admin.rpc("customer_followup_candidates", {
      p_limit: Math.max(settings.dailyFollowupLimit * 3, 30),
      p_store: store.id,
    });
    if (candidateError) {
      results.push({ ...base, detail: "Candidates could not be loaded." });
      continue;
    }
    base.candidates = candidates?.length ?? 0;
    const allowance = await whatsappBudgetAllowance(store.id, "customer_follow_up", base.candidates);
    base.allowed = allowance.allowed;
    const selected = (candidates ?? []).slice(0, allowance.allowed);
    if (!selected.length) {
      results.push({ ...base, detail: base.candidates ? "Daily, monthly, or store budget limit reached." : "No eligible lapsed customers." });
      continue;
    }

    const reservation = await claimWhatsAppDeliveries(selected.map((customer) => ({
      brandCode: code,
      dedupeKey: `followup:${store.id}:${month}:${customer.mobile}`,
      initiatedBy: owner.id,
      kind: "customer_follow_up",
      metadata: { bills: customer.bills, last_visit: customer.last_visit, spend: customer.spend },
      recipient: `91${customer.mobile}`,
      referenceId: store.id,
      storeId: store.id,
      templateName: config.followupTemplate,
      unitCostInr: whatsappUnitCost("customer_follow_up"),
    })));
    const claimByKey = new Map(reservation.claims.map((claim) => [claim.dedupeKey, claim.id]));
    const claimed = selected.filter((customer) => claimByKey.has(`followup:${store.id}:${month}:${customer.mobile}`));
    if (!claimed.length) {
      results.push({ ...base, detail: "Eligible messages were already sent or in progress." });
      continue;
    }

    const delivery = await sendMsg91Template(config, config.followupTemplate, claimed.map((customer) => ({
      components: { body_1: { type: "text", value: firstName(customer.name) } },
      to: `91${customer.mobile}`,
    })));
    await finishWhatsAppDeliveries(
      claimed.map((customer) => claimByKey.get(`followup:${store.id}:${month}:${customer.mobile}`)!).filter(Boolean),
      delivery,
    );
    if (!delivery.ok) {
      results.push({ ...base, failed: claimed.length, detail: delivery.errorCode ?? "MSG91 rejected the batch." });
      continue;
    }
    base.sent = claimed.length;
    const { error: logError } = await admin.from("customer_messages").insert(claimed.map((customer) => ({
      kind: "lapsed_offer",
      mobile: customer.mobile,
      sent_by: owner.id,
      store_id: store.id,
    })));
    results.push({ ...base, ...(logError ? { detail: "Sent, but customer timeline logging needs review." } : {}) });
  }

  return { results, totalSent: results.reduce((sum, result) => sum + result.sent, 0) };
}
