"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import type { CorrectionActionState } from "@/lib/reports/sales-correction";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

function stockMonthLabel(periodMonth: string | null) {
  return periodMonth ? periodMonth.slice(0, 7) : "NO-MONTH";
}

/**
 * Owner deletes a wrong monthly stock report. Like sales deletes it archives:
 * the report stops being the current version, its rows and source file are
 * kept, and the store's manager can upload the right file for that month.
 */
export async function deleteStockReport(
  _previous: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const session = await requireOwner();
  if (!session?.profile) return { ok: false, message: "Only the owner can delete stock reports." };

  const reportId = formData.get("reportId");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (typeof reportId !== "string" || !reportId) return { ok: false, message: "Stock report was not found." };

  const supabase = await createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id,store_id,report_type,period_month,file_name,file_path,row_count,summary,is_current,stores(name)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report || report.report_type !== "stock") return { ok: false, message: "Stock report was not found." };
  if (!report.is_current) return { ok: true, message: "This stock report was already deleted." };

  const expectedPhrase = `DELETE STOCK ${stockMonthLabel(report.period_month)}`;
  if (confirmation.toUpperCase() !== expectedPhrase) {
    return { ok: false, expectedPhrase, message: `Type ${expectedPhrase} to delete this stock report.` };
  }

  const { data: archived, error } = await supabase
    .from("reports")
    .update({ is_current: false })
    .eq("id", report.id)
    .eq("is_current", true)
    .select("id");
  if (error || !archived?.length) return { ok: false, message: "The stock report could not be deleted; nothing was changed." };

  await supabase.from("audit_logs").insert({
    action: "delete_stock_report",
    actor_id: session.profile.id,
    actor_role: "owner",
    entity_id: report.id,
    entity_type: "report",
    metadata: {
      file_name: report.file_name,
      file_path: report.file_path,
      period_month: report.period_month,
      row_count: report.row_count,
      source_retained: true,
      summary: report.summary,
      version_retained: true,
    } as Json,
    store_id: report.store_id,
  });

  for (const path of ["/app/reports", "/app/reports/stock", "/app/reports/stock/analytics", "/app/reports/correction", "/app/today", "/app/checklist"]) {
    revalidatePath(path);
  }
  if (report.store_id) revalidatePath(`/app/stores/${report.store_id}`);

  const storeName = (report.stores as { name?: string } | null)?.name ?? "the store";
  return {
    ok: true,
    message: `Deleted. ${storeName}'s manager can now upload the correct stock file for ${stockMonthLabel(report.period_month)}.`,
  };
}
