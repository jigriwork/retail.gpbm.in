"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { correctedSummary, recoverySources } from "@/lib/reports/recovery-evidence";
import { requireOwner } from "@/lib/auth/session";
import { staffNameKey } from "@/lib/employees/utils";
import {
  matchesStoreName,
  missingStaffColumnWarning,
  parseSalesFileDetailed,
  rowsHaveAmountLikeColumns,
  rowsHaveStaffColumn,
  summarizeSalesRows,
  type ParsedSalesRow,
  unmappedAmountColumnsError,
} from "@/lib/reports/sales-parser";
import { getKnownSalesStaffNameKeys } from "@/lib/reports/staff-name-matching";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import { addDays, getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";

export type CorrectionActionState = {
  ok: boolean;
  message: string;
  warning?: string;
  expectedPhrase?: string;
  preview?: Record<string, unknown>;
  summary?: Record<string, unknown>;
};

export type BulkDuplicateBehavior = "stop" | "skip" | "replace";
export type HistoricalImportPreset = "current_month" | "financial_year" | "custom";

export type CorrectionSalesReport = Tables<"reports"> & {
  stores: Pick<Tables<"stores">, "id" | "name" | "code"> | null;
  profiles: Pick<Tables<"profiles">, "full_name" | "email"> | null;
  sales_upload_batches: Pick<Tables<"sales_upload_batches">, "id" | "original_file_name" | "status"> | null;
};

export type CorrectionAuditLog = Tables<"audit_logs"> & {
  profiles: Pick<Tables<"profiles">, "full_name" | "email"> | null;
  stores: Pick<Tables<"stores">, "id" | "name" | "code"> | null;
};

const allowedExtensions = [".xlsx", ".xls", ".csv"];
const salesRowInsertBatchSize = 1000;
const historicalImportPhrase = "IMPORT HISTORICAL SALES";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readFile(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

function fileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function slugFileName(fileName: string) {
  return (
    fileName
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "sales-report"
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getFinancialYearStart(today = getIndiaToday()) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const financialYear = month >= 4 ? year : year - 1;
  return `${financialYear}-04-01`;
}

function getHistoricalRange(preset: HistoricalImportPreset, startDate: string, endDate: string) {
  const today = getIndiaToday();

  if (preset === "financial_year") {
    return { startDate: getFinancialYearStart(today), endDate: today };
  }

  if (preset === "current_month") {
    return { startDate: getIndiaMonthStart(today), endDate: today };
  }

  return { startDate, endDate };
}

function dateList(startDate: string, endDate: string) {
  const dates: string[] = [];

  if (!startDate || !endDate || startDate > endDate) {
    return dates;
  }

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    dates.push(date);
  }

  return dates;
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

function uniqueBillKey(row: { storeId: string; saleDate: string; billNo: string | null }) {
  return row.billNo ? `${row.storeId}:${row.saleDate}:${row.billNo.trim()}` : null;
}

function safeSummaryJson(
  summary: ReturnType<typeof summarizeSalesRows>,
  metadata: {
    detectedDate: string | null;
    returnsCount: number;
    skippedRows: number;
    hasStaffColumn: boolean;
    staffColumnWarning: string | null;
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

async function getUnmatchedSalesStaffNames(storeId: string, staffNames: string[]) {
  const normalizedNames = [...new Set(staffNames.map(staffNameKey).filter(Boolean))];

  if (!normalizedNames.length) {
    return [];
  }

  const known = await getKnownSalesStaffNameKeys({
    staffNames: normalizedNames,
    storeIds: [storeId],
  });

  return staffNames.filter((name) => !known.has(`${storeId}:${staffNameKey(name)}`));
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

function revalidateSalesCorrectionPaths(storeId?: string | null) {
  revalidatePath("/app/reports");
  revalidatePath("/app/reports/sales");
  revalidatePath("/app/reports/sales/analytics");
  revalidatePath("/app/reports/staff");
  revalidatePath("/app/reports/correction");
  revalidatePath("/app/today");
  if (storeId) {
    revalidatePath(`/app/stores/${storeId}`);
  }
}

async function auditLog({
  action,
  entityId,
  entityType,
  metadata,
  periodMonth = null,
  reportDate = null,
  storeId = null,
}: {
  action: string;
  entityType: string;
  entityId: string | null;
  storeId?: string | null;
  reportDate?: string | null;
  periodMonth?: string | null;
  metadata: Json;
}) {
  const owner = await requireOwner();

  if (!owner || owner.profile.is_active !== true) {
    return { error: new Error("Only owner can write audit logs.") };
  }

  const supabase = await createClient();
  return supabase.from("audit_logs").insert({
    action,
    actor_id: owner.profile.id,
    actor_role: owner.profile.role,
    entity_id: entityId,
    entity_type: entityType,
    metadata,
    period_month: periodMonth,
    report_date: reportDate,
    store_id: storeId,
  });
}

async function getOwnerOrState(): Promise<
  | { ok: true; owner: NonNullable<Awaited<ReturnType<typeof requireOwner>>> }
  | { ok: false; state: CorrectionActionState }
> {
  const owner = await requireOwner();

  if (!owner || owner.profile.is_active !== true) {
    return { ok: false, state: { ok: false, message: "Only owner can use sales correction tools." } };
  }

  return { ok: true, owner };
}

async function getActiveStore(storeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id,name,code,is_active")
    .eq("id", storeId)
    .eq("is_active", true)
    .maybeSingle();

  return data;
}

async function getSalesReport(reportId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("*, stores(id,name,code), profiles(full_name,email), sales_upload_batches(id,original_file_name,status)")
    .eq("id", reportId)
    .maybeSingle();

  return data as CorrectionSalesReport | null;
}

async function parseDailyReplacementFile(file: File, store: { id: string; name: string; code: string }, expectedDate: string) {
  const extension = fileExtension(file.name);
  if (!allowedExtensions.includes(extension)) {
    return { ok: false as const, message: "Upload a .xlsx, .xls, or .csv sales file." };
  }

  const parseResult = await parseSalesFileDetailed(file);
  const parsedRows = parseResult.rows.filter(rowHasSalesIdentity);

  if (!parsedRows.length) {
    return { ok: false as const, message: "No usable sales rows were found in this file." };
  }

  const detectedDates = uniqueDates(parsedRows);
  if (detectedDates.length > 1) {
    return {
      ok: false as const,
      message: "This corrected file contains multiple bill dates. Use Bulk Historical Sales Upload instead.",
    };
  }

  const finalReportDate = detectedDates[0] ?? expectedDate;
  if (finalReportDate !== expectedDate) {
    return {
      ok: false as const,
      message: `Corrected file date ${finalReportDate} does not match existing report date ${expectedDate}.`,
    };
  }

  const invalidStoreRows = parsedRows.filter((row) => row.storeName && !matchesStoreName(row.storeName, store));
  if (invalidStoreRows.length) {
    return {
      ok: false as const,
      message: `The corrected file contains ${invalidStoreRows.length} row(s) for another store.`,
    };
  }

  const reportRows = parsedRows.map((row) => ({ ...row, saleDate: row.saleDate ?? finalReportDate }));
  const summary = summarizeSalesRows(reportRows);

  if (summary.totalNetSale === 0 && rowsHaveAmountLikeColumns(reportRows)) {
    return { ok: false as const, message: unmappedAmountColumnsError };
  }

  const unmatchedStaffNames = await getUnmatchedSalesStaffNames(store.id, uniqueStaffNames(reportRows));
  const hasStaffColumn = rowsHaveStaffColumn(reportRows);
  const returnsCount = reportRows.filter(
    (row) => Number(row.quantity ?? 0) < 0 || Number(row.netSale ?? 0) < 0,
  ).length;
  const metadata = {
    detectedDate: detectedDates[0] ?? null,
    returnsCount,
    skippedRows: parseResult.skippedTotalRows,
    hasStaffColumn,
    staffColumnWarning: hasStaffColumn ? null : missingStaffColumnWarning,
    unmatchedStaffCount: unmatchedStaffNames.length,
    unmatchedStaffNames,
  };

  return {
    ok: true as const,
    extension,
    metadata,
    reportRows,
    summary,
    summaryJson: safeSummaryJson(summary, metadata),
  };
}

function salesRowsForInsert({
  reportId,
  rows,
  storeId,
}: {
  reportId: string;
  rows: ParsedSalesRow[];
  storeId: string;
}) {
  return rows.map((row) => ({
    report_id: reportId,
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
  })) satisfies TablesInsert<"sales_rows">[];
}

async function deleteReportRowsAndRecord(reportId: string) {
  // Fail closed before removing the last database pointer to recovery evidence.
  // The log records intent, not success: row deletion can still fail afterwards.
  const report = await getSalesReport(reportId);
  if (!report || report.report_type !== "sales") return new Error("Sales report not found.");
  const preserved = await auditLog({
    action: "preserve_sales_source_before_delete", entityId: report.id, entityType: "report",
    storeId: report.store_id, reportDate: report.report_date,
    metadata: { recovery_sources: recoverySources(report), summary: report.summary, source_retained: true },
  });
  if (preserved.error) return preserved.error;
  const supabase = await createClient();
  const rowsDelete = await supabase.from("sales_rows").delete().eq("report_id", reportId);
  if (rowsDelete.error) {
    return rowsDelete.error;
  }

  const reportDelete = await supabase.from("reports").delete().eq("id", reportId).eq("report_type", "sales");
  return reportDelete.error;
}

async function createSalesReportFromRows({
  batchId = null,
  fileName,
  filePath,
  profileId,
  reportDate,
  rows,
  storeId,
  summaryJson,
}: {
  batchId?: string | null;
  fileName: string;
  filePath: string | null;
  profileId: string;
  reportDate: string;
  rows: ParsedSalesRow[];
  storeId: string;
  summaryJson: Json;
}) {
  const supabase = await createClient();
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .insert({
      file_name: fileName,
      file_path: filePath,
      report_date: reportDate,
      report_type: "sales",
      row_count: rows.length,
      sales_upload_batch_id: batchId,
      status: "processed",
      store_id: storeId,
      summary: summaryJson,
      uploaded_by: profileId,
    })
    .select("id")
    .single();

  if (reportError || !report) {
    return { report: null, error: reportError ?? new Error("Unable to create report record.") };
  }

  const rowsError = await insertSalesRowsInBatches(
    supabase,
    salesRowsForInsert({ reportId: report.id, rows, storeId }),
  );

  if (rowsError) {
    await supabase.from("reports").delete().eq("id", report.id);
    return { report: null, error: rowsError };
  }

  return { report, error: null };
}

export async function getCorrectionSalesReports({
  endDate,
  page = 1,
  search = "",
  startDate,
  storeId = "",
}: {
  storeId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
}) {
  const owner = await requireOwner();
  if (!owner) return { reports: [] as CorrectionSalesReport[], count: 0, pageSize: 12 };

  const pageSize = 12;
  const safePage = Math.max(page, 1);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = await createClient();
  let query = supabase
    .from("reports")
    .select("*, stores(id,name,code), profiles(full_name,email), sales_upload_batches(id,original_file_name,status)", {
      count: "exact",
    })
    .eq("report_type", "sales")
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (storeId && storeId !== "all") {
    query = query.eq("store_id", storeId);
  }

  if (startDate) {
    query = query.gte("report_date", startDate);
  }

  if (endDate) {
    query = query.lte("report_date", endDate);
  }

  if (search) {
    query = query.ilike("file_name", `%${search}%`);
  }

  const { count, data } = await query;
  return {
    count: count ?? 0,
    pageSize,
    reports: (data ?? []) as CorrectionSalesReport[],
  };
}

export async function getRecentCorrectionAuditLogs(limit = 25) {
  const owner = await requireOwner();
  if (!owner) return [] as CorrectionAuditLog[];

  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name,email), stores(id,name,code)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as CorrectionAuditLog[];
}

export async function deleteSalesReport(
  _previous: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const ownerResult = await getOwnerOrState();
  if (!ownerResult.ok) return ownerResult.state;

  const reportId = readString(formData, "reportId");
  const confirmation = readString(formData, "confirmation");
  const report = reportId ? await getSalesReport(reportId) : null;

  if (!report || report.report_type !== "sales") {
    return { ok: false, message: "Sales report was not found." };
  }

  const expectedPhrase = `DELETE SALES ${report.report_date ?? "NO-DATE"}`;
  if (confirmation !== expectedPhrase) {
    return {
      ok: false,
      expectedPhrase,
      message: `Type ${expectedPhrase} to delete this sales report.`,
      preview: {
        fileName: report.file_name,
        reportDate: report.report_date,
        rowCount: report.row_count,
        store: report.stores?.name,
        summary: report.summary,
      },
    };
  }

  const deleteError = await deleteReportRowsAndRecord(report.id);
  if (deleteError) {
    return { ok: false, message: deleteError.message };
  }

  const audit = await auditLog({
    action: "delete_sales_report",
    entityId: report.id,
    entityType: "report",
    metadata: {
      file_name: report.file_name,
      recovery_sources: recoverySources(report),
      row_count: report.row_count,
      storage_deleted: false,
      source_retained: true,
      summary: report.summary,
    } satisfies Json,
    reportDate: report.report_date,
    storeId: report.store_id,
  });

  if (audit.error) {
    return { ok: false, message: `Report deleted, but audit log failed: ${audit.error.message}` };
  }

  revalidateSalesCorrectionPaths(report.store_id);
  return {
    ok: true,
    message: "Sales report deleted. This store/date can now be uploaded again.",
    warning: "Original source files are retained permanently for recovery.",
  };
}

export async function replaceSalesReport(
  _previous: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const ownerResult = await getOwnerOrState();
  if (!ownerResult.ok) return ownerResult.state;

  const reportId = readString(formData, "reportId");
  const confirmation = readString(formData, "confirmation");
  const file = readFile(formData, "file");
  const oldReport = reportId ? await getSalesReport(reportId) : null;

  if (!oldReport || oldReport.report_type !== "sales" || !oldReport.store_id || !oldReport.report_date) {
    return { ok: false, message: "Choose a valid daily sales report to replace." };
  }

  if (!file) {
    return { ok: false, message: "Choose the corrected sales file." };
  }

  const store = await getActiveStore(oldReport.store_id);
  if (!store) {
    return { ok: false, message: "Report store is inactive or missing." };
  }

  const parsed = await parseDailyReplacementFile(file, store, oldReport.report_date);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  const expectedPhrase = `REPLACE SALES ${oldReport.report_date}`;
  if (confirmation !== expectedPhrase) {
    return {
      ok: false,
      expectedPhrase,
      message: `Review the preview, reselect the file if needed, and type ${expectedPhrase} to replace.`,
      preview: {
        newBillCount: parsed.summary.billCount,
        newReturnRows: parsed.metadata.returnsCount,
        newRowCount: parsed.summary.rowCount,
        newSkippedFooterRows: parsed.metadata.skippedRows,
        newTotalSale: parsed.summary.totalNetSale,
        staffColumnWarning: parsed.metadata.staffColumnWarning,
        oldBillCount:
          oldReport.summary && typeof oldReport.summary === "object" && !Array.isArray(oldReport.summary)
            ? (oldReport.summary as Record<string, unknown>).billCount
            : null,
        oldFileName: oldReport.file_name,
        oldRowCount: oldReport.row_count,
        oldTotalSale:
          oldReport.summary && typeof oldReport.summary === "object" && !Array.isArray(oldReport.summary)
            ? (oldReport.summary as Record<string, unknown>).totalNetSale
            : null,
        unmatchedStaffNames: parsed.metadata.unmatchedStaffNames,
      },
    };
  }

  const storagePath = ["sales", store.code.toLowerCase(), oldReport.report_date, `${randomUUID()}-${slugFileName(file.name)}`].join("/");
  const intent = await auditLog({
    action: "sales_replacement_requested", entityId: oldReport.id, entityType: "report",
    storeId: store.id, reportDate: oldReport.report_date,
    metadata: { new_file_path: storagePath, recovery_sources: recoverySources(oldReport) },
  });
  if (intent.error) return { ok: false, message: "Unable to record replacement source history." };
  const supabase = await createClient();
  const upload = await supabase.storage.from("reports").upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (upload.error) {
    return { ok: false, message: upload.error.message };
  }

  const created = await createSalesReportFromRows({
    fileName: file.name,
    filePath: storagePath,
    profileId: ownerResult.owner.profile.id,
    reportDate: oldReport.report_date,
    rows: parsed.reportRows,
    storeId: store.id,
    summaryJson: correctedSummary(parsed.summaryJson, oldReport),
  });

  if (created.error || !created.report) {
    // Retain uploaded evidence even if report creation or rollback fails.
    return { ok: false, message: created.error?.message ?? "Unable to insert corrected report." };
  }

  const deleteOldError = await deleteReportRowsAndRecord(oldReport.id);
  if (deleteOldError) {
    await supabase.from("reports").delete().eq("id", created.report.id);

    // Retain uploaded evidence even if report creation or rollback fails.
    return { ok: false, message: `Corrected report was rolled back because old report deletion failed: ${deleteOldError.message}` };
  }

  const audit = await auditLog({
    action: "replace_sales_report",
    entityId: created.report.id,
    entityType: "report",
    metadata: {
      new_file_name: file.name,
      new_file_path: storagePath,
      recovery_sources: recoverySources(oldReport),
      new_summary: parsed.summaryJson,
      old_file_name: oldReport.file_name,
      old_report_id: oldReport.id,
      old_summary: oldReport.summary,
      storage_deleted: false,
      source_retained: true,
    } satisfies Json,
    reportDate: oldReport.report_date,
    storeId: store.id,
  });

  if (audit.error) {
    return { ok: false, message: `Report replaced, but audit log failed: ${audit.error.message}` };
  }

  revalidateSalesCorrectionPaths(store.id);
  return {
    ok: true,
    message: "Sales report replaced with corrected file.",
    warning: "Original source files are retained permanently for recovery.",
  };
}

export async function bulkHistoricalSalesUpload(
  _previous: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const ownerResult = await getOwnerOrState();
  if (!ownerResult.ok) return ownerResult.state;

  const storeId = readString(formData, "storeId");
  const duplicateBehavior = (readString(formData, "duplicateBehavior") || "skip") as BulkDuplicateBehavior;
  const preset = (readString(formData, "preset") || "current_month") as HistoricalImportPreset;
  const confirmation = readString(formData, "confirmation");
  const range = getHistoricalRange(preset, readString(formData, "startDate"), readString(formData, "endDate"));
  const file = readFile(formData, "file");

  if (!["stop", "skip", "replace"].includes(duplicateBehavior)) {
    return { ok: false, message: "Choose a valid duplicate behavior." };
  }

  if (!["current_month", "financial_year", "custom"].includes(preset)) {
    return { ok: false, message: "Choose a valid historical import range." };
  }

  if (!range.startDate || !range.endDate || range.startDate > range.endDate) {
    return { ok: false, message: "Choose a valid start and end date for historical import." };
  }

  if (!file) {
    return { ok: false, message: "Choose the historical sales file." };
  }

  if (!allowedExtensions.includes(fileExtension(file.name))) {
    return { ok: false, message: "Upload a .xlsx, .xls, or .csv sales file." };
  }

  const store = await getActiveStore(storeId);
  if (!store) {
    return { ok: false, message: "Choose an active store." };
  }

  const parseResult = await parseSalesFileDetailed(file);
  const parsedRows = parseResult.rows.filter(rowHasSalesIdentity);

  if (!parsedRows.length) {
    return { ok: false, message: "No usable sales rows were found." };
  }

  const rowsWithoutDate = parsedRows.filter((row) => !row.saleDate);
  if (rowsWithoutDate.length) {
    return { ok: false, message: `${rowsWithoutDate.length} row(s) do not have BILL DATE. Bulk upload requires dates.` };
  }

  const invalidStoreRows = parsedRows.filter((row) => row.storeName && !matchesStoreName(row.storeName, store));
  if (invalidStoreRows.length) {
    return { ok: false, message: `The file contains ${invalidStoreRows.length} row(s) for another store.` };
  }

  const grouped = new Map<string, ParsedSalesRow[]>();
  for (const row of parsedRows) {
    const saleDate = row.saleDate;
    if (!saleDate) continue;
    const bucket = grouped.get(saleDate) ?? [];
    bucket.push(row);
    grouped.set(saleDate, bucket);
  }

  const dates = [...grouped.keys()].sort();
  if (!dates.length) {
    return { ok: false, message: "No BILL DATE values were detected." };
  }

  const today = getIndiaToday();
  const futureDates = dates.filter((date) => date > today);
  if (futureDates.length) {
    return {
      ok: false,
      message: `Historical import cannot include future sales dates. First future date: ${futureDates[0]}.`,
    };
  }

  const outsideRangeDates = dates.filter((date) => date < range.startDate || date > range.endDate);
  if (outsideRangeDates.length) {
    return {
      ok: false,
      message: `The file contains ${outsideRangeDates.length} date(s) outside the selected range ${range.startDate} to ${range.endDate}. First outside date: ${outsideRangeDates[0]}.`,
    };
  }

  const suspiciousDate = dates.find((date) => {
    const dateRows = grouped.get(date) ?? [];
    const summary = summarizeSalesRows(dateRows);
    return summary.rowCount > 0 && summary.totalNetSale === 0 && rowsHaveAmountLikeColumns(dateRows);
  });

  if (suspiciousDate) {
    return { ok: false, message: `${unmappedAmountColumnsError} First affected date: ${suspiciousDate}.` };
  }

  const supabase = await createClient();
  const { data: existingReports } = await supabase
    .from("reports")
    .select("id,report_date,file_name,file_path,row_count,summary,store_id,sales_upload_batch_id")
    .eq("report_type", "sales")
    .eq("store_id", store.id)
    .gte("report_date", range.startDate)
    .lte("report_date", range.endDate);
  const existingByDate = new Map<string, NonNullable<typeof existingReports>[number]>();
  for (const report of existingReports ?? []) {
    if (report.report_date && !existingByDate.has(report.report_date)) {
      existingByDate.set(report.report_date, report);
    }
  }
  const duplicateDates = dates.filter((date) => existingByDate.has(date));
  const selectedRangeDates = dateList(range.startDate, range.endDate);
  const existingDatesInRange = new Set(
    (existingReports ?? [])
      .map((report) => report.report_date)
      .filter(
        (date): date is string =>
          typeof date === "string" && date >= range.startDate && date <= range.endDate,
      ),
  );
  const coveredDates = new Set([...dates, ...existingDatesInRange]);
  const missingDates = selectedRangeDates.filter((date) => !coveredDates.has(date));
  const previewRows = dates.map((date) => {
    const dateRows = grouped.get(date) ?? [];
    const summary = summarizeSalesRows(dateRows);
    const hasStaffColumn = rowsHaveStaffColumn(dateRows);

    return {
      billCount: summary.billCount,
      date,
      duplicate: existingByDate.has(date),
      hasStaffColumn,
      rowCount: summary.rowCount,
      staffCount: summary.staffNames.length,
      suspiciousZeroTotal: summary.rowCount > 0 && summary.totalNetSale === 0,
      totalNetSale: roundMoney(summary.totalNetSale),
    };
  });
  const suspiciousDates = previewRows.filter((row) => row.suspiciousZeroTotal).map((row) => row.date);
  const datesWithoutStaffColumn = previewRows.filter((row) => !row.hasStaffColumn).map((row) => row.date);
  const totalPreviewRows = previewRows.reduce((sum, row) => sum + row.rowCount, 0);
  const totalPreviewSale = roundMoney(previewRows.reduce((sum, row) => sum + row.totalNetSale, 0));
  const totalPreviewBills = previewRows.reduce((sum, row) => sum + row.billCount, 0);
  const preview = {
    billCount: totalPreviewBills,
    dateRange: `${range.startDate} to ${range.endDate}`,
    datesFound: dates.length,
    datesFoundList: dates.slice(0, 40),
    datesMissingInRange: missingDates.length,
    duplicateDates,
    duplicateMode: duplicateBehavior,
    finalConfirmationPhrase: historicalImportPhrase,
    missingDates: missingDates.slice(0, 60),
    noStaffColumnDates: datesWithoutStaffColumn,
    preset,
    previewRows: previewRows.slice(0, 40),
    skippedExistingDatesIfImported: duplicateBehavior === "skip" ? duplicateDates : [],
    store: store.name,
    suspiciousDates,
    totalRows: totalPreviewRows,
    totalSale: totalPreviewSale,
  };

  if (confirmation !== historicalImportPhrase) {
    return {
      ok: false,
      expectedPhrase: historicalImportPhrase,
      message: `Review the historical import preview, reselect the file if needed, and type ${historicalImportPhrase} to import.`,
      preview,
    };
  }

  if (duplicateDates.length && duplicateBehavior === "stop") {
    return {
      ok: false,
      message: `Existing sales reports found for ${duplicateDates.length} date(s). Choose skip or replace to continue.`,
      summary: { duplicateDates, expectedPhrase: historicalImportPhrase },
    };
  }

  const bulkStoragePath = ["sales-bulk", store.code.toLowerCase(), `${randomUUID()}-${slugFileName(file.name)}`].join("/");
  const intent = await auditLog({
    action: "bulk_sales_upload_requested", entityId: null, entityType: "sales_upload_batch",
    storeId: store.id,
    metadata: { new_file_path: bulkStoragePath, duplicate_behavior: duplicateBehavior,
      recovery_sources: duplicateBehavior === "replace"
        ? (existingReports ?? []).filter(report => report.report_date && dates.includes(report.report_date)).flatMap(recoverySources)
        : [] },
  });
  if (intent.error) return { ok: false, message: "Unable to record bulk upload source history." };
  const upload = await supabase.storage.from("reports").upload(bulkStoragePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (upload.error) {
    return { ok: false, message: upload.error.message };
  }

  const { data: batch, error: batchError } = await supabase
    .from("sales_upload_batches")
    .insert({
      file_path: bulkStoragePath,
      original_file_name: file.name,
      status: "uploaded",
      store_id: store.id,
      upload_mode: "bulk",
      uploaded_by: ownerResult.owner.profile.id,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    // Retain uploaded evidence even if report creation or rollback fails.
    return { ok: false, message: batchError?.message ?? "Unable to create upload batch." };
  }

  const importedDates: string[] = [];
  const skippedDates: string[] = [];
  const replacedDates: string[] = [];
  const failedDates: Array<{ date: string; error: string }> = [];
  const unmatchedStaff = new Set<string>();
  const allBills = new Set<string>();
  let totalRows = 0;
  let totalNetSale = 0;
  let totalQuantity = 0;
  let returnRows = 0;

  for (const date of dates) {
    const existing = existingByDate.get(date);
    const dateRows = grouped.get(date) ?? [];

    if (existing && duplicateBehavior === "skip") {
      skippedDates.push(date);
      continue;
    }

    const summary = summarizeSalesRows(dateRows);
    const dateUnmatched = await getUnmatchedSalesStaffNames(store.id, uniqueStaffNames(dateRows));
    const hasStaffColumn = rowsHaveStaffColumn(dateRows);
    dateUnmatched.forEach((name) => unmatchedStaff.add(name));
    const dateReturns = dateRows.filter((row) => Number(row.quantity ?? 0) < 0 || Number(row.netSale ?? 0) < 0).length;
    const summaryJson = safeSummaryJson(summary, {
      detectedDate: date,
      returnsCount: dateReturns,
      skippedRows: parseResult.skippedTotalRows,
      hasStaffColumn,
      staffColumnWarning: hasStaffColumn ? null : missingStaffColumnWarning,
      unmatchedStaffCount: dateUnmatched.length,
      unmatchedStaffNames: dateUnmatched,
    });

    const created = await createSalesReportFromRows({
      batchId: batch.id,
      fileName: file.name,
      filePath: bulkStoragePath,
      profileId: ownerResult.owner.profile.id,
      reportDate: date,
      rows: dateRows,
      storeId: store.id,
      summaryJson: existing ? correctedSummary(summaryJson, existing) : summaryJson,
    });

    if (created.error || !created.report) {
      failedDates.push({ date, error: created.error?.message ?? "Insert failed." });
      continue;
    }

    if (existing && duplicateBehavior === "replace") {
      const deleteOldError = await deleteReportRowsAndRecord(existing.id);
      if (deleteOldError) {
        await supabase.from("reports").delete().eq("id", created.report.id);
        failedDates.push({ date, error: `Old report deletion failed: ${deleteOldError.message}` });
        continue;
      }

      const replacementAudit = await auditLog({
        action: "replace_sales_report",
        entityId: created.report.id,
        entityType: "report",
        metadata: {
          bulk_batch_id: batch.id,
          new_file_name: file.name,
          new_file_path: bulkStoragePath,
          recovery_sources: recoverySources(existing),
          new_summary: summaryJson,
          old_file_name: existing.file_name,
          old_report_id: existing.id,
          old_summary: existing.summary,
          storage_deleted: false,
          source_retained: true,
        } satisfies Json,
        reportDate: date,
        storeId: store.id,
      });
      replacedDates.push(date);
      if (replacementAudit.error) {
        failedDates.push({ date, error: "Report replaced, but completion audit failed. Source history was retained." });
      }
    } else {
      importedDates.push(date);
    }

    totalRows += dateRows.length;
    totalNetSale += summary.totalNetSale;
    totalQuantity += dateRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    returnRows += dateReturns;
    for (const row of dateRows) {
      const key = uniqueBillKey({ billNo: row.billNo, saleDate: date, storeId: store.id });
      if (key) allBills.add(key);
    }
  }

  const status = failedDates.length
    ? importedDates.length || replacedDates.length || skippedDates.length
      ? "partial"
      : "failed"
    : "processed";
  const batchSummary = {
    duplicateBehavior,
    duplicateDates,
    failedDates,
    importedDates,
    replacedDates,
    returnRows,
    skippedDates,
    unmatchedStaffNames: [...unmatchedStaff].sort(),
  } satisfies Json;

  const update = await supabase
    .from("sales_upload_batches")
    .update({
      detected_end_date: dates[dates.length - 1],
      detected_start_date: dates[0],
      failed_dates: failedDates.length,
      imported_dates: importedDates.length,
      replaced_dates: replacedDates.length,
      skipped_dates: skippedDates.length,
      status,
      summary: batchSummary,
      total_bills: allBills.size,
      total_dates: dates.length,
      total_net_sale: roundMoney(totalNetSale),
      total_quantity: totalQuantity,
      total_rows: totalRows,
      unmatched_staff_count: unmatchedStaff.size,
    })
    .eq("id", batch.id);

  if (update.error) {
    return { ok: false, message: `Bulk upload completed, but batch summary update failed: ${update.error.message}` };
  }

  const audit = await auditLog({
    action: "bulk_sales_upload",
    entityId: batch.id,
    entityType: "sales_upload_batch",
    metadata: {
      detected_end_date: dates[dates.length - 1],
      detected_start_date: dates[0],
      duplicate_behavior: duplicateBehavior,
      failed_dates: failedDates,
      imported_dates: importedDates,
      missing_dates: missingDates,
      no_staff_column_dates: datesWithoutStaffColumn,
      preset,
      replaced_dates: replacedDates,
      skipped_dates: skippedDates,
      suspicious_dates: suspiciousDates,
      selected_end_date: range.endDate,
      selected_start_date: range.startDate,
      total_net_sale: roundMoney(totalNetSale),
      total_rows: totalRows,
    } satisfies Json,
    storeId: store.id,
  });

  if (audit.error) {
    return { ok: false, message: `Bulk upload completed, but audit log failed: ${audit.error.message}` };
  }

  revalidateSalesCorrectionPaths(store.id);
  return {
    ok: status !== "failed",
    message:
      status === "processed"
        ? "Bulk historical sales upload processed."
        : "Bulk historical sales upload completed with warnings.",
    summary: {
      dateRange: `${dates[0]} to ${dates[dates.length - 1]}`,
      duplicateDates,
      failedDates,
      importedDates,
      missingDates: missingDates.slice(0, 60),
      noStaffColumnDates: datesWithoutStaffColumn,
      preset,
      replacedDates,
      returnRows,
      skippedDates,
      store: store.name,
      suspiciousDates,
      totalBills: allBills.size,
      totalDates: dates.length,
      totalNetSale: roundMoney(totalNetSale),
      totalQuantity,
      totalRowsImported: totalRows,
      unmatchedStaffCount: unmatchedStaff.size,
      unmatchedStaffNames: [...unmatchedStaff].sort(),
    },
  };
}
