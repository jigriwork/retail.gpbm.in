import { createClient } from "@/lib/supabase/server";

export async function getRecentPayslipBatches(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getPayslipBatch(batchId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  return data;
}

export async function getPayslipRows(batchId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_rows")
    .select("*, generated_payslips(*)")
    .eq("batch_id", batchId)
    .order("store_name")
    .order("staff_name");

  return data ?? [];
}

export async function getPayslipRow(rowId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_rows")
    .select("*, generated_payslips(*)")
    .eq("id", rowId)
    .maybeSingle();

  return data;
}
