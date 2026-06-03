"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { parsePayslipWorkbook } from "@/lib/payslips/parser";
import { renderPayslipPdf } from "@/lib/payslips/pdf";
import { payslipFileName } from "@/lib/payslips/utils";
import { createClient } from "@/lib/supabase/server";

export type PayslipActionState = {
  ok: boolean;
  message: string;
};

const allowedExtensions = [".xlsx", ".xls", ".csv"];

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
    firm_name: row.firm_name,
    payslip_row_id: row.id,
    pdf_file_name: fileName,
    pdf_file_path: pdfPath,
    salary_month: row.salary_month,
    staff_name: row.staff_name,
    status: "generated",
    store_id: row.store_id,
    store_name: row.store_name,
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

  await refreshPayslipPaths(batchId);
  return { ok: true, message: `Generated ${generated} payslip${generated === 1 ? "" : "s"}.` };
}
