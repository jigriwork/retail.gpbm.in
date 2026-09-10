"use server";
import { withDirectUpload } from "@/lib/uploads/server";

import { readSpreadsheet, spreadsheetLimits } from "@/lib/spreadsheets/read";
import { importReportFile } from "@/lib/reports/import-lifecycle";
import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import { completeMatchingTasksAroundDate } from "@/lib/tasks/auto-complete";
import { getIndiaMonthStart } from "@/lib/tasks/dates";

export type SalaryAttendanceUploadState = {
  ok: boolean;
  message: string;
  summary?: {
    storeName: string;
    periodMonth: string;
    fileName: string;
  };
};

const allowedExtensions = [".xlsx", ".xls", ".csv", ".pdf"];

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function monthInputToPeriodMonth(monthInput: string) {
  if (!/^\d{4}-\d{2}$/.test(monthInput)) {
    return "";
  }

  return `${monthInput}-01`;
}

export async function uploadSalaryAttendanceReport(
  _previous: SalaryAttendanceUploadState,
  formData: FormData,
): Promise<SalaryAttendanceUploadState> {
  return withDirectUpload(formData, "salary-attendance", async (formData) => {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { ok: false, message: "Your account is not active." };
  }

  const storeId = readString(formData, "storeId");
  const periodMonth = monthInputToPeriodMonth(readString(formData, "periodMonth"));
  const file = formData.get("file");

  if (!storeId) {
    return { ok: false, message: "Choose a store for this salary attendance report." };
  }

  if (!periodMonth) {
    return { ok: false, message: "Choose a valid salary attendance month." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a salary attendance file." };
  }

  const extension = fileExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, message: "Upload a .xlsx, .xls, .csv, or .pdf file." };
  }

  if (profile.role !== "owner" && !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You can upload salary attendance only for your assigned store." };
  }

  const stores = await getAccessibleStores(profile);
  const store = stores.find((item) => item.id === storeId);

  if (!store || store.is_active === false) {
    return { ok: false, message: "Choose an active Go Planet or Brand Mark store." };
  }

  try {
    if (file.size > spreadsheetLimits.bytes) throw new Error("File too large");
    if (extension !== ".pdf") await readSpreadsheet(file);
    else if ((file.type && file.type !== "application/pdf") || !(await file.slice(0, 5).text()).startsWith("%PDF-")) throw new Error("Invalid PDF");
  } catch {
    return { ok: false, message: "Invalid or oversized attendance file. Upload a valid spreadsheet or PDF within 15 MB." };
  }

  const summary = {
    uploadedForMonth: periodMonth,
    uploadedAt: new Date().toISOString(),
    originalFileName: file.name,
    fileType: extension.replace(".", ""),
  } satisfies Json;

  const committed = await importReportFile({ file, storeId, type: "salary_attendance",
    manifest: [{ date: periodMonth, row_count: 0, summary }], rows: [],
  });
  if (!committed.ok) return committed;

  await completeMatchingTasksAroundDate(storeId, getIndiaMonthStart(periodMonth), [
    "salary attendance",
    "salary_attendance",
  ]);
  revalidatePath("/app/reports");
  revalidatePath("/app/reports/salary-attendance");
  revalidatePath("/app/today");
  revalidatePath("/app/checklist");
  revalidatePath(`/app/checklist/${storeId}`);
  revalidatePath(`/app/stores/${storeId}`);

  return {
    ok: true,
    message: "Salary attendance report uploaded.",
    summary: {
      storeName: store.name,
      periodMonth,
      fileName: file.name,
    },
  };
  });
}
