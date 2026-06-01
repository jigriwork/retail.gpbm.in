import Link from "next/link";
import {
  CalendarCheck,
  ClipboardCheck,
  HeartPulse,
  LineChart,
  ListTodo,
  Sparkles,
  SprayCan,
  Store,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

import { StatusCard } from "@/components/app/status-card";
import { ReviewStatusCard } from "@/components/reviews/review-status-card";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { getReviewStatuses } from "@/lib/reviews/queries";
import { getTaskSummary } from "@/lib/tasks/queries";

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
  const [salesStatuses, reviewStatuses] = await Promise.all([
    getStoreSalesStatuses(stores),
    getReviewStatuses(stores),
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
          body="Waiting for the next real stock upload or processing result."
          icon={ClipboardCheck}
          title="Stock report status"
        />
        <StatusCard
          body="Attendance reminder is based on app settings."
          icon={CalendarCheck}
          title="Salary attendance"
        />
        <StatusCard
          body="Salary day is configured in settings and shown read-only for now."
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
