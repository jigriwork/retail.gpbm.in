"use server";
import { withDirectUpload } from "@/lib/uploads/server";

import { importReportFile } from "@/lib/reports/import-lifecycle";
import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  parseStockFileDetailed,
  summarizeStockRows,
  type ParsedStockRow,
} from "@/lib/reports/stock-parser";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { completeMatchingTasksAroundDate } from "@/lib/tasks/auto-complete";
import { getIndiaMonthStart } from "@/lib/tasks/dates";

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

export async function uploadStockReport(
  _previous: StockUploadState,
  formData: FormData,
): Promise<StockUploadState> {
  return withDirectUpload(formData, "stock", async (formData) => {
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

  const stockRows: TablesInsert<"stock_rows">[] = parsedRows.map((row) => ({
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

  const committed = await importReportFile({ file, storeId, type: "stock",
    manifest: [{ date: periodMonth, row_count: stockRows.length, summary: safeSummaryJson(summary, periodMonth, file, extension) }],
    rows: stockRows.map(row => ({ ...row, logical_date: periodMonth })),
  });
  if (!committed.ok) return committed;

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
  });
}
