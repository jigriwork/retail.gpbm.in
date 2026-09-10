import { withDirectUpload, bindUpload } from "@/lib/uploads/server";
import "server-only";
import { createHash } from "node:crypto";
import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { parsePayslipWorkbook } from "@/lib/payslips/parser";
import { createClient } from "@/lib/supabase/server";
import { completeQuery } from "@/lib/supabase/complete-query";
import type { Json } from "@/lib/supabase/database.types";

export type PayrollComparison = { batch_id: string; file_name: string; legacy: boolean; rows: number; total: number; employees: { staff_name: string; store_id: string; net_payable: number }[] };
export type PayrollUploadState = { ok: boolean; message: string; importId?: string; token?: string; comparison?: PayrollComparison[]; proposedRows?: number; proposedTotal?: number; batchId?: string };
type Run = { id: string; status: string; batch_id?: string; file_path: string; comparison_token: string; comparison: PayrollComparison[]; proposed_rows: number; proposed_total: number };
const hash = (bytes: ArrayBuffer) => createHash("sha256").update(new Uint8Array(bytes)).digest("hex");

export async function processPayrollUpload(form: FormData): Promise<PayrollUploadState> {
  return withDirectUpload(form, "payroll", async (form) => {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner can import payroll." };
  const client = await createClient();
  const id = String(form.get("importId") ?? "");
  try {
    if (id) {
      const { data, error } = await client.rpc("commit_payroll_import", { p_import: id,
        p_confirm: form.get("confirmation") === "CREATE PAYROLL VERSION", p_token: String(form.get("token") ?? "") });
      if (error || !data) throw new Error("Finalization unavailable");
      const result = data as unknown as { ok: boolean; batch_id?: string; message?: string; comparison?: PayrollComparison[]; comparison_token?: string };
      if (result.ok) return { ok: true, message: "Payroll imported.", batchId: result.batch_id };
      const { data: run } = await client.from("payroll_imports").select("comparison,comparison_token,rows").eq("id", id).single();
      return { ok: false, message: result.message ?? "Payroll was not finalized. Review and retry.", importId: id,
        token: result.comparison_token ?? run?.comparison_token, comparison: (result.comparison ?? run?.comparison) as PayrollComparison[] };
    }
    const month = String(form.get("salaryMonth") ?? "");
    const file = form.get("file");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !(file instanceof File)) throw new Error("Invalid input");
    const stores = (await getAccessibleStores()).filter(store => ["GP", "BM"].includes(store.code));
    if (file.size > 15 * 1024 * 1024) throw new Error("File too large");
    const buffer = await file.arrayBuffer();
    const rows = await parsePayslipWorkbook({ buffer, fileName: file.name, mimeType: file.type, salaryMonth: `${month}-01`,
      stores, fallbackStoreId: String(form.get("fallbackStoreId") ?? "") });
    if (!rows.length || rows.length > 5000) throw new Error("Invalid row count");
    // Legacy sources are evidence: compare bytes read-only, never infer duplicates
    // from names/months or rewrite the original batches to backfill fingerprints.
    const { data: legacy } = await completeQuery(client.from("payslip_batches")
      .select("id,source_file_path", { count: "exact" }).eq("salary_month", `${month}-01`)
      .is("payroll_import_id", null).in("status", ["review", "generated", "partial"]));
    for (const batch of legacy) {
      if (!batch.source_file_path) return { ok: false, message: "An existing payroll source is unavailable. Restore access to the original before importing this month so duplicate detection can complete." };
      const source = await client.storage.from("payslips").download(batch.source_file_path, {}, { signal: AbortSignal.timeout(15000) });
      if (source.error || !source.data || source.data.size > 15 * 1024 * 1024)
        return { ok: false, message: "An existing payroll source could not be verified. Retry when the original is accessible; no new batch was created." };
      if (hash(await source.data.arrayBuffer()) === hash(buffer))
        return { ok: true, message: "Identical original workbook already imported. Existing payroll preserved.", batchId: batch.id };
    }
    const { data, error } = await client.rpc("prepare_payroll_import", { p_month: `${month}-01`,
      p_label: String(form.get("sourceLabel") ?? "monthly salary"), p_fingerprint: hash(buffer), p_file_name: file.name, p_rows: rows as Json });
    if (error || !data) throw new Error("Preparation unavailable");
    const run = data as unknown as Run;
    if (run.status === "processed") return { ok: true, message: "Identical workbook already imported.", batchId: run.batch_id };
    await bindUpload(file, run.id, true);
    if (run.comparison.length) return { ok: false, message: "Review existing payroll and confirm a new version. Legacy batches will remain separate.",
      importId: run.id, token: run.comparison_token, comparison: run.comparison, proposedRows: run.proposed_rows, proposedTotal: run.proposed_total };
    const finalized = await client.rpc("commit_payroll_import", { p_import: run.id });
    if (finalized.error || !finalized.data) throw new Error("Finalization unavailable");
    const result = finalized.data as unknown as { ok: boolean; batch_id?: string; message?: string };
    return { ok: result.ok, message: result.message ?? "Payroll imported.", batchId: result.batch_id, importId: result.ok ? undefined : run.id };
  } catch {
    return { ok: false, message: "Payroll import could not complete. Check file format, limits and store mapping, then retry the same workbook. No partial batch is published." };
  }
  });
}
