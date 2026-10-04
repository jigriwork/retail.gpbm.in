import "server-only";

import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

export type DeliveryClaim = {
  dedupeKey: string;
  id: string;
};

export type DeliveryCandidate = {
  dedupeKey: string;
  initiatedBy: string;
  brandCode: "GP" | "BM";
  kind: "customer_follow_up" | "customer_thank_you" | "owner_summary" | "payslip";
  metadata?: Json;
  recipient: string;
  referenceId: string;
  storeId: string;
  templateName: string;
  unitCostInr: number;
};

export async function claimWhatsAppDeliveries(candidates: DeliveryCandidate[]) {
  const admin = createAdminClient();
  if (!admin || !candidates.length) return { claims: [] as DeliveryClaim[], skipped: candidates.length };

  const rows: TablesInsert<"whatsapp_deliveries">[] = candidates.map((candidate) => ({
    dedupe_key: candidate.dedupeKey,
    initiated_by: candidate.initiatedBy,
    brand_code: candidate.brandCode,
    kind: candidate.kind,
    metadata: candidate.metadata ?? {},
    recipient: candidate.recipient,
    reference_id: candidate.referenceId,
    status: "processing",
    store_id: candidate.storeId,
    template_name: candidate.templateName,
    unit_cost_inr: candidate.unitCostInr,
  }));
  const { data: inserted, error } = await admin
    .from("whatsapp_deliveries")
    .upsert(rows, { ignoreDuplicates: true, onConflict: "dedupe_key" })
    .select("id,dedupe_key");
  if (error) throw new Error("WhatsApp deliveries could not be reserved.");

  const claims = new Map((inserted ?? []).map((row) => [row.dedupe_key, row.id]));
  const missing = candidates.filter((candidate) => !claims.has(candidate.dedupeKey));
  if (missing.length) {
    const { data: existing } = await admin
      .from("whatsapp_deliveries")
      .select("id,dedupe_key,status,attempt_count")
      .in("dedupe_key", missing.map((candidate) => candidate.dedupeKey));
    for (const delivery of existing ?? []) {
      if (delivery.status !== "failed") continue;
      const { data: retried } = await admin
        .from("whatsapp_deliveries")
        .update({
          attempt_count: delivery.attempt_count + 1,
          error_code: null,
          failed_at: null,
          status: "processing",
        })
        .eq("id", delivery.id)
        .eq("status", "failed")
        .select("id,dedupe_key")
        .maybeSingle();
      if (retried) claims.set(retried.dedupe_key, retried.id);
    }
  }

  return { claims: [...claims.entries()].map(([dedupeKey, id]) => ({ dedupeKey, id })), skipped: candidates.length - claims.size };
}

export async function finishWhatsAppDeliveries(
  ids: string[],
  result: { errorCode?: string; ok: boolean; requestId?: string },
) {
  const admin = createAdminClient();
  if (!admin || !ids.length) return;
  const now = new Date().toISOString();
  const update = result.ok
    ? { accepted_at: now, error_code: null, provider_request_id: result.requestId ?? null, status: "accepted" }
    : { error_code: result.errorCode?.slice(0, 120) ?? "msg91_rejected", failed_at: now, status: "failed" };
  const { error } = await admin.from("whatsapp_deliveries").update(update).in("id", ids);
  if (error) console.error("whatsapp_delivery_finish_failed", { count: ids.length, status: result.ok ? "accepted" : "failed" });
}
