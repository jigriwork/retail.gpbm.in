"use server";

import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { parseSalesFile, matchesStoreName, summarizeSalesRows } from "@/lib/reports/sales-parser";
import { createClient } from "@/lib/supabase/server";
import { completeMatchingTasks } from "@/lib/tasks/auto-complete";
import { getIndiaToday } from "@/lib/tasks/dates";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";

export type SalesUploadState = {
  ok: boolean;
  message: string;
  summary?: {
    storeName: string;
    reportDate: string;
    rowsProcessed: number;
    totalNetSale: number;
    billCount: number;
    staffNames: string[];
    topBrands: Array<{ name: string; sale: number }>;
    topCategories: Array<{ name: string; sale: number }>;
  };
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

function slugFileName(fileName: string) {
  const clean = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "sales-report";
}

function safeSummaryJson(summary: ReturnType<typeof summarizeSalesRows>) {
  return {
    totalNetSale: summary.totalNetSale,
    rowCount: summary.rowCount,
    billCount: summary.billCount,
    staffNames: summary.staffNames,
    brandSummary: summary.brandSummary,
    categorySummary: summary.categorySummary,
    topStaff: summary.topStaff,
    topBrands: summary.topBrands,
    topCategories: summary.topCategories,
  } satisfies Json;
}

export async function uploadSalesReport(
  _previous: SalesUploadState,
  formData: FormData,
): Promise<SalesUploadState> {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { ok: false, message: "Your account is not active." };
  }

  const storeId = readString(formData, "storeId");
  const reportDate = readString(formData, "reportDate");
  const file = formData.get("file");

  if (!storeId) {
    return { ok: false, message: "Choose a store for this sales report." };
  }

  if (!reportDate) {
    return { ok: false, message: "Choose the report date." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a sales report file." };
  }

  if (!allowedExtensions.includes(fileExtension(file.name))) {
    return { ok: false, message: "Upload a .xlsx, .xls, or .csv file." };
  }

  if (profile.role !== "owner" && !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You can upload reports only for your assigned store." };
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
    .eq("report_type", "sales")
    .eq("store_id", storeId)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      message: "Sales report for this store and date already exists.",
    };
  }

  const parsedRows = await parseSalesFile(file);

  if (!parsedRows.length) {
    return { ok: false, message: "No usable rows were found in this file." };
  }

  const rowsWithStoreColumn = parsedRows.filter((row) => row.storeName);
  const invalidStoreRows = rowsWithStoreColumn.filter((row) => !matchesStoreName(row.storeName, store));

  if (invalidStoreRows.length) {
    return {
      ok: false,
      message:
        "The file contains rows for a different or inactive store. Upload one active store report at a time.",
    };
  }

  const reportRows = parsedRows.map((row) => ({
    ...row,
    saleDate: row.saleDate ?? reportDate,
  }));
  const summary = summarizeSalesRows(reportRows);

  if (summary.rowCount < 1) {
    return { ok: false, message: "At least one sales row is required." };
  }

  const storagePath = [
    "sales",
    store.code.toLowerCase(),
    reportDate,
    `${Date.now()}-${slugFileName(file.name)}`,
  ].join("/");

  const { error: uploadError } = await supabase.storage.from("reports").upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    return { ok: false, message: uploadError.message };
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .insert({
      report_type: "sales",
      store_id: storeId,
      uploaded_by: profile.id,
      report_date: reportDate,
      file_name: file.name,
      file_path: storagePath,
      row_count: summary.rowCount,
      summary: safeSummaryJson(summary),
      status: "processed",
    })
    .select("id")
    .single();

  if (reportError || !report) {
    await supabase.storage.from("reports").remove([storagePath]);
    return { ok: false, message: reportError?.message ?? "Unable to create report record." };
  }

  const salesRows: TablesInsert<"sales_rows">[] = reportRows.map((row) => ({
    report_id: report.id,
    store_id: storeId,
    sale_date: row.saleDate,
    bill_no: row.billNo,
    item_name: row.itemName,
    sku: row.sku,
    barcode: row.barcode,
    brand: row.brand,
    category: row.category,
    size: row.size,
    color: row.color,
    quantity: row.quantity,
    mrp: row.mrp,
    discount: row.discount,
    net_sale: row.netSale,
    staff_name: row.staffName,
    customer_name: row.customerName,
    customer_phone: row.customerPhone,
    raw_data: row.rawData as Json,
  }));

  const { error: rowsError } = await supabase.from("sales_rows").insert(salesRows);

  if (rowsError) {
    return {
      ok: false,
      message:
        "Report file was saved, but sales rows could not be inserted. Ask owner/admin to review this report.",
    };
  }

  await completeMatchingTasks(storeId, getIndiaToday(), ["sales report", "daily_sales"]);
  revalidatePath("/app/reports");
  revalidatePath("/app/reports/sales");
  revalidatePath("/app/today");
  revalidatePath(`/app/stores/${storeId}`);

  return {
    ok: true,
    message: "Sales report uploaded and processed.",
    summary: {
      storeName: store.name,
      reportDate,
      rowsProcessed: summary.rowCount,
      totalNetSale: summary.totalNetSale,
      billCount: summary.billCount,
      staffNames: summary.staffNames,
      topBrands: summary.topBrands,
      topCategories: summary.topCategories,
    },
  };
}
