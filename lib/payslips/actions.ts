"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { propagateEmployeePhone } from "@/lib/employees/actions";
import { appendWarning, normalizePhone, staffNameKey } from "@/lib/employees/utils";
import { parsePayslipWorkbook } from "@/lib/payslips/parser";
import { renderPayslipPdf } from "@/lib/payslips/pdf";
import { autoSyncReceivablesForBatch } from "@/lib/payslips/receivables";
import { payslipFileName } from "@/lib/payslips/utils";
import { createClient } from "@/lib/supabase/server";

export type PayslipActionState = {
  ok: boolean;
  message: string;
};

const allowedExtensions = [".xlsx", ".xls", ".csv"];
const sentMethods = new Set([
  "whatsapp_text",
  "whatsapp_pdf_share",
  "copy_message",
  "whatsapp_manual",
  "download_only",
  "other",
]);

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function sourceFileName(fileName: string) {
  return (
    fileName
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "salary-sheet"
  );
}

function monthInputToDate(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return "";
  }

  return `${value}-01`;
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

function cleanSentMethod(method?: string | null) {
  return method && sentMethods.has(method) ? method : "other";
}

async function getGeneratedPayslipForOwner(generatedPayslipId: string) {
  const session = await requireOwner();
  if (!session?.profile) {
    return { generated: null, message: "Only the owner can update payslip sent status.", profileId: null };
  }

  const supabase = await createClient();
  const { data: generated, error } = await supabase
    .from("generated_payslips")
    .select("id,batch_id,payslip_row_id")
    .eq("id", generatedPayslipId)
    .maybeSingle();

  if (error || !generated) {
    return { generated: null, message: error?.message ?? "Generated payslip not found.", profileId: session.profile.id };
  }

  return { generated, message: "", profileId: session.profile.id };
}

export async function recordPayslipShareAttempt(generatedPayslipId: string, method: string) {
  const { generated, message } = await getGeneratedPayslipForOwner(generatedPayslipId);
  if (!generated) {
    return { ok: false, message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("generated_payslips")
    .update({
      last_share_attempt_at: new Date().toISOString(),
      last_share_method: cleanSentMethod(method),
    })
    .eq("id", generatedPayslipId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await refreshPayslipPaths(generated.batch_id, generated.payslip_row_id);
  return { ok: true, message: "Share attempt recorded." };
}

export async function markPayslipSent(generatedPayslipId: string, method = "whatsapp_manual") {
  const { generated, message, profileId } = await getGeneratedPayslipForOwner(generatedPayslipId);
  if (!generated || !profileId) {
    return { ok: false, message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("generated_payslips")
    .update({
      sent_at: new Date().toISOString(),
      sent_by: profileId,
      sent_method: cleanSentMethod(method),
      sent_note: null,
      sent_status: "sent",
    })
    .eq("id", generatedPayslipId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await refreshPayslipPaths(generated.batch_id, generated.payslip_row_id);
  return { ok: true, message: "Payslip marked sent." };
}

export async function markPayslipWhatsAppTextSent(generatedPayslipId: string) {
  const { generated, message, profileId } = await getGeneratedPayslipForOwner(generatedPayslipId);
  if (!generated || !profileId) {
    return { ok: false, message };
  }

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("generated_payslips")
    .update({
      last_share_attempt_at: now,
      last_share_method: "whatsapp_text",
      sent_at: now,
      sent_by: profileId,
      sent_method: "whatsapp_text",
      sent_note: null,
      sent_status: "sent",
    })
    .eq("id", generatedPayslipId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await refreshPayslipPaths(generated.batch_id, generated.payslip_row_id);
  return { ok: true, message: "Marked sent when WhatsApp text opened." };
}

export async function markPayslipNotSent(generatedPayslipId: string) {
  const { generated, message } = await getGeneratedPayslipForOwner(generatedPayslipId);
  if (!generated) {
    return { ok: false, message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("generated_payslips")
    .update({
      sent_at: null,
      sent_by: null,
      sent_method: null,
      sent_note: null,
      sent_status: "not_sent",
    })
    .eq("id", generatedPayslipId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await refreshPayslipPaths(generated.batch_id, generated.payslip_row_id);
  return { ok: true, message: "Payslip marked not sent." };
}

export async function markPayslipFailed(generatedPayslipId: string, note?: string) {
  const { generated, message, profileId } = await getGeneratedPayslipForOwner(generatedPayslipId);
  if (!generated || !profileId) {
    return { ok: false, message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("generated_payslips")
    .update({
      sent_at: new Date().toISOString(),
      sent_by: profileId,
      sent_method: "other",
      sent_note: note?.trim() || null,
      sent_status: "failed",
    })
    .eq("id", generatedPayslipId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await refreshPayslipPaths(generated.batch_id, generated.payslip_row_id);
  return { ok: true, message: "Payslip marked failed." };
}

export async function markPayslipSkipped(generatedPayslipId: string, note?: string) {
  const { generated, message, profileId } = await getGeneratedPayslipForOwner(generatedPayslipId);
  if (!generated || !profileId) {
    return { ok: false, message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("generated_payslips")
    .update({
      sent_at: new Date().toISOString(),
      sent_by: profileId,
      sent_method: "other",
      sent_note: note?.trim() || null,
      sent_status: "skipped",
    })
    .eq("id", generatedPayslipId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await refreshPayslipPaths(generated.batch_id, generated.payslip_row_id);
  return { ok: true, message: "Payslip marked skipped." };
}

async function generateOne(rowId: string) {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can generate payslips." };
  }

  const supabase = await createClient();
  const { data: row, error: rowError } = await supabase
    .from("payslip_rows")
    .select("*")
    .eq("id", rowId)
    .maybeSingle();

  if (rowError || !row) {
    return { ok: false, message: rowError?.message ?? "Payslip row not found." };
  }

  if (!isGeneratable(row.status)) {
    return { ok: false, message: "This row is missing required values and cannot be generated." };
  }

  if (!row.staff_name || !row.salary_amount || !row.store_id) {
    return { ok: false, message: "Staff name, salary amount and store are required." };
  }

  const pdfBytes = await renderPayslipPdf(row);
  const fileName = payslipFileName(row.store_name, row.staff_name, row.salary_month);
  const pdfPath = `generated/${row.batch_id}/${fileName}`;

  const { error: uploadError } = await supabase.storage.from("payslips").upload(
    pdfPath,
    new Blob([toArrayBuffer(pdfBytes)], { type: "application/pdf" }),
    {
      contentType: "application/pdf",
      upsert: true,
    },
  );

  if (uploadError) {
    return { ok: false, message: uploadError.message };
  }

  await supabase.from("generated_payslips").delete().eq("payslip_row_id", row.id);

  const { error: generatedError } = await supabase.from("generated_payslips").insert({
    batch_id: row.batch_id,
    employee_phone: row.employee_phone,
    firm_name: row.firm_name,
    payslip_row_id: row.id,
    pdf_file_name: fileName,
    pdf_file_path: pdfPath,
    salary_month: row.salary_month,
    staff_name: row.staff_name,
    status: "generated",
    store_id: row.store_id,
    store_name: row.store_name,
    whatsapp_phone: row.whatsapp_phone,
  });

  if (generatedError) {
    return { ok: false, message: generatedError.message };
  }

  await supabase.from("payslip_rows").update({ status: "generated" }).eq("id", row.id);
  if (row.batch_id) {
    const { count } = await supabase
      .from("generated_payslips")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", row.batch_id);
    const { data: batchRows } = await supabase
      .from("payslip_rows")
      .select("id,status")
      .eq("batch_id", row.batch_id);
    const generatedCount = count ?? 0;
    const validCount = (batchRows ?? []).filter((item) => isGeneratable(item.status)).length;

    await supabase
      .from("payslip_batches")
      .update({
        generated_count: generatedCount,
        status: generatedCount >= validCount && validCount > 0 ? "generated" : "partial",
      })
      .eq("id", row.batch_id);
  }

  // Auto-sync receivables for negative payslips
  if (row.batch_id && (row.net_payable ?? 0) < 0) {
    await autoSyncReceivablesForBatch(row.batch_id);
  }

  await refreshPayslipPaths(row.batch_id, row.id);
  return { ok: true, message: "Payslip generated." };
}

export async function uploadPayslipSalarySheet(formData: FormData) {
  const session = await requireOwner();
  if (!session?.profile) {
    redirect("/app/payslips");
  }

  const salaryMonth = monthInputToDate(readString(formData, "salaryMonth"));
  const fallbackStoreId = readString(formData, "fallbackStoreId");
  const file = formData.get("file");

  if (!salaryMonth || !(file instanceof File) || file.size === 0) {
    redirect("/app/payslips/upload?error=missing");
  }

  const extension = fileExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    redirect("/app/payslips/upload?error=type");
  }

  const stores = await getAccessibleStores(session.profile);
  const validStores = stores.filter((store) => store.is_active && ["GP", "BM"].includes(store.code));
  const fallbackStore = validStores.find((store) => store.id === fallbackStoreId);
  const supabase = await createClient();
  const storagePath = `source-sheets/${salaryMonth.slice(0, 7)}/${Date.now()}-${sourceFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage.from("payslips").upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    redirect(`/app/payslips/upload?error=${encodeURIComponent(uploadError.message)}`);
  }

  const { data: batch, error: batchError } = await supabase
    .from("payslip_batches")
    .insert({
      salary_month: salaryMonth,
      source_file_name: file.name,
      source_file_path: storagePath,
      status: "review",
      uploaded_by: session.profile.id,
    })
    .select("*")
    .single();

  if (batchError || !batch) {
    await supabase.storage.from("payslips").remove([storagePath]);
    redirect(`/app/payslips/upload?error=${encodeURIComponent(batchError?.message ?? "Batch failed")}`);
  }

  const rows = parsePayslipWorkbook({
    buffer: await file.arrayBuffer(),
    fallbackStoreId: fallbackStore?.id,
    salaryMonth,
    stores: validStores,
  }).map((row) => ({ ...row, batch_id: batch.id }));

  const { data: contacts } = await supabase
    .from("employee_contacts")
    .select("*")
    .in("store_id", validStores.map((store) => store.id));
  const contactMap = new Map(
    (contacts ?? []).map((contact) => [
      `${contact.store_id ?? ""}:${contact.normalized_staff_name}`,
      contact,
    ]),
  );
  const contactsToCreate = new Map<string, {
    normalizedPhone: string | null;
    normalizedStaffName: string;
    staffName: string;
    storeId: string;
    whatsappPhone: string | null;
  }>();

  for (const row of rows) {
    if (!row.store_id || !row.staff_name) continue;

    const normalizedStaffName = staffNameKey(row.staff_name);
    const contactKey = `${row.store_id}:${normalizedStaffName}`;
    const savedContact = contactMap.get(contactKey);
    const uploadedPhone = row.employee_phone ?? "";
    const uploadedWhatsappPhone = row.whatsapp_phone ?? uploadedPhone;

    if (!savedContact) {
      const pendingContact = contactsToCreate.get(contactKey);
      if (!pendingContact || (!pendingContact.normalizedPhone && uploadedPhone)) {
        contactsToCreate.set(contactKey, {
          normalizedPhone: uploadedPhone || pendingContact?.normalizedPhone || null,
          normalizedStaffName,
          staffName: row.staff_name,
          storeId: row.store_id,
          whatsappPhone: uploadedWhatsappPhone || pendingContact?.whatsappPhone || null,
        });
      }
      continue;
    }

    if (uploadedPhone) {
      if (!savedContact.normalized_phone) {
        await supabase
          .from("employee_contacts")
          .update({
            normalized_phone: uploadedPhone,
            phone: uploadedPhone,
            whatsapp_phone: uploadedWhatsappPhone,
          })
          .eq("id", savedContact.id);
        savedContact.normalized_phone = uploadedPhone;
        savedContact.phone = uploadedPhone;
        savedContact.whatsapp_phone = uploadedWhatsappPhone;
      } else if (
        (savedContact.whatsapp_phone ?? savedContact.normalized_phone) &&
        row.whatsapp_phone &&
        (savedContact.whatsapp_phone ?? savedContact.normalized_phone) !== row.whatsapp_phone
      ) {
        row.warning_message = appendWarning(
          row.warning_message,
          "Phone differs from saved employee contact.",
        );
      }

      continue;
    }

    if (savedContact.is_active !== false && savedContact.normalized_phone) {
      row.employee_phone = savedContact.normalized_phone;
      row.whatsapp_phone = savedContact.whatsapp_phone ?? savedContact.normalized_phone;
    }
  }

  if (contactsToCreate.size) {
    const { error: contactsError } = await supabase.from("employee_contacts").insert(
      [...contactsToCreate.values()].map((contact) => ({
        created_by: session.profile.id,
        is_active: true,
        normalized_phone: contact.normalizedPhone,
        normalized_staff_name: contact.normalizedStaffName,
        phone: contact.normalizedPhone,
        staff_name: contact.staffName,
        store_id: contact.storeId,
        whatsapp_phone: contact.whatsappPhone,
      })),
    );
    if (contactsError) {
      await supabase.from("payslip_batches").update({ status: "failed" }).eq("id", batch.id);
      redirect(`/app/payslips/upload?error=${encodeURIComponent(contactsError.message)}`);
    }
    revalidatePath("/app/employees");
  }

  if (rows.length) {
    const { error: rowsError } = await supabase.from("payslip_rows").insert(rows);
    if (rowsError) {
      await supabase.from("payslip_batches").update({ status: "failed" }).eq("id", batch.id);
      redirect(`/app/payslips/upload?error=${encodeURIComponent(rowsError.message)}`);
    }
  }

  const validRows = rows.filter((row) => isGeneratable(row.status)).length;
  const warningCount = rows.filter((row) => row.warning_message).length;
  await supabase
    .from("payslip_batches")
    .update({
      summary: {
        fallbackStoreName: fallbackStore?.name ?? "Auto detect",
        sourceFileName: file.name,
      },
      total_rows: rows.length,
      valid_rows: validRows,
      warning_count: warningCount,
    })
    .eq("id", batch.id);

  await refreshPayslipPaths(batch.id);
  redirect(`/app/payslips/${batch.id}`);
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
  const { data: rows } = await supabase
    .from("payslip_rows")
    .select("id,status")
    .eq("batch_id", batchId);
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
  return { ok: true, message: `Generated ${generated} payslip${generated === 1 ? "" : "s"}.` };
}

export async function updatePayslipRowPhone(
  _previous: PayslipActionState,
  formData: FormData,
): Promise<PayslipActionState> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can edit payslip phone numbers." };
  }

  const rowId = readString(formData, "rowId");
  const phoneInput = readString(formData, "phone");
  const phone = normalizePhone(phoneInput);

  if (!rowId) {
    return { ok: false, message: "Payslip row is required." };
  }

  if (phoneInput && !phone.isValid) {
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

  const normalizedStaffName = staffNameKey(row.staff_name);
  const { error: contactError } = await supabase.from("employee_contacts").upsert(
    {
      created_by: session.profile.id,
      is_active: true,
      normalized_phone: phone.employeePhone || null,
      normalized_staff_name: normalizedStaffName,
      phone: phone.employeePhone || null,
      staff_name: row.staff_name,
      store_id: row.store_id,
      whatsapp_phone: phone.whatsappPhone || null,
    },
    { onConflict: "store_id,normalized_staff_name" },
  );

  if (contactError) {
    return { ok: false, message: contactError.message };
  }

  await propagateEmployeePhone({
    employeePhone: phone.employeePhone || null,
    normalizedStaffName,
    storeId: row.store_id,
    whatsappPhone: phone.whatsappPhone || null,
  });
  await refreshPayslipPaths(row.batch_id, rowId);
  revalidatePath("/app/employees");
  return { ok: true, message: "Phone saved." };
}
