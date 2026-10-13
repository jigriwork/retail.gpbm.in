import "server-only";

import { whatsappUnitCost } from "@/lib/msg91/budget";
import { sendMsg91Template, type Msg91Component } from "@/lib/msg91/client";
import { getMsg91Config } from "@/lib/msg91/config";
import { cleanName } from "@/lib/msg91/customer-automation";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { receiptStage } from "@/lib/msg91/receipt-status";
import { createAdminClient } from "@/lib/supabase/server";

// Once WhatsApp approves a store's utility purchase receipt (owner, 13 Oct):
// 1) one test receipt to the owner, 2) the receipt to every customer whose
// thank-you failed in the last 14 days for a reason a utility message avoids
// (WhatsApp's marketing limit, its experiment group, or MSG91 dropping it).
// Runs once per store from the 30-minute WhatsApp job, 9 AM-9 PM only.

const ownerTestNumber = "917809790000";
const retryableFailure = /^(131049|130472|not_in_msg91_logs)/;

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

function receiptComponents(name: string, day: string, billNo: string): Record<string, Msg91Component> {
  return { body_1: { type: "text", value: name }, body_2: { type: "text", value: day }, body_3: { type: "text", value: billNo || "—" } };
}

export async function runReceiptBackfill() {
  const admin = createAdminClient();
  if (!admin) return { skipped: "not_configured" };
  const hour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
  if (hour < 9 || hour >= 21) return { skipped: "outside_hours" };
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  if (!owner) return { skipped: "no_owner" };
  const results: Record<string, unknown> = {};

  for (const brand of ["GP", "BM"] as const) {
    const config = getMsg91Config(brand);
    const { data: store } = await admin.from("stores").select("id").eq("code", brand).maybeSingle();
    if (!config || !store) continue;
    const stage = await receiptStage(config, store.id);
    const template = stage.template;
    if (!stage.approved) { results[brand] = "waiting_for_approval"; continue; }
    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 1) Test to the owner, once per template; customers wait for the owner's "Looks right".
    if (!stage.testSent) {
      await sendReceiptTest(brand, today);
      results[brand] = "test_sent";
      continue;
    }
    if (!stage.confirmed) { results[brand] = "waiting_for_owner_check"; continue; }
    const { data: done } = await admin.from("audit_logs").select("id,metadata").eq("action", "receipt_backfill_done").eq("store_id", store.id).limit(5);
    if ((done ?? []).some((row) => (row.metadata as { template?: string } | null)?.template === template)) { results[brand] = "already_done"; continue; }

    // 2) Customers whose thank-you failed in a way a receipt avoids.
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const { data: failed } = await admin.from("whatsapp_deliveries").select("id,recipient,error_code,created_at,metadata")
      .eq("store_id", store.id).eq("kind", "customer_thank_you").eq("status", "failed").gte("created_at", since).limit(2000);
    const candidates = (failed ?? []).filter((row) => retryableFailure.test(row.error_code ?? "") && row.recipient !== ownerTestNumber);
    const latestByRecipient = new Map<string, (typeof candidates)[number]>();
    for (const row of candidates) {
      const seen = latestByRecipient.get(row.recipient);
      if (!seen || seen.created_at < row.created_at) latestByRecipient.set(row.recipient, row);
    }
    const prepared: Array<{ components: Record<string, Msg91Component>; dedupeKey: string; recipient: string }> = [];
    for (const row of latestByRecipient.values()) {
      const mobile = row.recipient.slice(-10);
      // Skip anyone reached since, or who asked us to stop.
      const [{ data: later }, { data: profile }, { data: sale }] = await Promise.all([
        admin.from("whatsapp_deliveries").select("id").eq("recipient", row.recipient).eq("store_id", store.id)
          .in("status", ["accepted", "delivered", "read"]).gt("created_at", row.created_at).limit(1).maybeSingle(),
        admin.from("customer_profiles").select("preferred_name,do_not_contact").eq("mobile", mobile).maybeSingle(),
        admin.from("sales_rows").select("sale_date,bill_no,customer_name").eq("customer_mobile", mobile).eq("store_id", store.id)
          .lte("sale_date", row.created_at.slice(0, 10)).order("sale_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (later || profile?.do_not_contact || !sale?.sale_date) continue;
      prepared.push({
        components: receiptComponents(cleanName(profile?.preferred_name ?? sale.customer_name), dayLabel(sale.sale_date), sale.bill_no?.trim() ?? ""),
        dedupeKey: `receipt-backfill:${row.id}`,
        recipient: row.recipient,
      });
    }
    let sentCount = 0;
    for (let index = 0; index < prepared.length; index += 50) {
      const batch = prepared.slice(index, index + 50);
      const { claims } = await claimWhatsAppDeliveries(batch.map((item) => ({
        brandCode: brand, dedupeKey: item.dedupeKey, initiatedBy: owner.id, kind: "customer_thank_you" as const, metadata: { source: "receipt_backfill" },
        recipient: item.recipient, referenceId: store.id, storeId: store.id, templateName: template, unitCostInr: whatsappUnitCost("payslip"),
      })));
      const claimed = batch.filter((item) => claims.some((claim) => claim.dedupeKey === item.dedupeKey));
      if (!claimed.length) continue;
      const sent = await sendMsg91Template(config, template, claimed.map((item) => ({ components: item.components, to: item.recipient })));
      await finishWhatsAppDeliveries(claimed.map((item) => claims.find((claim) => claim.dedupeKey === item.dedupeKey)!.id), sent);
      if (sent.ok) sentCount += claimed.length;
    }
    await admin.from("audit_logs").insert({
      action: "receipt_backfill_done", actor_id: null, actor_role: null, entity_id: null, entity_type: "whatsapp_deliveries",
      metadata: { candidates: latestByRecipient.size, sent: sentCount, template }, store_id: store.id,
    });
    results[brand] = { candidates: latestByRecipient.size, sent: sentCount };
  }
  return results;
}

/** Sends the owner a sample receipt (also from the "Send test again" button). */
export async function sendReceiptTest(brand: "GP" | "BM", today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)) {
  const admin = createAdminClient();
  const config = getMsg91Config(brand);
  if (!admin || !config) return { ok: false, message: "WhatsApp is not configured." };
  const { data: store } = await admin.from("stores").select("id").eq("code", brand).maybeSingle();
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").eq("is_active", true).order("created_at").limit(1).maybeSingle();
  if (!store || !owner) return { ok: false, message: "Store or owner missing." };
  const stage = await receiptStage(config, store.id);
  if (!stage.approved) return { ok: false, message: "WhatsApp has not approved the receipt yet." };
  const dedupeKey = `receipt-test:${stage.template}:${Date.now()}`;
  const { claims } = await claimWhatsAppDeliveries([{
    brandCode: brand, dedupeKey, initiatedBy: owner.id, kind: "customer_thank_you", metadata: { test: true },
    recipient: ownerTestNumber, referenceId: store.id, storeId: store.id, templateName: stage.template, unitCostInr: whatsappUnitCost("payslip"),
  }]);
  const claim = claims.find((item) => item.dedupeKey === dedupeKey);
  if (!claim) return { ok: false, message: "Test could not start." };
  const sent = await sendMsg91Template(config, stage.template, [{ components: receiptComponents("Adib", dayLabel(today), "TEST-1"), to: ownerTestNumber }]);
  await finishWhatsAppDeliveries([claim.id], sent);
  await admin.from("audit_logs").insert({
    action: "receipt_test_sent", actor_id: null, actor_role: null, entity_id: null, entity_type: "whatsapp_deliveries",
    metadata: { ok: sent.ok, template: stage.template }, store_id: store.id,
  });
  return sent.ok ? { ok: true, message: "Test receipt sent to your WhatsApp." } : { ok: false, message: `MSG91 did not accept the test (${sent.errorCode ?? "error"}).` };
}
