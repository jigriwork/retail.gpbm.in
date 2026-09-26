import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth/session";
import { getSalaryGrantToken } from "@/lib/staff/portal";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireProfile();
  if (profile.role !== "staff") return new NextResponse("Not found", { status: 404 });
  const token = await getSalaryGrantToken();
  const supabase = await createClient();
  const [{ data: granted }, { data: employeeId }] = await Promise.all([
    supabase.rpc("validate_sensitive_access_grant", { p_purpose: "salary", p_token: token }),
    supabase.rpc("current_staff_employee_id"),
  ]);
  if (!granted || !employeeId) return new NextResponse("Recent password verification required", { status: 401 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("Unavailable", { status: 503 });
  const { id } = await params;
  const { data: payslip } = await admin.from("generated_payslips").select("pdf_file_name,pdf_file_path").eq("id", id).eq("employee_contact_id", employeeId).eq("is_current", true).maybeSingle();
  if (!payslip?.pdf_file_path) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await admin.storage.from("payslips").createSignedUrl(payslip.pdf_file_path, 60);
  if (error || !data.signedUrl) return new NextResponse("Unable to open payslip", { status: 500 });
  const file = await fetch(data.signedUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!file.ok) return new NextResponse("Unable to open payslip", { status: 502 });
  const contentLength = Number(file.headers.get("content-length") ?? 0);
  if (contentLength > 10 * 1024 * 1024) return new NextResponse("Payslip is too large", { status: 413 });
  const fileBytes = await file.arrayBuffer();
  if (fileBytes.byteLength > 10 * 1024 * 1024) return new NextResponse("Payslip is too large", { status: 413 });
  const safeName = (payslip.pdf_file_name ?? "payslip.pdf").replace(/[^a-zA-Z0-9._ -]/g, "_");
  return new NextResponse(fileBytes, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": `inline; filename="${safeName}"`, "Content-Type": "application/pdf", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
