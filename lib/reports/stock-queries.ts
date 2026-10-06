import "server-only";
import { completeQuery, checkedQuery } from "@/lib/supabase/complete-query";
import { addDays, getIndiaDayOfMonth, getIndiaMonthStart, getIndiaToday, isMondayInIndia, weekStartOf } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";

export type StockReportSummary = {
  uploadedForMonth?: string;
  uploadedAt?: string;
  originalFileName?: string;
  fileType?: string;
  totalQuantity?: number;
  totalStockValueMrp?: number | null;
  brandsFound?: string[];
  categoriesFound?: string[];
  brandSummary?: Record<string, number>;
  categorySummary?: Record<string, number>;
  topBrands?: Array<{ name: string; quantity: number }>;
  topCategories?: Array<{ name: string; quantity: number }>;
  itemCount?: number;
  rowCount?: number;
};

export type StockReportWithStore = {
  id: string;
  store_id: string | null;
  uploaded_by: string | null;
  report_date: string | null;
  period_month: string | null;
  file_name: string | null;
  file_path: string | null;
  row_count: number | null;
  status: string | null;
  created_at: string | null;
  summary: StockReportSummary | null;
  stores: { id: string; name: string; code: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

export type StoreStockStatus = {
  store: { id: string; name: string; code: string };
  periodMonth: string;
  /** Newest stock file if it is at most 7 days old. */
  report: StockReportWithStore | null;
  /** Stock date of the newest file, however old. */
  latestDate: string | null;
  recentReports: StockReportWithStore[];
};

export type StockOverview = {
  today: string;
  dayOfMonth: number;
  periodMonth: string;
  dueDate: string;
  statuses: StoreStockStatus[];
  uploadedCount: number;
  missingCount: number;
  headline: string;
};

const stockReportSelect = `
  id,
  store_id,
  uploaded_by,
  report_date,
  period_month,
  file_name,
  file_path,
  row_count,
  status,
  created_at,
  summary,
  stores(id,name,code),
  profiles(full_name,email)
`;

function asStockReport(report: unknown) {
  return report as StockReportWithStore;
}

/** Current stock reports for the owner's correction list, newest month first. */
export async function getCorrectionStockReports(storeId: string | "all", limit = 24) {
  const supabase = await createClient();
  let query = supabase
    .from("reports")
    .select(stockReportSelect, { count: "exact" })
    .eq("report_type", "stock").eq("is_current", true).eq("status", "processed");
  if (storeId !== "all") query = query.eq("store_id", storeId);
  const { data } = await checkedQuery(query
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit));
  return (data ?? []).map(asStockReport);
}

export async function getRecentStockReports(limit = 8) {
  const supabase = await createClient();
  const { data } = await checkedQuery(supabase
    .from("reports")
    .select(stockReportSelect, { count: "exact" })
    .eq("report_type", "stock").eq("is_current", true).eq("status", "processed")
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit));

  return (data ?? []).map(asStockReport);
}

export async function getStockReportsForStore(storeId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await checkedQuery(supabase
    .from("reports")
    .select(stockReportSelect, { count: "exact" })
    .eq("report_type", "stock").eq("is_current", true).eq("status", "processed")
    .eq("store_id", storeId)
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit));

  return (data ?? []).map(asStockReport);
}

export async function getStockReportForStoreMonth(
  storeId: string,
  periodMonth = getIndiaMonthStart(),
) {
  const supabase = await createClient();
  const { data } = await checkedQuery(supabase
    .from("reports")
    .select(stockReportSelect, { count: "exact" })
    .eq("report_type", "stock").eq("is_current", true).eq("status", "processed")
    .eq("store_id", storeId)
    .eq("period_month", periodMonth)
    .maybeSingle());

  return data ? asStockReport(data) : null;
}

export async function getStoreStockStatuses(
  stores: Array<{ id: string; name: string; code: string }>,
  periodMonth = getIndiaMonthStart(),
) {
  const storeIds = stores.map((store) => store.id);

  if (!storeIds.length) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await completeQuery(supabase
    .from("reports")
    .select(stockReportSelect, { count: "exact" })
    .eq("report_type", "stock").eq("is_current", true).eq("status", "processed")
    .in("store_id", storeIds)
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }));
  const reports = (data ?? []).map(asStockReport);

  return stores.map((store) => {
    const recentReports = reports
      .filter((report) => report.store_id === store.id)
      .slice(0, 5);

    return {
      store,
      periodMonth,
      // Stock is uploaded weekly: up to date when the newest stock file is at
      // most 7 days old (report_date is the stock date of the file).
      report:
        reports
          .filter((report) => report.store_id === store.id && report.report_date && report.report_date >= addDays(getIndiaToday(), -7))
          .sort((left, right) => String(right.report_date).localeCompare(String(left.report_date)))[0] ?? null,
      latestDate: reports
        .filter((report) => report.store_id === store.id && report.report_date)
        .map((report) => String(report.report_date))
        .sort()
        .at(-1) ?? null,
      recentReports,
    } satisfies StoreStockStatus;
  });
}

export async function getStockOverview(stores: Array<{ id: string; name: string; code: string }>) {
  const today = getIndiaToday();
  const dayOfMonth = getIndiaDayOfMonth(today);
  const periodMonth = getIndiaMonthStart(today);
  const statuses = await getStoreStockStatuses(stores, periodMonth);
  const missingCount = statuses.filter((status) => !status.report).length;
  const uploadedCount = statuses.length - missingCount;
  const allUploaded = statuses.length > 0 && missingCount === 0;

  let headline = "Stock is up to date";
  if (missingCount > 0) {
    headline = isMondayInIndia(today) ? "Weekly stock due today" : "Weekly stock pending";
  } else if (!allUploaded) {
    headline = "Next stock upload on Monday";
  }

  return {
    today,
    dayOfMonth,
    periodMonth,
    dueDate: weekStartOf(today),
    statuses,
    uploadedCount,
    missingCount,
    headline,
  } satisfies StockOverview;
}
