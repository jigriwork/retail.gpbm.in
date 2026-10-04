"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { propagateContactPhone, requirePhoneActor, requirePhoneStore, validatedEmployeePhone } from "@/lib/employees/phone-propagation";
import { normalizePhone, staffNameKey } from "@/lib/employees/utils";
import { whatsappBudgetAllowance, whatsappUnitCost } from "@/lib/msg91/budget";
import { getMsg91TemplateStatus, sendMsg91Template, type Msg91Recipient } from "@/lib/msg91/client";
import { getMsg91Config, type Msg91BrandCode, type Msg91BrandConfig } from "@/lib/msg91/config";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { processPayrollUpload, type PayrollUploadState } from "@/lib/payslips/import";
import type { Tables } from "@/lib/supabase/database.types";
import { completeQuery } from "@/lib/supabase/complete-query";
import { renderPayslipPdf } from "@/lib/payslips/pdf";
import { autoSyncReceivablesForBatch } from "@/lib/payslips/receivables";
import { formatMonth, payslipFileName } from "@/lib/payslips/utils";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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

type PreparedPayslipDelivery = {
  config: Msg91BrandConfig;
  dedupeKey: string;
  documentUrl: string;
  generatedId: string;
  recipient: string;
  salaryMonth: string;
  staffName: string;
  storeId: string;
};

function batches<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export async function sendAllPayslips(
  _previous: PayslipActionState,
  formData: FormData,
): Promise<PayslipActionState> {
  const session = await requireOwner();
  if (!session?.profile) return { ok: false, message: "Only the owner can send payslips." };
  const batchId = readString(formData, "batchId");
  if (!batchId) return { ok: false, message: "Payslip batch is required." };

  const client = await createClient();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Secure server delivery is unavailable." };
  const { data: generated, error: generatedError } = await completeQuery(client
    .from("generated_payslips")
    .select("id,store_id,staff_name,salary_month,pdf_file_name,pdf_file_path,whatsapp_phone,sent_status,is_current", { count: "exact" })
    .eq("batch_id", batchId)
    .eq("is_current", true));
  if (generatedError || !generated?.length) return { ok: false, message: "Generate payslip PDFs before sending them." };

  const storeIds = [...new Set(generated.flatMap((item) => item.store_id ? [item.store_id] : []))];
  const { data: stores, error: storesError } = await admin.from("stores").select("id,code").in("id", storeIds);
  if (storesError) return { ok: false, message: "Store routing could not be loaded." };
  const storeCodes = new Map((stores ?? []).map((store) => [store.id, store.code.toUpperCase()]));
  const configurations = new Map<Msg91BrandCode, Msg91BrandConfig>();
  const unavailable = new Map<string, string>();
  for (const code of ["GP", "BM"] as const) {
    const config = getMsg91Config(code);
    if (!config) {
      unavailable.set(code, "not configured");
      continue;
    }
    const status = await getMsg91TemplateStatus(config, config.payslipTemplate);
    if (status !== "approved") {
      unavailable.set(code, status);
      continue;
    }
    configurations.set(code, config);
  }

  let alreadySent = 0;
  let missingPhone = 0;
  let missingPdf = 0;
  let unavailableCount = 0;
  const prepared: PreparedPayslipDelivery[] = [];
  for (const payslip of generated) {
    if (payslip.sent_status === "sent") {
      alreadySent += 1;
      continue;
    }
    const phone = normalizePhone(payslip.whatsapp_phone);
    if (!phone.isValid) {
      missingPhone += 1;
      continue;
    }
    if (!payslip.store_id || !payslip.pdf_file_path) {
      missingPdf += 1;
      continue;
    }
    const code = storeCodes.get(payslip.store_id);
    const config = code === "GP" || code === "BM" ? configurations.get(code) : null;
    if (!config) {
      unavailableCount += 1;
      continue;
    }
    const { data: signed, error: signedError } = await admin.storage.from("payslips").createSignedUrl(
      payslip.pdf_file_path,
      3600,
      { download: payslip.pdf_file_name ?? `salary-slip-${payslip.id}.pdf` },
    );
    if (signedError || !signed?.signedUrl) {
      missingPdf += 1;
      continue;
    }
    prepared.push({
      config,
      dedupeKey: `payslip:${payslip.id}`,
      documentUrl: signed.signedUrl,
      generatedId: payslip.id,
      recipient: phone.whatsappPhone,
      salaryMonth: payslip.salary_month,
      staffName: payslip.staff_name,
      storeId: payslip.store_id,
    });
  }

  let reservation: Awaited<ReturnType<typeof claimWhatsAppDeliveries>>;
  let budgetSkipped = 0;
  try {
    const budgeted: PreparedPayslipDelivery[] = [];
    for (const storeId of [...new Set(prepared.map((payslip) => payslip.storeId))]) {
      const storeRows = prepared.filter((payslip) => payslip.storeId === storeId);
      const allowance = await whatsappBudgetAllowance(storeId, "payslip", storeRows.length);
      budgeted.push(...storeRows.slice(0, allowance.allowed));
      budgetSkipped += storeRows.length - allowance.allowed;
    }
    reservation = await claimWhatsAppDeliveries(budgeted.map((payslip) => ({
      brandCode: payslip.config.brand,
      dedupeKey: payslip.dedupeKey,
      initiatedBy: session.profile.id,
      kind: "payslip",
      metadata: { batch_id: batchId },
      recipient: payslip.recipient,
      referenceId: payslip.generatedId,
      storeId: payslip.storeId,
      templateName: payslip.config.payslipTemplate,
      unitCostInr: whatsappUnitCost("payslip"),
    })));
  } catch {
    return { ok: false, message: "Payslip delivery could not start. Nothing was sent; please retry." };
  }
  const claimByKey = new Map(reservation.claims.map((claim) => [claim.dedupeKey, claim.id]));
  const claimed = prepared.filter((payslip) => claimByKey.has(payslip.dedupeKey));
  let sentCount = 0;
  let failedCount = 0;
  for (const code of ["GP", "BM"] as const) {
    const brandRows = claimed.filter((payslip) => payslip.config.brand === code);
    for (const batch of batches(brandRows, 50)) {
      const recipients: Msg91Recipient[] = batch.map((payslip) => ({
        components: {
          header_1: { type: "document", value: payslip.documentUrl },
          body_1: { type: "text", value: payslip.staffName.slice(0, 100) },
          body_2: { type: "text", value: formatMonth(payslip.salaryMonth) },
        },
        to: payslip.recipient,
      }));
      const delivery = await sendMsg91Template(batch[0].config, batch[0].config.payslipTemplate, recipients);
      await finishWhatsAppDeliveries(batch.map((payslip) => claimByKey.get(payslip.dedupeKey)!).filter(Boolean), delivery);
      await Promise.all(batch.map((payslip) => client.rpc("record_payslip_delivery", {
        p_generated: payslip.generatedId,
        p_kind: delivery.ok ? "sent" : "failed",
        p_method: "msg91_api",
        p_note: delivery.ok ? `MSG91 accepted${delivery.requestId ? ` (${delivery.requestId})` : ""}` : delivery.errorCode ?? "MSG91 rejected",
      })));
      if (delivery.ok) sentCount += batch.length;
      else failedCount += batch.length;
    }
  }

  await refreshPayslipPaths(batchId);
  const unavailableDetails = [...unavailable.entries()].map(([code, status]) => `${code} template ${status}`).join("; ");
  const details = [
    `${sentCount} accepted by MSG91`,
    `${alreadySent + reservation.skipped} already sent or in progress`,
    `${missingPhone} missing phone`,
    `${missingPdf} missing PDF`,
    `${budgetSkipped} held by store budget`,
    `${failedCount} failed`,
    ...(unavailableCount ? [`${unavailableCount} unavailable (${unavailableDetails || "store not configured"})`] : []),
  ];
  return {
    ok: sentCount > 0 && failedCount === 0 && unavailableCount === 0,
    message: `Payslip sending complete: ${details.join(" · ")}.`,
  };
}

export async function sendPayslip(
  generatedPayslipId: string,
): Promise<PayslipActionState> {
  const session = await requireOwner();
  if (!session?.profile) return { ok: false, message: "Only the owner can send payslips." };
  if (!generatedPayslipId) return { ok: false, message: "Payslip is required." };

  const client = await createClient();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Secure server delivery is unavailable." };

  const { data: payslip, error: payslipError } = await client
    .from("generated_payslips")
    .select("id,batch_id,payslip_row_id,store_id,staff_name,salary_month,pdf_file_name,pdf_file_path,whatsapp_phone,sent_status,is_current")
    .eq("id", generatedPayslipId)
    .eq("is_current", true)
    .maybeSingle();
  if (payslipError || !payslip) return { ok: false, message: "Current payslip was not found." };
  if (payslip.sent_status === "sent") return { ok: false, message: "This payslip is already marked as sent." };

  const phone = normalizePhone(payslip.whatsapp_phone);
  if (!phone.isValid) return { ok: false, message: "Add a valid 10-digit Indian mobile number before sending." };
  if (!payslip.store_id || !payslip.pdf_file_path) return { ok: false, message: "Store or generated PDF is missing." };

  const { data: store, error: storeError } = await admin.from("stores").select("code").eq("id", payslip.store_id).maybeSingle();
  if (storeError || !store) return { ok: false, message: "Store routing could not be loaded." };
  const code = store.code.toUpperCase();
  const config = code === "GP" || code === "BM" ? getMsg91Config(code) : null;
  if (!config) return { ok: false, message: "MSG91 is not configured for this staff member's brand." };
  const templateStatus = await getMsg91TemplateStatus(config, config.payslipTemplate);
  if (templateStatus !== "approved") return { ok: false, message: `The ${code} payslip template is ${templateStatus}; nothing was sent.` };

  const { data: signed, error: signedError } = await admin.storage.from("payslips").createSignedUrl(
    payslip.pdf_file_path,
    3600,
    { download: payslip.pdf_file_name ?? `salary-slip-${payslip.id}.pdf` },
  );
  if (signedError || !signed?.signedUrl) return { ok: false, message: "The payslip PDF could not be prepared; nothing was sent." };

  const dedupeKey = `payslip:${payslip.id}`;
  let reservation: Awaited<ReturnType<typeof claimWhatsAppDeliveries>>;
  try {
    const allowance = await whatsappBudgetAllowance(payslip.store_id, "payslip", 1);
    if (!allowance.allowed) {
      return { ok: false, message: `The ${code} store's monthly WhatsApp budget is reserved or exhausted; nothing was sent.` };
    }
    reservation = await claimWhatsAppDeliveries([{
      brandCode: config.brand,
      dedupeKey,
      initiatedBy: session.profile.id,
      kind: "payslip",
      metadata: { batch_id: payslip.batch_id },
      recipient: phone.whatsappPhone,
      referenceId: payslip.id,
      storeId: payslip.store_id,
      templateName: config.payslipTemplate,
      unitCostInr: whatsappUnitCost("payslip"),
    }]);
  } catch {
    return { ok: false, message: "Payslip delivery could not start. Nothing was sent; please retry." };
  }
  const claim = reservation.claims.find((item) => item.dedupeKey === dedupeKey);
  if (!claim) return { ok: false, message: "This payslip was already sent or is currently being sent." };

  const delivery = await sendMsg91Template(config, config.payslipTemplate, [{
    components: {
      header_1: { type: "document", value: signed.signedUrl },
      body_1: { type: "text", value: payslip.staff_name.slice(0, 100) },
      body_2: { type: "text", value: formatMonth(payslip.salary_month) },
    },
    to: phone.whatsappPhone,
  }]);
  await finishWhatsAppDeliveries([claim.id], delivery);
  await client.rpc("record_payslip_delivery", {
    p_generated: payslip.id,
    p_kind: delivery.ok ? "sent" : "failed",
    p_method: "msg91_api",
    p_note: delivery.ok ? `MSG91 accepted${delivery.requestId ? ` (${delivery.requestId})` : ""}` : delivery.errorCode ?? "MSG91 rejected",
  });
  await refreshPayslipPaths(payslip.batch_id, payslip.payslip_row_id);
  return delivery.ok
    ? { ok: true, message: `Payslip accepted by MSG91 and sent through the ${code} WhatsApp number.` }
    : { ok: false, message: `MSG91 did not accept the payslip (${delivery.errorCode ?? "unknown error"}). You can retry.` };
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
