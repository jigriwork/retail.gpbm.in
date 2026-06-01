import Link from "next/link";
import {
  CalendarCheck,
  ClipboardCheck,
  HeartPulse,
  LineChart,
  ListTodo,
  MessageSquareText,
  PackageSearch,
  Sparkles,
  SprayCan,
  Store,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

import { ChecklistCard } from "@/components/checklist/checklist-card";
import { StatusCard } from "@/components/app/status-card";
import { ReviewStatusCard } from "@/components/reviews/review-status-card";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { getSalaryAttendanceOverview } from "@/lib/reports/salary-queries";
import { getStockOverview } from "@/lib/reports/stock-queries";
import { getReviewStatuses } from "@/lib/reviews/queries";
import { getTaskSummary } from "@/lib/tasks/queries";
import { getTodayUpdateSummary } from "@/lib/updates/queries";
import { UpdateCard } from "@/components/updates/update-card";
import { getAccessibleChecklists } from "@/lib/checklist/queries";
import {
  currentMonthRange,
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

export default async function TodayPage() {
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const taskSummary = profile
    ? await getTaskSummary(profile)
    : { todayCount: 0, urgentCount: 0, privateCount: 0, storeCounts: [] };
  const [salesStatuses, salaryOverview, stockOverview, reviewStatuses] = await Promise.all([
    getStoreSalesStatuses(stores),
    getSalaryAttendanceOverview(stores),
    getStockOverview(stores),
    getReviewStatuses(stores),
  ]);
  const [updateSummary, checklists] = await Promise.all([
    getTodayUpdateSummary(stores),
    getAccessibleChecklists(profile),
  ]);
  const [yesterdaySalesPulse, monthSalesPulse, yesterdayStaffPulse] = await Promise.all([
    getSalesSummary(
      { storeIds: stores.map((store) => store.id), dateRange: getDateRangeForPeriod("yesterday") },
      stores,
    ),
    getSalesSummary(
      { storeIds: stores.map((store) => store.id), dateRange: currentMonthRange() },
      stores,
    ),
    getStaffSalesSummary({
      storeIds: stores.map((store) => store.id),
      dateRange: getDateRangeForPeriod("yesterday"),
    }),
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Today</p>
        <h1 className="mt-2 text-3xl font-semibold">
          {profile?.full_name ?? "GPBM user"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Signed in as <span className="font-semibold capitalize">{profile?.role}</span>.
          Store data below follows your role and assignments.
        </p>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Sales pulse</p>
            <h2 className="mt-2 text-2xl font-semibold">Yesterday and month view</h2>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href="/app/reports/sales/analytics"
          >
            Full analytics
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stores.map((store) => {
            const yesterday = yesterdaySalesPulse.storeSummaries.find((item) => item.store.id === store.id);
            const month = monthSalesPulse.storeSummaries.find((item) => item.store.id === store.id);
            const salesStatus = salesStatuses.find((item) => item.store.id === store.id);

            return (
              <div className="rounded-2xl border border-border p-3" key={store.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{store.name}</p>
                  <span
                    className={
                      salesStatus?.yesterdayReport
                        ? "rounded-full border border-border px-2 py-1 text-xs font-semibold text-success"
                        : "rounded-full border border-border px-2 py-1 text-xs font-semibold text-danger"
                    }
                  >
                    {salesStatus?.yesterdayReport ? "Uploaded" : "Missing"}
                  </span>
                </div>
                <p className="mt-4 text-xs font-medium text-muted">Yesterday</p>
                <p className="mt-1 text-xl font-semibold">{formatMoney(yesterday?.totalNetSale)}</p>
                <p className="mt-3 text-xs font-medium text-muted">This month</p>
                <p className="mt-1 text-xl font-semibold">{formatMoney(month?.totalNetSale)}</p>
              </div>
            );
          })}
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Top staff yesterday</p>
            {yesterdayStaffPulse[0] ? (
              <>
                <p className="mt-2 text-xl font-semibold">{yesterdayStaffPulse[0].staffName}</p>
                <p className="mt-1 text-sm font-medium text-muted">
                  {formatMoney(yesterdayStaffPulse[0].totalSale)}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted">No staff sales found.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Monthly stock workflow</p>
            <h2 className="mt-2 text-2xl font-semibold">{stockOverview.headline}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Stock report due {stockOverview.dueDate}.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href="/app/reports/stock"
          >
            Open upload
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Uploaded</p>
            <p className="mt-1 text-2xl font-semibold">{stockOverview.uploadedCount}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Missing</p>
            <p className="mt-1 text-2xl font-semibold">{stockOverview.missingCount}</p>
          </div>
          {stockOverview.statuses.map((status) => (
            <Link
              className="rounded-2xl border border-border p-3 transition hover:border-foreground"
              href={`/app/reports/stock?storeId=${status.store.id}`}
              key={status.store.id}
            >
              <p className="text-xs font-medium text-muted">{status.store.name}</p>
              <p
                className={
                  status.report
                    ? "mt-1 text-lg font-semibold text-success"
                    : "mt-1 text-lg font-semibold text-danger"
                }
              >
                {status.report ? "Uploaded" : stockOverview.dayOfMonth === 1 ? "Due today" : "Pending"}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Daily checklist</h2>
          <ClipboardCheck className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {checklists.map((checklist) => (
            <ChecklistCard checklist={checklist} key={checklist.store.id} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Today store reviews</h2>
          <Sparkles className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {reviewStatuses.map((status) => (
            <div className="grid gap-3" key={status.store.id}>
              <ReviewStatusCard
                href={`/app/reviews/rack?storeId=${status.store.id}`}
                review={status.rackReview}
                storeName={status.store.name}
                title="Rack review"
              />
              <ReviewStatusCard
                href={`/app/reviews/cleaning?storeId=${status.store.id}`}
                review={status.cleaningReview}
                storeName={status.store.name}
                title="Cleaning review"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
          href="/app/tasks"
        >
          <ListTodo className="mb-5 size-5 text-muted" />
          <p className="text-sm text-muted">Today tasks</p>
          <p className="mt-1 text-3xl font-semibold">{taskSummary.todayCount}</p>
        </Link>
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
          href="/app/tasks?tab=today"
        >
          <TriangleAlert className="mb-5 size-5 text-muted" />
          <p className="text-sm text-muted">Urgent today</p>
          <p className="mt-1 text-3xl font-semibold">{taskSummary.urgentCount}</p>
        </Link>
        {profile?.role === "owner" ? (
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
            href="/app/tasks?tab=today"
          >
            <HeartPulse className="mb-5 size-5 text-muted" />
            <p className="text-sm text-muted">Personal/private</p>
            <p className="mt-1 text-3xl font-semibold">
              {taskSummary.privateCount}
            </p>
          </Link>
        ) : null}
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Monthly salary workflow</p>
            <h2 className="mt-2 text-2xl font-semibold">{salaryOverview.headline}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Attendance due {salaryOverview.dueDate}. Salary day {salaryOverview.salaryDate}.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href="/app/reports/salary-attendance"
          >
            Open upload
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Uploaded</p>
            <p className="mt-1 text-2xl font-semibold">{salaryOverview.uploadedCount}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Missing</p>
            <p className="mt-1 text-2xl font-semibold">{salaryOverview.missingCount}</p>
          </div>
          {salaryOverview.statuses.map((status) => (
            <Link
              className="rounded-2xl border border-border p-3 transition hover:border-foreground"
              href={`/app/reports/salary-attendance?storeId=${status.store.id}`}
              key={status.store.id}
            >
              <p className="text-xs font-medium text-muted">{status.store.name}</p>
              <p
                className={
                  status.report
                    ? "mt-1 text-lg font-semibold text-success"
                    : "mt-1 text-lg font-semibold text-danger"
                }
              >
                {status.report ? "Uploaded" : salaryOverview.dayOfMonth === 1 ? "Due today" : "Missing"}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Manager updates</h2>
          <MessageSquareText className="size-5 text-muted" />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              className="rounded-2xl border border-border p-3 transition hover:border-foreground"
              href="/app/updates?status=open&urgency=urgent"
            >
              <p className="text-xs font-medium text-muted">Open urgent</p>
              <p className="mt-1 text-2xl font-semibold">{updateSummary.openUrgentCount}</p>
            </Link>
            {updateSummary.storeCounts.map((item) => (
              <Link
                className="rounded-2xl border border-border p-3 transition hover:border-foreground"
                href={`/app/updates?storeId=${item.store.id}&status=open`}
                key={item.store.id}
              >
                <p className="text-xs font-medium text-muted">{item.store.name}</p>
                <p className="mt-1 text-2xl font-semibold">{item.count}</p>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href="/app/updates/new"
            >
              Add store update
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href="/app/updates"
            >
              View updates
            </Link>
          </div>
        </div>
        {updateSummary.latestOpen.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {updateSummary.latestOpen.map((update) => (
              <UpdateCard compact key={update.id} update={update} />
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Manager quick actions</h2>
          <ListTodo className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/checklist"
          >
            My checklist
          </Link>
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/reports/sales"
          >
            Upload sales
          </Link>
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/reports/salary-attendance"
          >
            Salary attendance
          </Link>
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/reports/stock"
          >
            Upload stock
          </Link>
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/reviews/rack"
          >
            Rack review
          </Link>
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/reviews/cleaning"
          >
            Cleaning review
          </Link>
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/updates/new"
          >
            Add update
          </Link>
          <Link
            className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
            href="/app/tasks"
          >
            Assigned tasks
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Accessible stores</h2>
          <Store className="size-5 text-muted" />
        </div>
        {stores.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <Link
                className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
                href={`/app/stores/${store.id}`}
                key={store.id}
              >
                <p className="text-lg font-semibold">{store.name}</p>
                <p className="mt-1 text-sm text-muted">{store.code}</p>
                <p className="mt-6 text-sm font-medium text-muted">
                  {taskSummary.storeCounts.find((item) => item.store.id === store.id)
                    ?.count ?? 0}{" "}
                  task
                  {(taskSummary.storeCounts.find((item) => item.store.id === store.id)
                    ?.count ?? 0) === 1
                    ? ""
                    : "s"}{" "}
                  today
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm leading-6 text-muted shadow-sm">
            No active store is assigned yet.
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Yesterday sales reports</h2>
          <LineChart className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {salesStatuses.map((status) => (
            <div
              className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm"
              key={status.store.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{status.store.name}</p>
                  <p className="mt-1 text-xs font-medium text-muted">
                    Due for {status.yesterdayDate}
                  </p>
                </div>
                <span
                  className={
                    status.yesterdayReport
                      ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
                      : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
                  }
                >
                  {status.yesterdayReport ? "Uploaded" : "Missing"}
                </span>
              </div>
              <p className="mt-5 text-2xl font-semibold">
                {formatMoney(status.latestReport?.summary?.totalNetSale)}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                Latest upload: {status.latestReport?.report_date ?? "None yet"}
              </p>
              {!status.yesterdayReport ? (
                <p className="mt-3 text-sm font-medium text-danger">
                  Missing yesterday sales report.
                </p>
              ) : null}
              <Link
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
                href={`/app/reports/sales?storeId=${status.store.id}`}
              >
                Upload report
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          body="Daily sales upload is active from Reports."
          icon={LineChart}
          title="Sales report status"
        />
        <StatusCard
          body={`${stockOverview.uploadedCount} uploaded, ${stockOverview.missingCount} missing for ${stockOverview.periodMonth}.`}
          icon={PackageSearch}
          title="Stock report status"
        />
        <StatusCard
          body={`${salaryOverview.uploadedCount} uploaded, ${salaryOverview.missingCount} missing for ${salaryOverview.periodMonth}.`}
          icon={CalendarCheck}
          title="Salary attendance"
        />
        <StatusCard
          body={`Salary day is ${salaryOverview.salaryDate}.`}
          icon={WalletCards}
          title="Salary day"
        />
        <StatusCard
          body="Daily rack review is active from Reviews."
          icon={Sparkles}
          title="Rack review"
        />
        <StatusCard
          body="Daily cleaning review is active from Reviews."
          icon={SprayCan}
          title="Cleaning review"
        />
        {profile?.role === "owner" ? (
          <StatusCard
            body="Private owner-only Life Flow stays hidden from managers."
            icon={HeartPulse}
            title="Life Flow"
          />
        ) : null}
      </section>
    </div>
  );
}
