import { addDays, getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";

export type SalesReportSummary = {
  totalNetSale?: number;
  rowCount?: number;
  billCount?: number;
  staffNames?: string[];
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
  stores: { id: string; name: string; code: string } | null;
};

export type StoreSalesStatus = {
  store: { id: string; name: string; code: string };
  yesterdayDate: string;
  yesterdayReport: SalesReportWithStore | null;
  latestReport: SalesReportWithStore | null;
  recentReports: SalesReportWithStore[];
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
  stores(id,name,code)
`;

function asSalesReport(report: unknown) {
  return report as SalesReportWithStore;
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

export async function getStoreSalesStatuses(
  stores: Array<{ id: string; name: string; code: string }>,
) {
  const yesterdayDate = addDays(getIndiaToday(), -1);
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
