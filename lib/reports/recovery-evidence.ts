import "server-only";
import type { Json, Tables } from "@/lib/supabase/database.types";

type SourceReport = Pick<Tables<"reports">,
  "id" | "file_name" | "file_path" | "sales_upload_batch_id" | "summary">;

// Source workbooks are permanent evidence. Keep the complete chain even after
// repeated corrections, without rewriting any existing report or Storage file.
export function recoverySources(report: SourceReport): Json[] {
  const summary = report.summary;
  const previous = summary && typeof summary === "object" && !Array.isArray(summary)
    && Array.isArray(summary.recovery_sources) ? summary.recovery_sources : [];
  return [...previous, {
    report_id: report.id,
    file_name: report.file_name,
    file_path: report.file_path,
    sales_upload_batch_id: report.sales_upload_batch_id,
  }];
}

export function correctedSummary(summary: Json, original: SourceReport): Json {
  return {
    ...(summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {}),
    recovery_sources: recoverySources(original),
  };
}
