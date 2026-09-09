"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { propagateContactPhone, requirePhoneActor, requirePhoneStore, validatedEmployeePhone } from "@/lib/employees/phone-propagation";
import { staffNameKey } from "@/lib/employees/utils";
import { processPayrollUpload, type PayrollUploadState } from "@/lib/payslips/import";
import type { Tables } from "@/lib/supabase/database.types";
import { completeQuery } from "@/lib/supabase/complete-query";
import { renderPayslipPdf } from "@/lib/payslips/pdf";
import { autoSyncReceivablesForBatch } from "@/lib/payslips/receivables";
import { payslipFileName } from "@/lib/payslips/utils";
import { createClient } from "@/lib/supabase/server";

export type PayslipActionState = {
  ok: boolean;
  message: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isGeneratable(status?: string | null) {
  return status === "ready" || status === "total_mismatch" || status === "generated";
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function refreshPayslipPaths(batchId?: string | null, rowId?: string | null) {
  revalidatePath("/app/payslips");
  if (batchId) revalidatePath(`/app/payslips/${batchId}`);
  if (batchId && rowId) revalidatePath(`/app/payslips/${batchId}/rows/${rowId}`);
  revalidatePath("/app/reports");
  revalidatePath("/app/today");
}

async function deliveryEvent(id: string, kind: string, method: string, note?: string) {
  if (!(await requireOwner())) return { ok: false, message: "Owner required." };
  const client = await createClient();
  const { error } = await client.rpc("record_payslip_delivery", { p_generated: id, p_kind: kind, p_method: method, p_note: note ?? undefined });
  if (error) return { ok: false, message: "Delivery event could not be recorded." };
  const { data } = await client.from("generated_payslips").select("batch_id,payslip_row_id").eq("id", id).single();
  await refreshPayslipPaths(data?.batch_id, data?.payslip_row_id);
  return { ok: true, message: kind === "share_opened" ? "Share opened; delivery is not confirmed." : "Delivery status recorded." };
}
export async function recordPayslipShareAttempt(id: string, method: string) { return deliveryEvent(id, "share_opened", method); }
export async function markPayslipWhatsAppTextSent(id: string) { return deliveryEvent(id, "share_opened", "whatsapp_text"); }
export async function markPayslipSent(id: string, method = "whatsapp_manual") { return deliveryEvent(id, "sent", method); }
export async function markPayslipNotSent(id: string) { return deliveryEvent(id, "not_sent", "other"); }
export async function markPayslipFailed(id: string, note?: string) { return deliveryEvent(id, "failed", "other", note); }
export async function markPayslipSkipped(id: string, note?: string) { return deliveryEvent(id, "skipped", "other", note); }

async function generateOne(rowId: string) {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can generate payslips." };
  }

  const supabase = await createClient();
  try {
    const { data, error } = await supabase.rpc("begin_payslip_pdf", { p_row: rowId });
    if (error || !data) throw new Error("Generation unavailable");
    const job = data as unknown as { id: string; file_path: string; row_snapshot: Tables<"payslip_rows"> };
    const row = job.row_snapshot;
    const bytes = await renderPayslipPdf(row);
    const displayName = payslipFileName(row.store_name, row.staff_name ?? "Employee", row.salary_month).replace(/\.pdf$/i, "").slice(0, 110);
    const fileName = `${displayName}_${row.id}_${job.id}.pdf`;
    const upload = await supabase.storage.from("payslips").upload(job.file_path,
      new Blob([toArrayBuffer(bytes)], { type: "application/pdf" }), { upsert: false, contentType: "application/pdf" });
    if (upload.error) throw new Error("PDF upload failed");
    const finalized = await supabase.rpc("finish_payslip_pdf", { p_job: job.id, p_file_name: fileName });
    if (finalized.error) throw new Error("PDF finalization failed");
    await refreshPayslipPaths(row.batch_id, row.id);
    return { ok: true, message: "New PDF version generated. Previous PDFs and delivery history retained." };
  } catch {
    return { ok: false, message: "Generation failed. The last valid PDF remains active; retry generation." };
  }
}

export async function uploadPayslipSalarySheet(_previous: PayrollUploadState, form: FormData): Promise<PayrollUploadState> {
  const result = await processPayrollUpload(form);
  if (result.ok && result.batchId) {
    await refreshPayslipPaths(result.batchId);
    redirect(`/app/payslips/${result.batchId}`);
  }
  return result;
}

export async function generatePayslipForRow(
  _previous: PayslipActionState,
  formData: FormData,
): Promise<PayslipActionState> {
  const rowId = readString(formData, "rowId");
  if (!rowId) {
    return { ok: false, message: "Payslip row is required." };
  }

  return generateOne(rowId);
}

export async function generateAllPayslips(
  _previous: PayslipActionState,
  formData: FormData,
): Promise<PayslipActionState> {
  const batchId = readString(formData, "batchId");
  const session = await requireOwner();

  if (!session?.profile) {
    return { ok: false, message: "Only the owner can generate payslips." };
  }

  if (!batchId) {
    return { ok: false, message: "Payslip batch is required." };
  }

  const supabase = await createClient();
  const { data: rows } = await completeQuery(supabase
    .from("payslip_rows")
    .select("id,status", { count: "exact" })
    .eq("batch_id", batchId));
  const validRows = (rows ?? []).filter((row) => isGeneratable(row.status));

  if (!validRows.length) {
    return { ok: false, message: "No valid rows are available for generation." };
  }

  let generated = 0;
  for (const row of validRows) {
    const result = await generateOne(row.id);
    if (result.ok) generated += 1;
  }

  // Auto-sync receivables for any negative payslips in this batch
  await autoSyncReceivablesForBatch(batchId);

  await refreshPayslipPaths(batchId);
  return { ok: generated === validRows.length, message: `Generated ${generated} of ${validRows.length} payslips. ${validRows.length - generated} failed; previous PDFs remain available.` };
}

export async function updatePayslipRowPhone(
  _previous: PayslipActionState,
  formData: FormData,
): Promise<PayslipActionState> {
  const session = await requirePhoneActor();
  if (session.profile.role !== "owner") {
    return { ok: false, message: "Only the owner can edit payslip phone numbers." };
  }

  const rowId = readString(formData, "rowId");
  const phoneInput = readString(formData, "phone");

  if (!rowId) {
    return { ok: false, message: "Payslip row is required." };
  }

  try {
    validatedEmployeePhone(phoneInput);
  } catch {
    return { ok: false, message: "Enter a valid Indian mobile number." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("payslip_rows")
    .select("id,batch_id,staff_name,store_id,employee_phone,whatsapp_phone")
    .eq("id", rowId)
    .maybeSingle();

  if (!row) {
    return { ok: false, message: "Payslip row not found." };
  }

  if (!row.store_id || !row.staff_name) {
    return { ok: false, message: "Store and staff name are required to save phone permanently." };
  }

  await requirePhoneStore(row.store_id, session);
  const normalizedStaffName = staffNameKey(row.staff_name);
  const { data: contact, error: contactError } = await supabase.from("employee_contacts").upsert(
    {
      created_by: session.profile.id,
      is_active: true,
      normalized_staff_name: normalizedStaffName,
      staff_name: row.staff_name,
      store_id: row.store_id,
    },
    { onConflict: "store_id,normalized_staff_name" },
  ).select("id").single();

  if (contactError || !contact) {
    return { ok: false, message: contactError?.message ?? "Unable to save employee contact." };
  }

  await propagateContactPhone(contact.id, phoneInput);
  await refreshPayslipPaths(row.batch_id, rowId);
  revalidatePath("/app/employees");
  return { ok: true, message: "Phone saved." };
}
