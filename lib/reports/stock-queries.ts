import { getIndiaDayOfMonth, getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";
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
  report: StockReportWithStore | null;
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

export async function getRecentStockReports(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(stockReportSelect)
    .eq("report_type", "stock")
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(asStockReport);
}

export async function getStockReportsForStore(storeId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(stockReportSelect)
    .eq("report_type", "stock")
    .eq("store_id", storeId)
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(asStockReport);
}

export async function getStockReportForStoreMonth(
  storeId: string,
  periodMonth = getIndiaMonthStart(),
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(stockReportSelect)
    .eq("report_type", "stock")
    .eq("store_id", storeId)
    .eq("period_month", periodMonth)
    .maybeSingle();

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
  const { data } = await supabase
    .from("reports")
    .select(stockReportSelect)
    .eq("report_type", "stock")
    .in("store_id", storeIds)
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const reports = (data ?? []).map(asStockReport);

  return stores.map((store) => {
    const recentReports = reports
      .filter((report) => report.store_id === store.id)
      .slice(0, 5);

    return {
      store,
      periodMonth,
      report:
        reports.find(
          (report) => report.store_id === store.id && report.period_month === periodMonth,
        ) ?? null,
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

  let headline = "Next stock report due";
  if (dayOfMonth === 1) {
    headline = "Stock report due today";
  } else if (missingCount > 0) {
    headline = "Stock report pending";
  } else if (allUploaded) {
    headline = "Stock report ready";
  }

  return {
    today,
    dayOfMonth,
    periodMonth,
    dueDate: periodMonth,
    statuses,
    uploadedCount,
    missingCount,
    headline,
  } satisfies StockOverview;
}
