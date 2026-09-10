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
  request: Request,
  { params }: { params: Promise<{ batchId: string; rowId: string }> },
) {
  if (!(await isOwner())) {
    return new Response("Access denied", { status: 403 });
  }

  const { batchId, rowId } = await params;
  const supabase = await createClient();
  const version = new URL(request.url).searchParams.get("version");
  let query = supabase
    .from("generated_payslips")
    .select("pdf_file_name,pdf_file_path")
    .eq("batch_id", batchId)
    .eq("payslip_row_id", rowId)
    .order("created_at", { ascending: false })
    .limit(1);
  query = version ? query.eq("id", version) : query.eq("is_current", true);
  const { data: generated } = await query.maybeSingle();

  if (!generated?.pdf_file_path) {
    return new Response("Payslip PDF not found", { status: 404 });
  }

  const { data, error } = await supabase.storage.from("payslips").createSignedUrl(generated.pdf_file_path, 60, { download: generated.pdf_file_name ?? "payslip.pdf" });
  if (error || !data) return new Response("Payslip download unavailable", { status: 404 });
  return Response.redirect(data.signedUrl, 303);
}
