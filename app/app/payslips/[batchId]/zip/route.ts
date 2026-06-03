import JSZip from "jszip";

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

  return profile?.role === "owner" && profile.is_active !== false;
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
  const { data: generated } = await supabase
    .from("generated_payslips")
    .select("pdf_file_name,pdf_file_path")
    .eq("batch_id", batchId)
    .order("pdf_file_name");

  if (!batch || !generated?.length) {
    return new Response("No generated payslips found", { status: 404 });
  }

  const zip = new JSZip();

  for (const item of generated) {
    if (!item.pdf_file_path) continue;

    const { data } = await supabase.storage.from("payslips").download(item.pdf_file_path);
    if (!data) continue;

    zip.file(item.pdf_file_name ?? item.pdf_file_path.split("/").at(-1) ?? "payslip.pdf", await data.arrayBuffer());
  }

  const bytes = await zip.generateAsync({ type: "uint8array" });
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
