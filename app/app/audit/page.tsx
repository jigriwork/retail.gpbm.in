import Link from "next/link";
import { ClipboardCheck, CircleAlert, Store, Trophy } from "lucide-react";

import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  getDefaultWeeklyAuditRange,
  getWeeklyAuditSummaries,
  type StoreWeeklyAuditSummary,
} from "@/lib/audit/weekly";

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

function AuditCard({ audit }: { audit: StoreWeeklyAuditSummary }) {
  return (
    <Link
      className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
      href={`/app/audit/${audit.store.id}?week=${audit.weekRange.startDate}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold">{audit.store.name}</p>
          <p className="mt-1 text-sm text-muted">
            {audit.weekRange.startDate} to {audit.weekRange.endDate}
          </p>
        </div>
        <span
          className={
            audit.missingSalesReports.length
              ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
              : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
          }
        >
          {audit.missingSalesReports.length ? "Needs attention" : "Clean"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Total sales</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(audit.sales.totalNetSale)}</p>
        </div>
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Checklist estimate</p>
          <p className="mt-1 text-xl font-semibold">{audit.checklist.estimatedCompletionPercent}%</p>
        </div>
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Reviews</p>
          <p className="mt-1 font-semibold">
            Rack {audit.reviews.rackCompletedDays}/7 · Cleaning {audit.reviews.cleaningCompletedDays}/7
          </p>
        </div>
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Missing sales days</p>
          <p className="mt-1 font-semibold">{audit.missingSalesReports.length}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Top staff</p>
          <p className="mt-1 font-semibold">{audit.staff[0]?.staffName ?? "No staff data"}</p>
        </div>
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Top category / brand</p>
          <p className="mt-1 font-semibold">
            {audit.sales.topCategories[0]?.name ?? "No category"} · {audit.sales.topBrands[0]?.name ?? "No brand"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted">
        Urgent open {audit.updates.openUrgentCount}, pending tasks {audit.tasks.overduePendingCount},
        slow/dead stock {audit.stockSignals.slowStockCount + audit.stockSignals.deadStockCount}.
      </p>
    </Link>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; mode?: string; week?: string }>;
}) {
  const { storeId, mode, week } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const selectedStores =
    storeId && stores.some((store) => store.id === storeId)
      ? stores.filter((store) => store.id === storeId)
      : stores;
  const weekRange = getDefaultWeeklyAuditRange(mode, week);
  const audits = await getWeeklyAuditSummaries(selectedStores, weekRange);
  const totalSales = audits.reduce((sum, audit) => sum + audit.sales.totalNetSale, 0);
  const missingDays = audits.reduce((sum, audit) => sum + audit.missingSalesReports.length, 0);
  const urgentOpen = audits.reduce((sum, audit) => sum + audit.updates.openUrgentCount, 0);
  const pendingTasks = audits.reduce((sum, audit) => sum + audit.tasks.overduePendingCount, 0);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Weekly Audit</p>
            <h1 className="mt-2 text-3xl font-semibold">Store performance review</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              {weekRange.startDate} to {weekRange.endDate}
            </p>
          </div>
          <ClipboardCheck className="size-5 text-muted" />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Store</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={storeId ?? "all"}
              name="storeId"
            >
              <option value="all">All accessible stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Week</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={mode ?? "previous"}
              name="mode"
            >
              <option value="previous">Previous week</option>
              <option value="current">Current week</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Pick week</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={week ?? weekRange.startDate}
              name="week"
              type="date"
            />
          </label>
          <button className="mt-7 h-12 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85">
            Apply
          </button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
          <Store className="mb-4 size-5 text-muted" />
          <p className="text-xs font-medium text-muted">Total sales</p>
          <p className="mt-2 text-2xl font-semibold">{formatMoney(totalSales)}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
          <CircleAlert className="mb-4 size-5 text-muted" />
          <p className="text-xs font-medium text-muted">Missing sales days</p>
          <p className="mt-2 text-2xl font-semibold">{missingDays}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
          <Trophy className="mb-4 size-5 text-muted" />
          <p className="text-xs font-medium text-muted">Open urgent updates</p>
          <p className="mt-2 text-2xl font-semibold">{urgentOpen}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
          <ClipboardCheck className="mb-4 size-5 text-muted" />
          <p className="text-xs font-medium text-muted">Pending tasks</p>
          <p className="mt-2 text-2xl font-semibold">{pendingTasks}</p>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {audits.map((audit) => (
          <AuditCard audit={audit} key={audit.store.id} />
        ))}
      </section>
    </div>
  );
}
