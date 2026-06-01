"use server";

import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { completeMatchingTasksAroundDate } from "@/lib/tasks/auto-complete";
import { getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";

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

function slugFileName(fileName: string) {
  const clean = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "salary-attendance-report";
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

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .eq("report_type", "salary_attendance")
    .eq("store_id", storeId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      message: "Salary attendance report for this store and month already exists.",
    };
  }

  const today = getIndiaToday();
  const storagePath = [
    "salary-attendance",
    store.code.toLowerCase(),
    periodMonth.slice(0, 7),
    `${Date.now()}-${slugFileName(file.name)}`,
  ].join("/");

  const { error: uploadError } = await supabase.storage.from("reports").upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    return { ok: false, message: uploadError.message };
  }

  const summary = {
    uploadedForMonth: periodMonth,
    uploadedAt: new Date().toISOString(),
    originalFileName: file.name,
    fileType: extension.replace(".", ""),
  } satisfies Json;

  const { error: reportError } = await supabase.from("reports").insert({
    report_type: "salary_attendance",
    store_id: storeId,
    uploaded_by: profile.id,
    period_month: periodMonth,
    report_date: today,
    file_name: file.name,
    file_path: storagePath,
    status: "processed",
    row_count: 0,
    summary,
  });

  if (reportError) {
    await supabase.storage.from("reports").remove([storagePath]);
    return { ok: false, message: reportError.message };
  }

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
}
