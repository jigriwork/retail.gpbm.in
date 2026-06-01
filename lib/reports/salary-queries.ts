import { getIndiaDayOfMonth, getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";

export type SalaryAttendanceSummary = {
  uploadedForMonth?: string;
  uploadedAt?: string;
  originalFileName?: string;
  fileType?: string;
};

export type SalaryAttendanceReportWithStore = {
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
  summary: SalaryAttendanceSummary | null;
  stores: { id: string; name: string; code: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

export type StoreSalaryAttendanceStatus = {
  store: { id: string; name: string; code: string };
  periodMonth: string;
  report: SalaryAttendanceReportWithStore | null;
  recentReports: SalaryAttendanceReportWithStore[];
};

export type SalaryAttendanceOverview = {
  today: string;
  dayOfMonth: number;
  periodMonth: string;
  dueDate: string;
  salaryDate: string;
  statuses: StoreSalaryAttendanceStatus[];
  uploadedCount: number;
  missingCount: number;
  isDueVisible: boolean;
  headline: string;
};

const salaryReportSelect = `
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

function asSalaryAttendanceReport(report: unknown) {
  return report as SalaryAttendanceReportWithStore;
}

export async function getRecentSalaryAttendanceReports(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salaryReportSelect)
    .eq("report_type", "salary_attendance")
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(asSalaryAttendanceReport);
}

export async function getSalaryAttendanceReportsForStore(storeId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salaryReportSelect)
    .eq("report_type", "salary_attendance")
    .eq("store_id", storeId)
    .order("period_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(asSalaryAttendanceReport);
}

export async function getSalaryAttendanceReportForStoreMonth(
  storeId: string,
  periodMonth = getIndiaMonthStart(),
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select(salaryReportSelect)
    .eq("report_type", "salary_attendance")
    .eq("store_id", storeId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  return data ? asSalaryAttendanceReport(data) : null;
}

export async function getStoreSalaryAttendanceStatuses(
  stores: Array<{ id: string; name: string; code: string }>,
  periodMonth = getIndiaMonthStart(),
) {
  return Promise.all(
    stores.map(async (store) => {
      const recentReports = await getSalaryAttendanceReportsForStore(store.id, 5);
      const report =
        recentReports.find((item) => item.period_month === periodMonth) ??
        (await getSalaryAttendanceReportForStoreMonth(store.id, periodMonth));

      return {
        store,
        periodMonth,
        report,
        recentReports,
      } satisfies StoreSalaryAttendanceStatus;
    }),
  );
}

export async function getSalaryAttendanceOverview(
  stores: Array<{ id: string; name: string; code: string }>,
) {
  const today = getIndiaToday();
  const dayOfMonth = getIndiaDayOfMonth(today);
  const periodMonth = getIndiaMonthStart(today);
  const statuses = await getStoreSalaryAttendanceStatuses(stores, periodMonth);
  const missingCount = statuses.filter((status) => !status.report).length;
  const uploadedCount = statuses.length - missingCount;
  const dueDate = periodMonth;
  const salaryDate = `${today.slice(0, 7)}-03`;
  const allUploaded = statuses.length > 0 && missingCount === 0;
  const isDueVisible = dayOfMonth >= 1 && (!allUploaded || dayOfMonth === 1 || dayOfMonth === 3);

  let headline = "Next salary attendance due";
  if (dayOfMonth === 3) {
    headline = "Salary day today";
  } else if (dayOfMonth === 1) {
    headline = "Salary attendance due today";
  } else if (missingCount > 0) {
    headline = "Salary attendance pending";
  } else if (allUploaded) {
    headline = "Salary attendance ready";
  }

  return {
    today,
    dayOfMonth,
    periodMonth,
    dueDate,
    salaryDate,
    statuses,
    uploadedCount,
    missingCount,
    isDueVisible,
    headline,
  } satisfies SalaryAttendanceOverview;
}
