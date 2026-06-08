"use server";

import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { staffNameKey } from "@/lib/employees/utils";
import {
  parseSalesFileDetailed,
  matchesStoreName,
  summarizeSalesRows,
  type ParsedSalesRow,
} from "@/lib/reports/sales-parser";
import { createClient } from "@/lib/supabase/server";
import { completeMatchingTasks } from "@/lib/tasks/auto-complete";
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
    detectedDate: string | null;
    unmatchedStaffNames: string[];
    unmatchedStaffCount: number;
    returnsCount: number;
    skippedRows: number;
    topBrands: Array<{ name: string; sale: number }>;
    topCategories: Array<{ name: string; sale: number }>;
  };
};

const allowedExtensions = [".xlsx", ".xls", ".csv"];
const salesRowInsertBatchSize = 1000;

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

function safeSummaryJson(
  summary: ReturnType<typeof summarizeSalesRows>,
  metadata: {
    detectedDate: string | null;
    returnsCount: number;
    skippedRows: number;
    unmatchedStaffCount: number;
    unmatchedStaffNames: string[];
  },
) {
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
    ...metadata,
  } satisfies Json;
}

function rowHasSalesIdentity(row: ParsedSalesRow) {
  return Boolean(row.billNo || row.itemName || row.brand || row.category || row.staffName || row.netSale);
}

function uniqueDates(rows: ParsedSalesRow[]) {
  return [...new Set(rows.map((row) => row.saleDate).filter((date): date is string => Boolean(date)))].sort();
}

function uniqueStaffNames(rows: ParsedSalesRow[]) {
  return [...new Set(rows.map((row) => row.staffName?.trim()).filter((name): name is string => Boolean(name)))].sort();
}

async function getUnmatchedSalesStaffNames(storeId: string, staffNames: string[]) {
  const normalizedNames = [...new Set(staffNames.map(staffNameKey).filter(Boolean))];

  if (!normalizedNames.length) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_name_aliases")
    .select("normalized_source_name")
    .eq("store_id", storeId)
    .eq("source_type", "sales_report")
    .eq("is_active", true)
    .in("normalized_source_name", normalizedNames);
  const matched = new Set((data ?? []).map((alias) => alias.normalized_source_name));

  return staffNames.filter((name) => !matched.has(staffNameKey(name)));
}

async function insertSalesRowsInBatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: TablesInsert<"sales_rows">[],
) {
  for (let index = 0; index < rows.length; index += salesRowInsertBatchSize) {
    const batch = rows.slice(index, index + salesRowInsertBatchSize);
    const { error } = await supabase.from("sales_rows").insert(batch);

    if (error) {
      return error;
    }
  }

  return null;
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

  const parseResult = await parseSalesFileDetailed(file);
  const parsedRows = parseResult.rows.filter(rowHasSalesIdentity);

  if (!parsedRows.length) {
    if (!parseResult.headerFound && parseResult.titleRowsSkipped > 0) {
      return {
        ok: false,
        message:
          "A report title row was found, but no sales header row was detected. Please check that the file has headers like BILL DATE, BILL NO., AGENT NAME and NET AMOUNT.",
      };
    }

    return {
      ok: false,
      message:
        "No usable rows were found. Please check that the file has headers like BILL DATE, BILL NO., AGENT NAME and NET AMOUNT.",
    };
  }

  const detectedDates = uniqueDates(parsedRows);

  if (detectedDates.length > 1) {
    return {
      ok: false,
      message:
        "This file contains multiple bill dates. Please upload one day at a time or select the correct report date.",
    };
  }

  const finalReportDate = detectedDates[0] ?? reportDate;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .eq("report_type", "sales")
    .eq("store_id", storeId)
    .eq("report_date", finalReportDate)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      message: "Sales report for this store and date already exists.",
    };
  }

  const rowsWithStoreColumn = parsedRows.filter((row) => row.storeName);
  const invalidStoreRows = rowsWithStoreColumn.filter((row) => !matchesStoreName(row.storeName, store));

  if (invalidStoreRows.length) {
    return {
      ok: false,
      message:
        `The file contains ${invalidStoreRows.length} rows for a different or inactive store. Upload one active store report at a time.`,
    };
  }

  const reportRows = parsedRows.map((row) => ({
    ...row,
    saleDate: row.saleDate ?? finalReportDate,
  }));
  const summary = summarizeSalesRows(reportRows);

  if (summary.rowCount < 1) {
    return { ok: false, message: "At least one sales row is required." };
  }

  const staffNames = uniqueStaffNames(reportRows);
  const unmatchedStaffNames = await getUnmatchedSalesStaffNames(storeId, staffNames);
  const returnsCount = reportRows.filter(
    (row) => Number(row.quantity ?? 0) < 0 || Number(row.netSale ?? 0) < 0,
  ).length;
  const uploadMetadata = {
    detectedDate: detectedDates[0] ?? null,
    returnsCount,
    skippedRows: parseResult.skippedTotalRows,
    unmatchedStaffCount: unmatchedStaffNames.length,
    unmatchedStaffNames,
  };
  const storagePath = [
    "sales",
    store.code.toLowerCase(),
    finalReportDate,
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
      report_date: finalReportDate,
      file_name: file.name,
      file_path: storagePath,
      row_count: summary.rowCount,
      summary: safeSummaryJson(summary, uploadMetadata),
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

  const rowsError = await insertSalesRowsInBatches(supabase, salesRows);

  if (rowsError) {
    return {
      ok: false,
      message:
        "Report file was saved, but sales rows could not be inserted. Ask owner/admin to review this report.",
    };
  }

  await completeMatchingTasks(storeId, finalReportDate, ["sales report", "daily_sales"]);
  revalidatePath("/app/reports");
  revalidatePath("/app/reports/sales");
  revalidatePath("/app/today");
  revalidatePath(`/app/stores/${storeId}`);

  return {
    ok: true,
    message: "Sales report uploaded and processed.",
    summary: {
      storeName: store.name,
      reportDate: finalReportDate,
      rowsProcessed: summary.rowCount,
      totalNetSale: summary.totalNetSale,
      billCount: summary.billCount,
      staffNames: summary.staffNames,
      ...uploadMetadata,
      topBrands: summary.topBrands,
      topCategories: summary.topCategories,
    },
  };
}
