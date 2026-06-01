import type { Store } from "@/lib/auth/session";
import {
  getDateRangeForPeriod,
  getMissingSalesReportDates,
  getSalesSummary,
  getStaffSalesSummary,
  type DateRange,
  type StaffSalesSummary,
  type SalesSummary,
  type MissingSalesReportDate,
} from "@/lib/analytics/sales";
import { getLatestStockMonth, getStockSummary, type StockSummary } from "@/lib/analytics/stock";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaToday, isMondayInIndia } from "@/lib/tasks/dates";
import type { ManagerUpdate } from "@/lib/updates/queries";

export type WeeklyReviewAudit = {
  rackCompletedDays: number;
  cleaningCompletedDays: number;
  rackDates: string[];
  cleaningDates: string[];
};

export type WeeklyChecklistAudit = {
  salesReportDays: number;
  rackReviewDays: number;
  cleaningReviewDays: number;
  managerUpdateDays: number;
  estimatedCompletionPercent: number;
};

export type WeeklyUpdateAudit = {
  openUrgentCount: number;
  createdCount: number;
  resolvedCount: number;
  latestImportant: ManagerUpdate[];
};

export type WeeklyTaskAudit = {
  createdCount: number;
  completedCount: number;
  overduePendingCount: number;
};

export type WeeklyStockSignalAudit = {
  stockMonth: string | null;
  slowStockCount: number;
  deadStockCount: number;
  fastMovingLowStockCount: number;
  highStockLowSaleCount: number;
  summary: StockSummary | null;
};

export type StoreWeeklyAuditSummary = {
  store: Store;
  weekRange: DateRange;
  sales: SalesSummary;
  staff: StaffSalesSummary[];
  missingSalesReports: MissingSalesReportDate[];
  checklist: WeeklyChecklistAudit;
  reviews: WeeklyReviewAudit;
  updates: WeeklyUpdateAudit;
  tasks: WeeklyTaskAudit;
  stockSignals: WeeklyStockSignalAudit;
};

function parseIndiaDate(dateText: string) {
  return new Date(`${dateText}T00:00:00+05:30`);
}

function formatIndiaDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(date);
}

function weekStartFor(dateText: string) {
  const date = parseIndiaDate(dateText);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return formatIndiaDate(date);
}

export function getPreviousWeekRangeAsiaKolkata(today = getIndiaToday()) {
  const currentWeekStart = weekStartFor(today);
  const previousWeekEnd = addDays(currentWeekStart, -1);
  const previousWeekStart = addDays(previousWeekEnd, -6);

  return {
    startDate: previousWeekStart,
    endDate: previousWeekEnd,
  } satisfies DateRange;
}

export function getWeekRangeFromDate(dateText: string) {
  const startDate = weekStartFor(dateText);

  return {
    startDate,
    endDate: addDays(startDate, 6),
  } satisfies DateRange;
}

export function getDefaultWeeklyAuditRange(mode?: string, weekDate?: string) {
  if (weekDate) {
    return getWeekRangeFromDate(weekDate);
  }

  if (mode === "current") {
    return getWeekRangeFromDate(getIndiaToday());
  }

  return getPreviousWeekRangeAsiaKolkata();
}

export function isWeeklyAuditDay() {
  return isMondayInIndia();
}

export async function getWeeklySalesAudit(store: Store, weekRange: DateRange) {
  return getSalesSummary({ storeIds: [store.id], dateRange: weekRange }, [store]);
}

export async function getWeeklyStaffAudit(store: Store, weekRange: DateRange) {
  return getStaffSalesSummary({ storeIds: [store.id], dateRange: weekRange });
}

export async function getWeeklyReviewAudit(storeId: string, weekRange: DateRange) {
  const supabase = await createClient();
  const [rackResult, cleaningResult] = await Promise.all([
    supabase
      .from("rack_reviews")
      .select("review_date")
      .eq("store_id", storeId)
      .gte("review_date", weekRange.startDate)
      .lte("review_date", weekRange.endDate),
    supabase
      .from("cleaning_reviews")
      .select("review_date")
      .eq("store_id", storeId)
      .gte("review_date", weekRange.startDate)
      .lte("review_date", weekRange.endDate),
  ]);
  const rackDates = [...new Set((rackResult.data ?? []).map((row) => row.review_date).filter(Boolean))] as string[];
  const cleaningDates = [
    ...new Set((cleaningResult.data ?? []).map((row) => row.review_date).filter(Boolean)),
  ] as string[];

  return {
    rackCompletedDays: rackDates.length,
    cleaningCompletedDays: cleaningDates.length,
    rackDates,
    cleaningDates,
  } satisfies WeeklyReviewAudit;
}

export async function getWeeklyChecklistAudit(
  store: Store,
  weekRange: DateRange,
  reviews: WeeklyReviewAudit,
) {
  const supabase = await createClient();
  const [reportsResult, updatesResult] = await Promise.all([
    supabase
      .from("reports")
      .select("report_date")
      .eq("report_type", "sales")
      .eq("store_id", store.id)
      .gte("report_date", weekRange.startDate)
      .lte("report_date", weekRange.endDate),
    supabase
      .from("manager_updates")
      .select("created_at")
      .eq("store_id", store.id)
      .gte("created_at", `${weekRange.startDate}T00:00:00+05:30`)
      .lte("created_at", `${weekRange.endDate}T23:59:59+05:30`),
  ]);
  const salesReportDays = new Set((reportsResult.data ?? []).map((row) => row.report_date).filter(Boolean)).size;
  const managerUpdateDays = new Set(
    (updatesResult.data ?? [])
      .map((row) => row.created_at?.slice(0, 10))
      .filter(Boolean),
  ).size;
  const totalSignals = 7 * 4;
  const completedSignals =
    salesReportDays + reviews.rackCompletedDays + reviews.cleaningCompletedDays + managerUpdateDays;

  return {
    salesReportDays,
    rackReviewDays: reviews.rackCompletedDays,
    cleaningReviewDays: reviews.cleaningCompletedDays,
    managerUpdateDays,
    estimatedCompletionPercent: Math.round((completedSignals / totalSignals) * 100),
  } satisfies WeeklyChecklistAudit;
}

export async function getWeeklyUpdateAudit(storeId: string, weekRange: DateRange) {
  const supabase = await createClient();
  const [weekResult, openUrgentResult] = await Promise.all([
    supabase
      .from("manager_updates")
      .select(
        "*,stores(id,name,code),created_profile:profiles!manager_updates_created_by_fkey(id,full_name,email),created_task:tasks!manager_updates_created_task_id_fkey(id,title,status,due_date)",
      )
      .eq("store_id", storeId)
      .gte("created_at", `${weekRange.startDate}T00:00:00+05:30`)
      .lte("created_at", `${weekRange.endDate}T23:59:59+05:30`)
      .order("created_at", { ascending: false }),
    supabase
      .from("manager_updates")
      .select("id")
      .eq("store_id", storeId)
      .eq("urgency", "urgent")
      .or("status.is.null,status.eq.open"),
  ]);
  const updates = (weekResult.data ?? []) as ManagerUpdate[];

  return {
    openUrgentCount: (openUrgentResult.data ?? []).length,
    createdCount: updates.length,
    resolvedCount: updates.filter((update) => update.status === "resolved").length,
    latestImportant: updates
      .filter((update) => update.urgency === "urgent" || update.status === "open")
      .slice(0, 5),
  } satisfies WeeklyUpdateAudit;
}

export async function getWeeklyTaskAudit(storeId: string, weekRange: DateRange) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id,status,due_date,created_at,completed_at")
    .eq("store_id", storeId)
    .or(
      `created_at.gte.${weekRange.startDate}T00:00:00+05:30,completed_at.gte.${weekRange.startDate}T00:00:00+05:30,due_date.lte.${weekRange.endDate}`,
    );
  const tasks = data ?? [];

  return {
    createdCount: tasks.filter((task) => {
      const createdDate = task.created_at?.slice(0, 10);
      return Boolean(createdDate && createdDate >= weekRange.startDate && createdDate <= weekRange.endDate);
    }).length,
    completedCount: tasks.filter((task) => {
      const completedDate = task.completed_at?.slice(0, 10);
      return Boolean(completedDate && completedDate >= weekRange.startDate && completedDate <= weekRange.endDate);
    }).length,
    overduePendingCount: tasks.filter((task) => {
      const status = task.status ?? "pending";
      return status !== "done" && status !== "cancelled" && Boolean(task.due_date && task.due_date <= weekRange.endDate);
    }).length,
  } satisfies WeeklyTaskAudit;
}

export async function getWeeklyStockSignalAudit(store: Store) {
  const stockMonth = await getLatestStockMonth(store.id);

  if (!stockMonth) {
    return {
      stockMonth: null,
      slowStockCount: 0,
      deadStockCount: 0,
      fastMovingLowStockCount: 0,
      highStockLowSaleCount: 0,
      summary: null,
    } satisfies WeeklyStockSignalAudit;
  }

  const summary = await getStockSummary({
    storeIds: [store.id],
    stockMonth,
    lookbackDays: 30,
    stores: [store],
  });

  return {
    stockMonth,
    slowStockCount: summary.slowStockCandidates.length,
    deadStockCount: summary.deadStockCandidates.length,
    fastMovingLowStockCount: summary.fastMovingLowStockCandidates.length,
    highStockLowSaleCount: summary.highStockLowSaleCandidates.length,
    summary,
  } satisfies WeeklyStockSignalAudit;
}

export async function getStoreWeeklyAuditSummary(store: Store, weekRange: DateRange) {
  const [sales, staff, missingSalesReports, reviews, updates, tasks, stockSignals] =
    await Promise.all([
      getWeeklySalesAudit(store, weekRange),
      getWeeklyStaffAudit(store, weekRange),
      getMissingSalesReportDates([store], weekRange),
      getWeeklyReviewAudit(store.id, weekRange),
      getWeeklyUpdateAudit(store.id, weekRange),
      getWeeklyTaskAudit(store.id, weekRange),
      getWeeklyStockSignalAudit(store),
    ]);
  const checklist = await getWeeklyChecklistAudit(store, weekRange, reviews);

  return {
    store,
    weekRange,
    sales,
    staff,
    missingSalesReports,
    checklist,
    reviews,
    updates,
    tasks,
    stockSignals,
  } satisfies StoreWeeklyAuditSummary;
}

export async function getWeeklyAuditSummaries(stores: Store[], weekRange: DateRange) {
  return Promise.all(stores.map((store) => getStoreWeeklyAuditSummary(store, weekRange)));
}

export function previousWeekDateParam() {
  return getPreviousWeekRangeAsiaKolkata().startDate;
}

export function currentWeekSalesPeriod() {
  return getDateRangeForPeriod("week");
}
