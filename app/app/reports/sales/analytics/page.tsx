import Link from "next/link";
import { BarChart3, CircleAlert, LineChart, Target, Trophy } from "lucide-react";

import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  calculateTargetProgress,
  currentMonthRange,
  getDateRangeForPeriod,
  getMissingSalesReportDates,
  getSalesSummary,
  type SalesPeriod,
} from "@/lib/analytics/sales";

const periodLabels: Array<{ value: SalesPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

function formatNumber(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function safePeriod(value?: string): SalesPeriod {
  return periodLabels.some((period) => period.value === value) ? (value as SalesPeriod) : "yesterday";
}

function RankingList({
  items,
  valueLabel = "sale",
}: {
  items: Array<{ name: string; totalSale: number; quantity: number }>;
  valueLabel?: string;
}) {
  if (!items.length) {
    return <p className="text-sm leading-6 text-muted">No sales rows found for this period.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div className="rounded-2xl border border-border p-3" key={item.name}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                {index + 1}. {item.name}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                Qty {formatNumber(item.quantity)}
              </p>
            </div>
            <p className="text-sm font-semibold">{valueLabel === "sale" ? formatMoney(item.totalSale) : formatNumber(item.quantity)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SalesAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; period?: string; start?: string; end?: string }>;
}) {
  const { storeId, period: rawPeriod, start, end } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const period = safePeriod(rawPeriod);
  const dateRange = getDateRangeForPeriod(period, start, end);
  const selectedStores =
    storeId && stores.some((store) => store.id === storeId)
      ? stores.filter((store) => store.id === storeId)
      : stores;
  const selectedStoreIds = selectedStores.map((store) => store.id);
  const [summary, missingDates, monthSummary] = await Promise.all([
    getSalesSummary({ storeIds: selectedStoreIds, dateRange }, selectedStores),
    getMissingSalesReportDates(selectedStores, dateRange),
    getSalesSummary({ storeIds: selectedStoreIds, dateRange: currentMonthRange() }, selectedStores),
  ]);
  const maxTrendSale = Math.max(...summary.dailyTrend.map((point) => point.totalSale), 1);
  const targetProgress =
    selectedStores.length === 1
      ? calculateTargetProgress(selectedStores[0], monthSummary.totalNetSale)
      : null;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Sales analytics</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Store, staff, brand and category sales from uploaded daily sales rows.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <span className="mb-2 block text-sm font-medium text-muted">Period</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={period}
              name="period"
            >
              {periodLabels.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Start</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={dateRange.startDate}
              name="start"
              type="date"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">End</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={dateRange.endDate}
              name="end"
              type="date"
            />
          </label>
          <button className="mt-7 h-12 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85">
            Apply
          </button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total net sale", formatMoney(summary.totalNetSale)],
          ["Total quantity", formatNumber(summary.totalQuantity)],
          ["Bill count", String(summary.billCount)],
          ["Average bill value", formatMoney(summary.averageBillValue)],
          ["Staff count", String(summary.staffCount)],
          ["Brand count", String(summary.brandCount)],
          ["Category count", String(summary.categoryCount)],
          ["Rows", String(summary.rowCount)],
        ].map(([label, value]) => (
          <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={label}>
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      {targetProgress ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted">Target progress</p>
              <h2 className="mt-2 text-2xl font-semibold">
                {targetProgress.percentageAchieved}% achieved
              </h2>
            </div>
            <Target className="size-5 text-muted" />
          </div>
          <div className="mt-5 h-2 rounded-full bg-background">
            <div
              className="h-2 rounded-full bg-foreground"
              style={{ width: `${Math.min(targetProgress.percentageAchieved, 100)}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Month sale</p>
              <p className="mt-1 font-semibold">{formatMoney(targetProgress.monthSale)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Target</p>
              <p className="mt-1 font-semibold">{formatMoney(targetProgress.target)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Balance</p>
              <p className="mt-1 font-semibold">{formatMoney(targetProgress.balance)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Required daily</p>
              <p className="mt-1 font-semibold">{formatMoney(targetProgress.requiredDailySale)}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Store summary</h2>
            <BarChart3 className="size-5 text-muted" />
          </div>
          <div className="space-y-3">
            {summary.storeSummaries.map((store) => (
              <div className="rounded-2xl border border-border p-3" key={store.store.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{store.store.name}</p>
                    <p className="mt-1 text-xs font-medium text-muted">
                      Bills {store.billCount} · Qty {formatNumber(store.totalQuantity)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatMoney(store.totalNetSale)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Daily trend</h2>
            <LineChart className="size-5 text-muted" />
          </div>
          <div className="space-y-3">
            {summary.dailyTrend.map((point) => (
              <div className="grid grid-cols-[6.5rem_1fr_6rem] items-center gap-3 text-sm" key={point.date}>
                <span className="font-medium text-muted">{point.date}</span>
                <div className="h-2 rounded-full bg-background">
                  <div
                    className="h-2 rounded-full bg-foreground"
                    style={{ width: `${Math.round((point.totalSale / maxTrendSale) * 100)}%` }}
                  />
                </div>
                <span className="text-right font-semibold">{formatMoney(point.totalSale)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Top staff</h2>
            <Trophy className="size-5 text-muted" />
          </div>
          <RankingList items={summary.topStaff} />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Top brands</h2>
          <RankingList items={summary.topBrands} />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Top categories</h2>
          <RankingList items={summary.topCategories} />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Top items</h2>
          <RankingList items={summary.topItems} />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Missing sales reports</h2>
          <CircleAlert className="size-5 text-muted" />
        </div>
        {missingDates.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {missingDates.slice(0, 18).map((item) => (
              <div className="rounded-2xl border border-border p-3 text-sm" key={`${item.store.id}-${item.date}`}>
                <p className="font-semibold">{item.store.name}</p>
                <p className="mt-1 text-muted">
                  {item.date}: {item.status === "today-not-uploaded" ? "Today not uploaded yet" : "Missing"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted">No missing sales reports in this period.</p>
        )}
      </section>
    </div>
  );
}
