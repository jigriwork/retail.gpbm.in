"use server";

import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  parseStockFileDetailed,
  summarizeStockRows,
  type ParsedStockRow,
} from "@/lib/reports/stock-parser";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { completeMatchingTasksAroundDate } from "@/lib/tasks/auto-complete";
import { getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";

export type StockUploadState = {
  ok: boolean;
  message: string;
  summary?: {
    storeName: string;
    periodMonth: string;
    rowsProcessed: number;
    itemCount: number;
    totalQuantity: number;
    totalStockValueMrp: number | null;
    brandsFound: string[];
    categoriesFound: string[];
    topBrands: Array<{ name: string; quantity: number }>;
    topCategories: Array<{ name: string; quantity: number }>;
  };
};

const allowedExtensions = [".xlsx", ".xls", ".csv"];
const stockRowInsertBatchSize = 1000;

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

  return clean || "stock-report";
}

function monthInputToPeriodMonth(monthInput: string) {
  if (!/^\d{4}-\d{2}$/.test(monthInput)) {
    return "";
  }

  return `${monthInput}-01`;
}

function normalizeStore(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesStoreName(input: string | null, store: { name: string; code: string }) {
  if (!input) {
    return false;
  }

  const normalized = normalizeStore(input);
  const storeName = normalizeStore(store.name);
  const storeCode = normalizeStore(store.code);

  if (normalized === storeName || normalized === storeCode) {
    return true;
  }

  if (storeName.length > 2 && normalized.includes(storeName)) {
    return true;
  }

  return new RegExp(`(^|[^a-z0-9])${storeCode}([^a-z0-9]|$)`, "i").test(input);
}

function findStoreForName(input: string | null, stores: Array<{ id: string; name: string; code: string }>) {
  return stores.find((store) => matchesStoreName(input, store)) ?? null;
}

function safeSummaryJson(
  summary: ReturnType<typeof summarizeStockRows>,
  periodMonth: string,
  file: File,
  extension: string,
) {
  return {
    uploadedForMonth: periodMonth,
    uploadedAt: new Date().toISOString(),
    originalFileName: file.name,
    fileType: extension.replace(".", ""),
    totalQuantity: summary.totalQuantity,
    totalStockValueMrp: summary.totalStockValueMrp,
    brandsFound: summary.brandsFound,
    categoriesFound: summary.categoriesFound,
    brandSummary: summary.brandSummary,
    categorySummary: summary.categorySummary,
    topBrands: summary.topBrands,
    topCategories: summary.topCategories,
    itemCount: summary.itemCount,
    rowCount: summary.rowCount,
  } satisfies Json;
}

function rowHasStockIdentity(row: ParsedStockRow) {
  return Boolean(row.itemName || row.sku || row.barcode || row.brand || row.category);
}

async function insertStockRowsInBatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: TablesInsert<"stock_rows">[],
) {
  for (let index = 0; index < rows.length; index += stockRowInsertBatchSize) {
    const batch = rows.slice(index, index + stockRowInsertBatchSize);
    const { error } = await supabase.from("stock_rows").insert(batch);

    if (error) {
      return error;
    }
  }

  return null;
}

export async function uploadStockReport(
  _previous: StockUploadState,
  formData: FormData,
): Promise<StockUploadState> {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { ok: false, message: "Your account is not active." };
  }

  const storeId = readString(formData, "storeId");
  const periodMonth = monthInputToPeriodMonth(readString(formData, "periodMonth"));
  const file = formData.get("file");

  if (!storeId) {
    return { ok: false, message: "Choose a store for this stock report." };
  }

  if (!periodMonth) {
    return { ok: false, message: "Choose a valid stock report month." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a stock report file." };
  }

  const extension = fileExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, message: "Upload a .xlsx, .xls, or .csv file." };
  }

  if (profile.role !== "owner" && !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You can upload stock reports only for your assigned store." };
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
    .eq("report_type", "stock")
    .eq("store_id", storeId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      message: "Stock report for this store and month already exists.",
    };
  }

  const parseResult = await parseStockFileDetailed(file);
  const parsedRows = parseResult.rows.filter(rowHasStockIdentity);

  if (!parsedRows.length) {
    if (!parseResult.headerFound && parseResult.titleRowsSkipped > 0) {
      return {
        ok: false,
        message:
          "A report title row was found, but no stock header row was detected. Please check that the file has headers like ITEM CODE, COMPANY NAME, ITEM NAME and CLOSING STOCK.",
      };
    }

    return {
      ok: false,
      message:
        "No usable stock rows were found. Please check that the file has headers like ITEM CODE, COMPANY NAME, ITEM NAME and CLOSING STOCK.",
    };
  }

  const rowsWithStoreColumn = parsedRows.filter((row) => row.storeName);
  const invalidStoreRows = rowsWithStoreColumn.filter((row) => {
    const rowStore = findStoreForName(row.storeName, stores);
    return !rowStore || rowStore.id !== storeId;
  });

  if (invalidStoreRows.length) {
    return {
      ok: false,
      message:
        "The file contains rows for a different or inactive store. Upload one active store report at a time.",
    };
  }

  const summary = summarizeStockRows(parsedRows);

  if (summary.rowCount < 1) {
    return { ok: false, message: "At least one stock row is required." };
  }

  const today = getIndiaToday();
  const storagePath = [
    "stock",
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

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .insert({
      report_type: "stock",
      store_id: storeId,
      uploaded_by: profile.id,
      period_month: periodMonth,
      report_date: today,
      file_name: file.name,
      file_path: storagePath,
      status: "processed",
      row_count: summary.rowCount,
      summary: safeSummaryJson(summary, periodMonth, file, extension),
    })
    .select("id")
    .single();

  if (reportError || !report) {
    await supabase.storage.from("reports").remove([storagePath]);
    return { ok: false, message: reportError?.message ?? "Unable to create report record." };
  }

  const stockRows: TablesInsert<"stock_rows">[] = parsedRows.map((row) => ({
    report_id: report.id,
    store_id: storeId,
    stock_month: periodMonth,
    item_name: row.itemName,
    sku: row.sku,
    barcode: row.barcode,
    brand: row.brand,
    category: row.category,
    size: row.size,
    color: row.color,
    quantity: row.quantity,
    mrp: row.mrp,
    cost_price: row.costPrice,
    supplier: row.supplier,
    purchase_date: row.purchaseDate,
    ageing_days: row.ageingDays,
    raw_data: row.rawData as Json,
  }));

  const rowsError = await insertStockRowsInBatches(supabase, stockRows);

  if (rowsError) {
    return {
      ok: false,
      message:
        "Report file was saved, but stock rows could not be inserted. Ask owner/admin to review this report.",
    };
  }

  await completeMatchingTasksAroundDate(storeId, getIndiaMonthStart(periodMonth), [
    "stock report",
    "monthly_stock",
  ]);
  revalidatePath("/app/reports");
  revalidatePath("/app/reports/stock");
  revalidatePath("/app/today");
  revalidatePath("/app/checklist");
  revalidatePath(`/app/checklist/${storeId}`);
  revalidatePath(`/app/stores/${storeId}`);

  return {
    ok: true,
    message: "Stock report uploaded and processed.",
    summary: {
      storeName: store.name,
      periodMonth,
      rowsProcessed: summary.rowCount,
      itemCount: summary.itemCount,
      totalQuantity: summary.totalQuantity,
      totalStockValueMrp: summary.totalStockValueMrp,
      brandsFound: summary.brandsFound,
      categoriesFound: summary.categoriesFound,
      topBrands: summary.topBrands,
      topCategories: summary.topCategories,
    },
  };
}
