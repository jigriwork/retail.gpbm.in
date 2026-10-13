import "server-only";

import { getMsg91TemplateStatus } from "@/lib/msg91/client";
import type { Msg91BrandCode, Msg91BrandConfig } from "@/lib/msg91/config";
import { createAdminClient } from "@/lib/supabase/server";

// The purchase receipt replaces the marketing thank-you only after WhatsApp
// approved it AND the owner checked the test on their phone (button opens the
// Google review page) and tapped "Looks right".

export const receiptTemplateFor = (brand: Msg91BrandCode) =>
  process.env[`MSG91_${brand}_RECEIPT_TEMPLATE`]?.trim() || `${brand.toLowerCase()}_purchase_receipt_v2`;

export async function receiptStage(config: Msg91BrandConfig, storeId: string) {
  const admin = createAdminClient();
  const template = receiptTemplateFor(config.brand);
  const approved = (await getMsg91TemplateStatus(config, template)) === "approved";
  if (!admin || !approved) return { approved, confirmed: false, template, testSent: false };
  const { data } = await admin.from("audit_logs").select("action,metadata").eq("store_id", storeId)
    .in("action", ["receipt_test_sent", "receipt_confirmed"]).order("created_at", { ascending: false }).limit(20);
  const forTemplate = (data ?? []).filter((row) => (row.metadata as { template?: string } | null)?.template === template);
  return {
    approved,
    confirmed: forTemplate.some((row) => row.action === "receipt_confirmed"),
    template,
    testSent: forTemplate.some((row) => row.action === "receipt_test_sent"),
  };
}

/** The receipt template to use for this store right now, or null for the marketing thank-you. */
export async function liveReceiptTemplate(config: Msg91BrandConfig, storeId: string) {
  const stage = await receiptStage(config, storeId);
  return stage.approved && stage.confirmed ? stage.template : null;
}
