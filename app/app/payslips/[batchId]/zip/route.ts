import { buildPayslipZip } from "@/lib/payslips/zip";
import { completeQuery } from "@/lib/supabase/complete-query";

import { formatMonth, salaryMonthFilePart } from "@/lib/payslips/utils";
import { createClient } from "@/lib/supabase/server";

async function isOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "owner" && profile.is_active === true;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  if (!(await isOwner())) {
    return new Response("Access denied", { status: 403 });
  }

  const { batchId } = await params;
  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("payslip_batches")
    .select("salary_month")
    .eq("id", batchId)
    .maybeSingle();
  const { data: generated } = await completeQuery(supabase
    .from("generated_payslips")
    .select("id,pdf_file_name,pdf_file_path", { count: "exact" })
    .eq("batch_id", batchId).eq("is_current", true)
    .order("pdf_file_name"));

  if (!batch || !generated?.length) {
    return new Response("No generated payslips found", { status: 404 });
  }

  const result = await buildPayslipZip(generated, (path, signal) => supabase.storage.from("payslips").download(path, {}, { signal }));
  if (!result.ok) return Response.json({ message: "ZIP not created: some PDFs failed to download. No files were silently omitted.", failedPdfIds: result.failures }, { status: 502 });
  const bytes = result.bytes;
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const fileName = `Payslips_${salaryMonthFilePart(batch.salary_month)}.zip`;

  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "application/zip",
      "X-Payslip-Month": formatMonth(batch.salary_month),
    },
  });
}
