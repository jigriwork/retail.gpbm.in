import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  ClipboardList,
  PackageSearch,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { ChecklistCard } from "@/components/checklist/checklist-card";
import { SalesReportList } from "@/components/reports/sales-report-list";
import { SalaryAttendanceReportList } from "@/components/reports/salary-attendance-report-list";
import { StockReportList } from "@/components/reports/stock-report-list";
import { ReviewHistoryList } from "@/components/reviews/review-history-list";
import { ReviewStatusCard } from "@/components/reviews/review-status-card";
import { UpdateCard } from "@/components/updates/update-card";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { getStoreSalaryAttendanceStatuses } from "@/lib/reports/salary-queries";
import { getStoreStockStatuses } from "@/lib/reports/stock-queries";
import { getReviewStatuses } from "@/lib/reviews/queries";
import { createClient } from "@/lib/supabase/server";
import { getStoreUpdateSummary } from "@/lib/updates/queries";
import { getStoreChecklist } from "@/lib/checklist/queries";
import {
  getPreviousWeekRangeAsiaKolkata,
  getStoreWeeklyAuditSummary,
} from "@/lib/audit/weekly";
import {
  getLatestStockMonth,
  getStockSummary,
} from "@/lib/analytics/stock";
import {
  calculateTargetProgress,
  currentMonthRange,
  currentWeekRange,
  getDateRangeForPeriod,
  getSalesSummary,
  getStaffSalesSummary,
} from "@/lib/analytics/sales";



function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { profile } = await requireProfile();
  const allowed = await canAccessStore(storeId, profile);

  if (!allowed) {
    return <AccessDenied message="This store is not assigned to your account." />;
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) {
    notFound();
  }

  const [
    salesStatuses,
    salaryStatuses,
    stockStatuses,
    reviewStatuses,
    updateSummary,
    checklist,
    yesterdaySales,
    weekSales,
    monthSales,
    weekStaff,
    storeTasks,
  ] = await Promise.all([
    getStoreSalesStatuses([{ id: store.id, name: store.name, code: store.code }]),
    getStoreSalaryAttendanceStatuses([{ id: store.id, name: store.name, code: store.code }]),
    getStoreStockStatuses([{ id: store.id, name: store.name, code: store.code }]),
    getReviewStatuses([{ id: store.id, name: store.name, code: store.code, type: store.type }]),
    getStoreUpdateSummary(store.id),
    getStoreChecklist(store),
    getSalesSummary(
      { storeIds: [store.id], dateRange: getDateRangeForPeriod("yesterday") },
      [store],
    ),
    getSalesSummary({ storeIds: [store.id], dateRange: currentWeekRange() }, [store]),
    getSalesSummary({ storeIds: [store.id], dateRange: currentMonthRange() }, [store]),
    getStaffSalesSummary({ storeIds: [store.id], dateRange: currentWeekRange() }),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .in("status", ["pending", "in_progress"]),
  ]);
  const [salesStatus] = salesStatuses;
  const [salaryStatus] = salaryStatuses;
  const [stockStatus] = stockStatuses;
  const [reviewStatus] = reviewStatuses;
  const targetProgress = calculateTargetProgress(store, monthSales.totalNetSale);
  const latestStockMonth = await getLatestStockMonth(store.id);
  const stockAnalytics = latestStockMonth
    ? await getStockSummary({
        storeIds: [store.id],
        stockMonth: latestStockMonth,
        lookbackDays: 30,
        stores: [store],
      })
    : null;
  const previousWeekRange = getPreviousWeekRangeAsiaKolkata();
  const weeklyAudit = await getStoreWeeklyAuditSummary(store, previousWeekRange);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Store detail</p>
            <h1 className="mt-2 text-3xl font-semibold">{store.name}</h1>
          </div>
          <Sparkles className="size-5 text-muted" />
        </div>
        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Code</p>
            <p className="mt-1 font-semibold">{store.code}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Type</p>
            <p className="mt-1 font-semibold capitalize">{store.type ?? "store"}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Monthly target</p>
            <p className="mt-1 font-semibold">
              {store.monthly_target_enabled && store.monthly_target
                ? formatMoney(store.monthly_target)
                : "Not set"}
            </p>
          </div>
        </div>
      </section>

      <section>
        <ChecklistCard checklist={checklist} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Weekly audit</p>
            <h2 className="mt-2 text-2xl font-semibold">Previous week summary</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {previousWeekRange.startDate} to {previousWeekRange.endDate}
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href={`/app/audit/${store.id}?week=${previousWeekRange.startDate}`}
          >
            Store audit
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Last week sale</p>
            <p className="mt-1 font-semibold">{formatMoney(weeklyAudit.sales.totalNetSale)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Missing reports</p>
            <p className="mt-1 font-semibold">{weeklyAudit.missingSalesReports.length}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Reviews</p>
            <p className="mt-1 font-semibold">
              Rack {weeklyAudit.reviews.rackCompletedDays}/7 · Cleaning{" "}
              {weeklyAudit.reviews.cleaningCompletedDays}/7
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Checklist estimate</p>
            <p className="mt-1 font-semibold">
              {weeklyAudit.checklist.estimatedCompletionPercent}%
            </p>
          </div>
        </div>
      </section>

      {salesStatus ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Sales</p>
              <h2 className="mt-2 text-2xl font-semibold">Daily sales status</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Yesterday sales report for {salesStatus.yesterdayDate}:{" "}
                <span
                  className={
                    salesStatus.yesterdayReport
                      ? "font-semibold text-success"
                      : "font-semibold text-danger"
                  }
                >
                  {salesStatus.yesterdayReport ? "uploaded" : "missing"}
                </span>
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href={`/app/reports/sales?storeId=${store.id}`}
            >
              Upload sales
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Last uploaded date</p>
              <p className="mt-1 font-semibold">
                {salesStatus.latestReport?.report_date ?? "No upload"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Latest total sale</p>
              <p className="mt-1 font-semibold">
                {formatMoney(salesStatus.latestReport?.summary?.totalNetSale)}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Latest rows</p>
              <p className="mt-1 font-semibold">
                {salesStatus.latestReport?.row_count ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-lg font-semibold">Recent sales reports</h3>
            <SalesReportList
              emptyText="No sales reports uploaded for this store yet."
              reports={salesStatus.recentReports}
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Sales analytics</p>
            <h2 className="mt-2 text-2xl font-semibold">Store sales pulse</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Week leader: {weekStaff[0]?.staffName ?? "No staff data"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href={`/app/reports/sales/analytics?storeId=${store.id}&period=week`}
            >
              Full analytics
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href={`/app/reports/staff?storeId=${store.id}&period=week`}
            >
              Staff sales
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Yesterday sale</p>
            <p className="mt-1 font-semibold">{formatMoney(yesterdaySales.totalNetSale)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">This week sale</p>
            <p className="mt-1 font-semibold">{formatMoney(weekSales.totalNetSale)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">This month sale</p>
            <p className="mt-1 font-semibold">{formatMoney(monthSales.totalNetSale)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Staff leader week</p>
            <p className="mt-1 font-semibold">{weekStaff[0]?.staffName ?? "No staff data"}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Top category week</p>
            <p className="mt-1 font-semibold">{weekSales.topCategories[0]?.name ?? "No category"}</p>
          </div>
        </div>

        {targetProgress ? (
          <div className="mt-5 rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Monthly target</p>
                <p className="mt-1 text-sm text-muted">
                  {formatMoney(targetProgress.monthSale)} of {formatMoney(targetProgress.target)}
                </p>
              </div>
              <p className="text-2xl font-semibold">{targetProgress.percentageAchieved}%</p>
            </div>
            <div className="mt-4 h-2 rounded-full bg-background">
              <div
                className="h-2 rounded-full bg-foreground"
                style={{ width: `${Math.min(targetProgress.percentageAchieved, 100)}%` }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              Balance {formatMoney(targetProgress.balance)}. Required daily{" "}
              {formatMoney(targetProgress.requiredDailySale)} for {targetProgress.daysLeftInMonth} days.
            </p>
          </div>
        ) : null}
      </section>

      {salaryStatus ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Salary attendance</p>
              <h2 className="mt-2 text-2xl font-semibold">Current month status</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Attendance for {salaryStatus.periodMonth}:{" "}
                <span
                  className={
                    salaryStatus.report
                      ? "font-semibold text-success"
                      : "font-semibold text-danger"
                  }
                >
                  {salaryStatus.report ? "uploaded" : "missing"}
                </span>
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href={`/app/reports/salary-attendance?storeId=${store.id}`}
            >
              <CalendarClock className="size-4" />
              Upload/view
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Uploaded date</p>
              <p className="mt-1 font-semibold">
                {salaryStatus.report?.report_date ?? "No upload"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Uploaded by</p>
              <p className="mt-1 font-semibold">
                {salaryStatus.report?.profiles?.full_name ??
                  salaryStatus.report?.profiles?.email ??
                  "No upload"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">File name</p>
              <p className="mt-1 break-words font-semibold">
                {salaryStatus.report?.file_name ?? "No file"}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-lg font-semibold">Recent salary attendance history</h3>
            <SalaryAttendanceReportList
              emptyText="No salary attendance reports uploaded for this store yet."
              reports={salaryStatus.recentReports}
            />
          </div>
        </section>
      ) : null}

      {stockStatus ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Stock</p>
              <h2 className="mt-2 text-2xl font-semibold">Monthly stock status</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Stock report for {stockStatus.periodMonth}:{" "}
                <span
                  className={
                    stockStatus.report
                      ? "font-semibold text-success"
                      : "font-semibold text-danger"
                  }
                >
                  {stockStatus.report ? "uploaded" : "missing"}
                </span>
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href={`/app/reports/stock?storeId=${store.id}`}
            >
              <PackageSearch className="size-4" />
              Upload/view
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Uploaded date</p>
              <p className="mt-1 font-semibold">
                {stockStatus.report?.report_date ?? "No upload"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Uploaded by</p>
              <p className="mt-1 font-semibold">
                {stockStatus.report?.profiles?.full_name ??
                  stockStatus.report?.profiles?.email ??
                  "No upload"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Rows</p>
              <p className="mt-1 font-semibold">{stockStatus.report?.row_count ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Total quantity</p>
              <p className="mt-1 font-semibold">
                {stockStatus.report?.summary?.totalQuantity ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">File name</p>
              <p className="mt-1 break-words font-semibold">
                {stockStatus.report?.file_name ?? "No file"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Brands found</p>
              <p className="mt-1 text-sm font-semibold">
                {(stockStatus.report?.summary?.brandsFound ?? []).slice(0, 6).join(", ") ||
                  "No brand data"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Categories found</p>
              <p className="mt-1 text-sm font-semibold">
                {(stockStatus.report?.summary?.categoriesFound ?? []).slice(0, 6).join(", ") ||
                  "No category data"}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-lg font-semibold">Recent stock report history</h3>
            <StockReportList
              emptyText="No stock reports uploaded for this store yet."
              reports={stockStatus.recentReports}
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Stock analytics</p>
            <h2 className="mt-2 text-2xl font-semibold">
              {latestStockMonth ? `Latest stock ${latestStockMonth}` : "No stock report yet"}
            </h2>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href={`/app/reports/stock/analytics?storeId=${store.id}`}
          >
            Full stock analytics
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Stock quantity</p>
            <p className="mt-1 font-semibold">{stockAnalytics?.totalStockQuantity ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Top category</p>
            <p className="mt-1 font-semibold">{stockAnalytics?.topCategories[0]?.name ?? "No category"}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Slow/dead</p>
            <p className="mt-1 font-semibold">
              {(stockAnalytics?.slowStockCandidates.length ?? 0) +
                (stockAnalytics?.deadStockCandidates.length ?? 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Fast low stock</p>
            <p className="mt-1 font-semibold">
              {stockAnalytics?.fastMovingLowStockCandidates.length ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">High stock low sale</p>
            <p className="mt-1 font-semibold">
              {stockAnalytics?.highStockLowSaleCandidates.length ?? 0}
            </p>
          </div>
        </div>
      </section>

      {reviewStatus ? (
        <section className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <ReviewStatusCard
              href={`/app/reviews/rack?storeId=${store.id}`}
              review={reviewStatus.rackReview}
              storeName={store.name}
              title="Today rack review"
            />
            <ReviewStatusCard
              href={`/app/reviews/cleaning?storeId=${store.id}`}
              review={reviewStatus.cleaningReview}
              storeName={store.name}
              title="Today cleaning review"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Recent rack reviews</h3>
              <ReviewHistoryList
                emptyText="No rack reviews submitted for this store yet."
                reviews={reviewStatus.recentRackReviews}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Recent cleaning reviews</h3>
              <ReviewHistoryList
                emptyText="No cleaning reviews submitted for this store yet."
                reviews={reviewStatus.recentCleaningReviews}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Manager updates</p>
            <h2 className="mt-2 text-2xl font-semibold">Store attention feed</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Open updates: <span className="font-semibold text-foreground">{updateSummary.openCount}</span>{" "}
              · Urgent: <span className="font-semibold text-danger">{updateSummary.urgentCount}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href={`/app/updates/new?storeId=${store.id}`}
            >
              Add update
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href={`/app/updates?storeId=${store.id}`}
            >
              View all
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {updateSummary.latest.length ? (
            updateSummary.latest.map((update) => (
              <UpdateCard compact key={update.id} update={update} />
            ))
          ) : (
            <div className="rounded-2xl border border-border p-4 text-sm leading-6 text-muted">
              No manager updates submitted for this store yet.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
          href={`/app/tasks?storeId=${store.id}`}
        >
          <ClipboardList className="mb-5 size-5 text-muted" />
          <h3 className="text-base font-semibold">Tasks</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {storeTasks.count
              ? `${storeTasks.count} pending or in-progress task${storeTasks.count === 1 ? "" : "s"}.`
              : "No pending tasks for this store."}
          </p>
        </Link>
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
          href={`/app/reports/staff?storeId=${store.id}&period=week`}
        >
          <UserRoundCheck className="mb-5 size-5 text-muted" />
          <h3 className="text-base font-semibold">Staff Sales</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Staff ranking and performance from uploaded sales reports.
          </p>
        </Link>
      </section>
    </div>
  );
}
