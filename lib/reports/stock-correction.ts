"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import type { CorrectionActionState } from "@/lib/reports/sales-correction";
import { createClient } from "@/lib/supabase/server";

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

  // Published reports can only change through database routines (direct
  // updates are revoked); archive_stock_report also writes the audit entry.
  const { data, error } = await supabase.rpc("archive_stock_report", { p_report: report.id });
  if (error) {
    const missing = error.code === "PGRST202" || error.code === "42883" || /archive_stock_report/i.test(error.message ?? "");
    return {
      ok: false,
      message: missing
        ? "Stock delete needs a one-time database update that is not installed yet. Nothing was changed."
        : "The stock report could not be deleted; nothing was changed.",
    };
  }
  if (!(data as { ok?: boolean } | null)?.ok) return { ok: false, message: "The stock report could not be deleted; nothing was changed." };

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
