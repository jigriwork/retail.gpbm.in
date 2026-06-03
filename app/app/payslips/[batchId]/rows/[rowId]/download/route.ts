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
  { params }: { params: Promise<{ batchId: string; rowId: string }> },
) {
  if (!(await isOwner())) {
    return new Response("Access denied", { status: 403 });
  }

  const { batchId, rowId } = await params;
  const supabase = await createClient();
  const { data: generated } = await supabase
    .from("generated_payslips")
    .select("pdf_file_name,pdf_file_path")
    .eq("batch_id", batchId)
    .eq("payslip_row_id", rowId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!generated?.pdf_file_path) {
    return new Response("Payslip PDF not found", { status: 404 });
  }

  const { data, error } = await supabase.storage.from("payslips").download(generated.pdf_file_path);
  if (error || !data) {
    return new Response(error?.message ?? "Payslip PDF not found", { status: 404 });
  }

  return new Response(data, {
    headers: {
      "Content-Disposition": `attachment; filename="${generated.pdf_file_name ?? "payslip.pdf"}"`,
      "Content-Type": "application/pdf",
    },
  });
}
