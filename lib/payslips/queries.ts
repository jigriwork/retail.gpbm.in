import "server-only";
import { completeQuery, checkedQuery } from "@/lib/supabase/complete-query";
import { createClient } from "@/lib/supabase/server";

export async function getRecentPayslipBatches(limit = 8) {
  const supabase = await createClient();
  const { data } = await checkedQuery(supabase
    .from("payslip_batches")
    .select("*, generated_payslips(sent_status,is_current)")
    .eq("generated_payslips.is_current", true)
    .order("created_at", { ascending: false })
    .limit(limit));

  return data ?? [];
}

export async function getPayslipBatch(batchId: string) {
  const supabase = await createClient();
  const { data } = await checkedQuery(supabase
    .from("payslip_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle());

  return data;
}

export async function getPayslipRows(batchId: string) {
  const supabase = await createClient();
  const { data } = await completeQuery(supabase
    .from("payslip_rows")
    .select("*, generated_payslips(*)", { count: "exact" })
    .eq("generated_payslips.is_current", true)
    .eq("batch_id", batchId)
    .order("store_name")
    .order("staff_name"));

  return data ?? [];
}

export async function getPayslipRow(rowId: string) {
  const supabase = await createClient();
  const { data } = await checkedQuery(supabase
    .from("payslip_rows")
    .select("*, generated_payslips(*)", { count: "exact" })
    .eq("generated_payslips.is_current", true)
    .eq("id", rowId)
    .maybeSingle());

  return data;
}

export async function getPayslipPdfHistory(rowId: string) {
  const client = await createClient();
  const { data } = await completeQuery(client.from("generated_payslips")
    .select("id,pdf_file_name,is_current,created_at,sent_status,payslip_delivery_events(kind,method,created_at)", { count: "exact" })
    .eq("payslip_row_id", rowId).order("created_at", { ascending: false }));
  return data;
}

export async function getPayrollVersionsForBatch(batchId: string) {
  const client = await createClient();
  const { data } = await completeQuery(client.from("payroll_run_versions")
    .select("id,is_current,previous_id,payroll_runs(firm_name,source_label,stores(name))", { count: "exact" })
    .eq("batch_id", batchId));
  const previousIds = data.flatMap(version => version.previous_id ? [version.previous_id] : []);
  const previous = previousIds.length ? (await completeQuery(client.from("payroll_run_versions")
    .select("id,batch_id", { count: "exact" }).in("id", previousIds))).data : [];
  return data.map(version => ({ ...version, previousBatchId: previous.find(prior => prior.id === version.previous_id)?.batch_id }));
}
