import "server-only";
import { completeQuery } from "@/lib/supabase/complete-query";
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
import { getAnalyticsQueryPath } from "@/lib/analytics/query-path";
import {
  decodeSalesSummaryV2,
  decodeStaffSalesSummaryV2,
  decodeStockStoreSummaryV2,
  phase1AnalyticsRpc,
  phase1Number,
  phase1Record,
  phase1Records,
  phase1Text,
  phase1TextList,
} from "@/lib/analytics/phase1";
import { recordShadowComparison } from "@/lib/observability/performance";

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
    completeQuery(supabase
      .from("rack_reviews")
      .select("review_date", { count: "exact" })
      .eq("store_id", storeId)
      .gte("review_date", weekRange.startDate)
      .lte("review_date", weekRange.endDate)),
    completeQuery(supabase
      .from("cleaning_reviews")
      .select("review_date", { count: "exact" })
      .eq("store_id", storeId)
      .gte("review_date", weekRange.startDate)
      .lte("review_date", weekRange.endDate)),
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
    completeQuery(supabase
      .from("reports")
      .select("report_date", { count: "exact" })
      .eq("report_type", "sales").eq("is_current", true).eq("status", "processed")
      .eq("store_id", store.id)
      .gte("report_date", weekRange.startDate)
      .lte("report_date", weekRange.endDate)),
    completeQuery(supabase
      .from("manager_updates")
      .select("created_at", { count: "exact" })
      .eq("store_id", store.id)
      .gte("created_at", `${weekRange.startDate}T00:00:00+05:30`)
      .lte("created_at", `${weekRange.endDate}T23:59:59+05:30`)),
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
    completeQuery(supabase
      .from("manager_updates")
      .select(
        "*,stores(id,name,code),created_profile:profiles!manager_updates_created_by_fkey(id,full_name,email),created_task:tasks!manager_updates_created_task_id_fkey(id,title,status,due_date)", { count: "exact" },
      )
      .eq("store_id", storeId)
      .gte("created_at", `${weekRange.startDate}T00:00:00+05:30`)
      .lte("created_at", `${weekRange.endDate}T23:59:59+05:30`)
      .order("created_at", { ascending: false })),
    completeQuery(supabase
      .from("manager_updates")
      .select("id", { count: "exact" })
      .eq("store_id", storeId)
      .eq("urgency", "urgent")
      .or("status.is.null,status.eq.open")),
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
  const { data } = await completeQuery(supabase
    .from("tasks")
    .select("id,status,due_date,created_at,completed_at", { count: "exact" })
    .eq("store_id", storeId)
    .or(
      `created_at.gte.${weekRange.startDate}T00:00:00+05:30,completed_at.gte.${weekRange.startDate}T00:00:00+05:30,due_date.lte.${weekRange.endDate}`,
    ));
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
    slowStockCount: summary.candidateCounts.slow,
    deadStockCount: summary.candidateCounts.dead,
    fastMovingLowStockCount: summary.candidateCounts.fastLow,
    highStockLowSaleCount: summary.candidateCounts.highLow,
    summary,
  } satisfies WeeklyStockSignalAudit;
}

async function getLegacyStoreWeeklyAuditSummary(store: Store, weekRange: DateRange) {
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
  const path = getAnalyticsQueryPath();
  if (path === "legacy") return Promise.all(stores.map((store) => getLegacyStoreWeeklyAuditSummary(store, weekRange)));

  const loadCandidate = async () => {
    const payload = phase1Record(await phase1AnalyticsRpc("weekly_audit_summary_v2", {
      p_store_ids: stores.map((store) => store.id),
      p_start: weekRange.startDate,
      p_end: weekRange.endDate,
      p_top_limit: 5,
    }));
    const storeById = new Map(stores.map((store) => [store.id, store]));

    return Promise.all(phase1Records(payload.stores).map(async (row) => {
      const rawStore = phase1Record(row.store);
      const store = storeById.get(phase1Text(rawStore.id));
      if (!store) throw new Error("Weekly audit returned an inaccessible store.");
      const sales = await decodeSalesSummaryV2(row.sales, weekRange, [store]);
      const staff = decodeStaffSalesSummaryV2(row.staff);
      const reviews = phase1Record(row.reviews);
      const checklist = phase1Record(row.checklist);
      const updates = phase1Record(row.updates);
      const tasks = phase1Record(row.tasks);
      const stockSignals = phase1Record(row.stock_signals);
      const stockRow = stockSignals.summary;
      const important = phase1Records(updates.latest_important).map((item) => ({
        id: phase1Text(item.id),
        store_id: store.id,
        created_by: null,
        title: phase1Text(item.title),
        details: null,
        category: null,
        urgency: phase1Text(item.urgency) || null,
        status: phase1Text(item.status) || null,
        photo_path: null,
        created_task_id: null,
        created_at: phase1Text(item.created_at) || null,
        updated_at: null,
        stores: { id: store.id, name: store.name, code: store.code },
        created_profile: null,
        created_task: null,
      } satisfies ManagerUpdate));

      return {
        store,
        weekRange,
        sales: { ...sales.summary, freshness: sales.freshness },
        staff: staff.staff,
        missingSalesReports: phase1Records(row.missing_sales_reports).map((missing) => ({
          store,
          date: phase1Text(missing.date),
          status: phase1Text(missing.status) === "today-not-uploaded" ? "today-not-uploaded" as const : "missing" as const,
        })),
        reviews: {
          rackCompletedDays: phase1Number(reviews.rack_completed_days),
          cleaningCompletedDays: phase1Number(reviews.cleaning_completed_days),
          rackDates: phase1TextList(reviews.rack_dates),
          cleaningDates: phase1TextList(reviews.cleaning_dates),
        },
        checklist: {
          salesReportDays: phase1Number(checklist.sales_report_days),
          rackReviewDays: phase1Number(checklist.rack_review_days),
          cleaningReviewDays: phase1Number(checklist.cleaning_review_days),
          managerUpdateDays: phase1Number(checklist.manager_update_days),
          estimatedCompletionPercent: phase1Number(checklist.estimated_completion_percent),
        },
        updates: {
          openUrgentCount: phase1Number(updates.open_urgent_count),
          createdCount: phase1Number(updates.created_count),
          resolvedCount: phase1Number(updates.resolved_count),
          latestImportant: important,
        },
        tasks: {
          createdCount: phase1Number(tasks.created_count),
          completedCount: phase1Number(tasks.completed_count),
          overduePendingCount: phase1Number(tasks.overdue_pending_count),
        },
        stockSignals: {
          stockMonth: phase1Text(stockSignals.stock_month) || null,
          slowStockCount: phase1Number(stockSignals.slow_stock_count),
          deadStockCount: phase1Number(stockSignals.dead_stock_count),
          fastMovingLowStockCount: phase1Number(stockSignals.fast_moving_low_stock_count),
          highStockLowSaleCount: phase1Number(stockSignals.high_stock_low_sale_count),
          summary: stockRow ? decodeStockStoreSummaryV2(stockRow, 30) : null,
        },
      } satisfies StoreWeeklyAuditSummary;
    }));
  };

  if (path === "v2") return loadCandidate();
  const [legacy, candidate] = await Promise.all([
    Promise.all(stores.map((store) => getLegacyStoreWeeklyAuditSummary(store, weekRange))),
    loadCandidate(),
  ]);
  await recordShadowComparison("weekly_audit_summary", JSON.stringify(legacy.map((row) => ({
    id: row.store.id,
    sale: row.sales.totalNetSale,
    missing: row.missingSalesReports.length,
    tasks: row.tasks.overduePendingCount,
  }))) === JSON.stringify(candidate.map((row) => ({
    id: row.store.id,
    sale: row.sales.totalNetSale,
    missing: row.missingSalesReports.length,
    tasks: row.tasks.overduePendingCount,
  }))));
  return legacy;
}

export async function getStoreWeeklyAuditSummary(store: Store, weekRange: DateRange) {
  const [summary] = await getWeeklyAuditSummaries([store], weekRange);
  return summary;
}

export function previousWeekDateParam() {
  return getPreviousWeekRangeAsiaKolkata().startDate;
}

export function currentWeekSalesPeriod() {
  return getDateRangeForPeriod("week");
}
