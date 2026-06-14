import { addDays, getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";

export type SalesReportSummary = {
  totalNetSale?: number;
  rowCount?: number;
  billCount?: number;
  returnsCount?: number;
  staffNames?: string[];
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
