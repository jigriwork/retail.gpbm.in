import { addDays, getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";

export type SalesReportSummary = {
  totalNetSale?: number;
  rowCount?: number;
  billCount?: number;
  returnsCount?: number;
  staffNames?: string[];
  hasStaffColumn?: boolean;
  staffColumnWarning?: string | null;
  unmatchedStaffCount?: number;
  unmatchedStaffNames?: string[];
  topBrands?: Array<{ name: string; sale: number }>;
  topCategories?: Array<{ name: string; sale: number }>;
};

export type SalesReportWithStore = {
  id: string;
  store_id: string | null;
  report_date: string | null;
  file_name: string | null;
  row_count: number | null;
  status: string | null;
  created_at: string | null;
  summary: SalesReportSummary | null;
  profiles: { full_name: string | null; email: string | null } | null;
  stores: { id: string; name: string; code: string } | null;
};

export type StoreSalesStatus = {
  store: { id: string; name: string; code: string };
  todayDate: string;
  todayReport: SalesReportWithStore | null;
  yesterdayDate: string;
  yesterdayReport: SalesReportWithStore | null;
  latestReport: SalesReportWithStore | null;
  recentReports: SalesReportWithStore[];
};

export type UnmatchedStaffReportWarning = {
  storeId: string;
  reportIds: string[];
  reportDates: string[];
  count: number;
  names: string[];
};

type SuspiciousReportLike = {
  id?: string;
  store_id: string | null;
  report_date: string | null;
  file_name: string | null;
  row_count: number | null;
  status: string | null;
  summary: unknown;
  stores?: { name: string | null } | null;
};

export type SuspiciousSalesReportWarning = {
  reportId: string;
  storeId: string;
  storeName: string;
  reportDate: string | null;
  fileName: string | null;
  rowCount: number;
  totalNetSale: number;
  billCount: number;
  salesRowsCount: number | null;
  salesRowsNetSale: number | null;
  summarySuspicious: boolean;
  rowAggregateSuspicious: boolean;
  summaryMismatch: boolean;
  warning: string;
};

export const suspiciousSalesReportWarningText =
  "Uploaded report has rows but total sale is 0. Please replace or repair this report.";

export const salesReportMissingStaffWarningText =
  "This report may not contain staff names. Staff Sales may be unavailable for this report.";

const salesReportSelect = `
  id,
  store_id,
  report_date,
  file_name,
  row_count,
  status,
  created_at,
  summary,
  profiles(full_name,email),
  stores(id,name,code)
`;

function asSalesReport(report: unknown) {
  return report as SalesReportWithStore;
}

function summaryObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SalesReportSummary)
    : null;
}

function summaryStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function summaryNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getReportStaffNames(summary: SalesReportSummary | null) {
  return summaryStringArray(summary?.staffNames);
}

export function isSalesReportSummarySuspicious(report: SuspiciousReportLike) {
  const summary = summaryObject(report.summary);
  const rowCount = Number(report.row_count ?? summary?.rowCount ?? 0);
  const totalNetSale = summaryNumber(summary?.totalNetSale);
  const billCount = summaryNumber(summary?.billCount);
  const staffNames = getReportStaffNames(summary);

  return report.status === "processed" && rowCount > 0 && totalNetSale === 0 && billCount === 0 && !staffNames.length;
}

export function salesReportMayBeMissingStaff(report: SuspiciousReportLike) {
  const summary = summaryObject(report.summary);
  const rowCount = Number(report.row_count ?? summary?.rowCount ?? 0);

  if (rowCount <= 0) {
    return false;
  }

  if (summary?.hasStaffColumn === false || summary?.staffColumnWarning) {
    return true;
  }

  return !getReportStaffNames(summary).length;
}

function buildSuspiciousSalesReportWarning(
  report: SuspiciousReportLike,
  details?: {
    salesRowsCount?: number | null;
    salesRowsNetSale?: number | null;
    summaryMismatch?: boolean;
  },
) {
  const summary = summaryObject(report.summary);
  const rowCount = Number(report.row_count ?? summary?.rowCount ?? 0);
  const totalNetSale = summaryNumber(summary?.totalNetSale);
  const billCount = summaryNumber(summary?.billCount);
  const salesRowsCount = details?.salesRowsCount ?? null;
  const salesRowsNetSale = details?.salesRowsNetSale ?? null;
  const summarySuspicious = isSalesReportSummarySuspicious(report);
  const rowAggregateSuspicious = Boolean(salesRowsCount && salesRowsCount > 0 && salesRowsNetSale === 0 && rowCount > 0);
  const summaryMismatch = Boolean(details?.summaryMismatch);

  return {
    reportId: report.id ?? "",
    storeId: report.store_id ?? "",
    storeName: report.stores?.name ?? "Store",
    reportDate: report.report_date,
    fileName: report.file_name,
    rowCount,
    totalNetSale,
    billCount,
    salesRowsCount,
    salesRowsNetSale,
    summarySuspicious,
    rowAggregateSuspicious,
    summaryMismatch,
    warning: suspiciousSalesReportWarningText,
  } satisfies SuspiciousSalesReportWarning;
}

export async function getRecentSalesReports(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salesReportSelect)
    .eq("report_type", "sales")
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(asSalesReport);
}

export async function getSalesReportsForStore(storeId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salesReportSelect)
    .eq("report_type", "sales")
    .eq("store_id", storeId)
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(asSalesReport);
}

export async function getSalesReportForStoreDate(storeId: string, reportDate: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salesReportSelect)
    .eq("report_type", "sales")
    .eq("store_id", storeId)
    .eq("report_date", reportDate)
    .maybeSingle();

  return data ? asSalesReport(data) : null;
}

export async function getUnmatchedStaffWarningsFromReports({
  endDate,
  startDate,
  storeIds,
}: {
  endDate: string;
  startDate: string;
  storeIds: string[];
}) {
  if (!storeIds.length) {
    return [] as UnmatchedStaffReportWarning[];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("id,store_id,report_date,summary")
    .eq("report_type", "sales")
    .in("store_id", storeIds)
    .gte("report_date", startDate)
    .lte("report_date", endDate);

  const warningMap = new Map<string, UnmatchedStaffReportWarning>();

  for (const report of data ?? []) {
    if (!report.store_id) {
      continue;
    }

    const summary = summaryObject(report.summary);
    const count = Number(summary?.unmatchedStaffCount ?? 0);
    const names = summaryStringArray(summary?.unmatchedStaffNames);

    if (count <= 0 && !names.length) {
      continue;
    }

    const current =
      warningMap.get(report.store_id) ??
      {
        count: 0,
        names: [],
        reportDates: [],
        reportIds: [],
        storeId: report.store_id,
      };
    current.count += count || names.length;
    current.names = [...new Set([...current.names, ...names])].sort();
    current.reportIds.push(report.id);
    if (report.report_date) {
      current.reportDates = [...new Set([...current.reportDates, report.report_date])].sort();
    }
    warningMap.set(report.store_id, current);
  }

  return [...warningMap.values()].sort((a, b) => b.count - a.count);
}

export async function getSuspiciousSalesReportWarningsFromReports({
  deep = false,
  endDate,
  startDate,
  storeIds,
}: {
  deep?: boolean;
  endDate: string;
  startDate: string;
  storeIds: string[];
}) {
  if (!storeIds.length) {
    return [] as SuspiciousSalesReportWarning[];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salesReportSelect)
    .eq("report_type", "sales")
    .eq("status", "processed")
    .in("store_id", storeIds)
    .gte("report_date", startDate)
    .lte("report_date", endDate);
  const reports = (data ?? []).map(asSalesReport);
  const summaryWarnings = reports
    .filter(isSalesReportSummarySuspicious)
    .map((report) => buildSuspiciousSalesReportWarning(report));

  if (!deep || !reports.length) {
    return summaryWarnings;
  }

  const reportIds = reports.map((report) => report.id);
  const { data: rows } = await supabase
    .from("sales_rows")
    .select("report_id,net_sale")
    .in("report_id", reportIds);
  const aggregateMap = new Map<string, { count: number; total: number }>();

  for (const row of rows ?? []) {
    const reportId = row.report_id;
    if (!reportId) {
      continue;
    }

    const current = aggregateMap.get(reportId) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(row.net_sale ?? 0);
    aggregateMap.set(reportId, current);
  }

  const warningMap = new Map(summaryWarnings.map((warning) => [warning.reportId, warning]));

  for (const report of reports) {
    const aggregate = aggregateMap.get(report.id);
    const summary = summaryObject(report.summary);
    const summaryTotal = summaryNumber(summary?.totalNetSale);
    const summaryMismatch = Boolean(aggregate && Math.abs(summaryTotal - aggregate.total) > 1);
    const rowAggregateSuspicious = Boolean(
      aggregate && aggregate.count > 0 && aggregate.total === 0 && Number(report.row_count ?? summary?.rowCount ?? 0) > 0,
    );

    if (!summaryMismatch && !rowAggregateSuspicious) {
      continue;
    }

    warningMap.set(
      report.id,
      buildSuspiciousSalesReportWarning(report, {
        salesRowsCount: aggregate?.count ?? null,
        salesRowsNetSale: aggregate?.total ?? null,
        summaryMismatch,
      }),
    );
  }

  return [...warningMap.values()].sort((a, b) => {
    const dateCompare = String(b.reportDate ?? "").localeCompare(String(a.reportDate ?? ""));
    return dateCompare || a.storeName.localeCompare(b.storeName);
  });
}

export async function getSuspiciousSalesReportWarningsForReportIds(reportIds: string[]) {
  const uniqueReportIds = [...new Set(reportIds)].filter(Boolean);
  if (!uniqueReportIds.length) {
    return [] as SuspiciousSalesReportWarning[];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salesReportSelect)
    .eq("report_type", "sales")
    .eq("status", "processed")
    .in("id", uniqueReportIds);
  const reports = (data ?? []).map(asSalesReport);
  const { data: rows } = await supabase
    .from("sales_rows")
    .select("report_id,net_sale")
    .in("report_id", reports.map((report) => report.id));
  const aggregateMap = new Map<string, { count: number; total: number }>();

  for (const row of rows ?? []) {
    const reportId = row.report_id;
    if (!reportId) {
      continue;
    }

    const current = aggregateMap.get(reportId) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(row.net_sale ?? 0);
    aggregateMap.set(reportId, current);
  }

  return reports
    .map((report) => {
      const aggregate = aggregateMap.get(report.id);
      const summary = summaryObject(report.summary);
      const summaryTotal = summaryNumber(summary?.totalNetSale);
      const summaryMismatch = Boolean(aggregate && Math.abs(summaryTotal - aggregate.total) > 1);
      return buildSuspiciousSalesReportWarning(report, {
        salesRowsCount: aggregate?.count ?? null,
        salesRowsNetSale: aggregate?.total ?? null,
        summaryMismatch,
      });
    })
    .filter((warning) => warning.summarySuspicious || warning.rowAggregateSuspicious || warning.summaryMismatch);
}

export async function getStoreSalesStatuses(
  stores: Array<{ id: string; name: string; code: string }>,
) {
  const todayDate = getIndiaToday();
  const yesterdayDate = addDays(todayDate, -1);
  const storeIds = stores.map((store) => store.id);

  if (!storeIds.length) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salesReportSelect)
    .eq("report_type", "sales")
    .in("store_id", storeIds)
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const reports = (data ?? []).map(asSalesReport);

  return stores.map((store) => {
    const recentReports = reports
      .filter((report) => report.store_id === store.id)
      .slice(0, 5);

    return {
      store,
      todayDate,
      todayReport:
        reports.find(
          (report) => report.store_id === store.id && report.report_date === todayDate,
        ) ?? null,
      yesterdayDate,
      yesterdayReport:
        reports.find(
          (report) => report.store_id === store.id && report.report_date === yesterdayDate,
        ) ?? null,
      latestReport: recentReports[0] ?? null,
      recentReports,
    } satisfies StoreSalesStatus;
  });
}
