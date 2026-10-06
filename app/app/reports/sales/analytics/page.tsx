import Link from "next/link";
import { BarChart3, CircleAlert, LineChart, Target, Trophy } from "lucide-react";

import { SuspiciousSalesReportWarning } from "@/components/reports/sales-report-warnings";
import { DataFreshnessBadge } from "@/components/app/data-freshness-badge";
import { DailySalesBars } from "@/components/reports/daily-sales-bars";
import { PeriodPicker } from "@/components/reports/period-picker";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { resolveRange } from "@/lib/reports/period";
import {
  calculateTargetProgress,
  currentMonthRange,
  getMissingSalesReportDates,
  getSalesSummary,
} from "@/lib/analytics/sales";
import { getSuspiciousSalesReportWarningsFromReports } from "@/lib/reports/sales-queries";


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

  const valueOf = (item: (typeof items)[number]) => (valueLabel === "sale" ? item.totalSale : item.quantity);
  const top = Math.max(...items.map(valueOf), 1);
  // Gold, silver and bronze for the top three; the rest stay neutral.
  const medals = ["bg-accent text-primary-deep", "bg-[#D9DAE3] text-[#3A3950]", "bg-[#E8C3A2] text-[#5A3416]"];

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div className="rounded-2xl border border-border p-3" key={item.name}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${medals[index] ?? "bg-background text-muted"}`}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-xs font-medium text-muted">
                  Qty {formatNumber(item.quantity)}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold">{valueLabel === "sale" ? formatMoney(item.totalSale) : formatNumber(item.quantity)}</p>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-background">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(Math.round((valueOf(item) / top) * 100), 2)}%` }} />
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
  const dateRange = resolveRange({ end, period: rawPeriod, start }, "yesterday");
  const selectedStores =
    storeId && stores.some((store) => store.id === storeId)
      ? stores.filter((store) => store.id === storeId)
      : stores;
  const selectedStoreIds = selectedStores.map((store) => store.id);
  const [summary, missingDates, monthSummary, suspiciousWarnings] = await Promise.all([
    getSalesSummary({ storeIds: selectedStoreIds, dateRange }, selectedStores),
    getMissingSalesReportDates(selectedStores, dateRange),
    getSalesSummary({ storeIds: selectedStoreIds, dateRange: currentMonthRange() }, selectedStores),
    getSuspiciousSalesReportWarningsFromReports({
      endDate: dateRange.endDate,
      startDate: dateRange.startDate,
      storeIds: selectedStoreIds,
    }),
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

      <PeriodPicker keep={{ storeId }} path="/app/reports/sales/analytics" range={dateRange}>
        <label className="col-span-2 block text-xs font-medium text-muted sm:col-span-1">Store
          <select className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" defaultValue={storeId ?? "all"} name="storeId">
            <option value="all">All accessible stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </label>
      </PeriodPicker>

      <DataFreshnessBadge freshness={summary.freshness} source="Sales" />

      {suspiciousWarnings.length ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <SuspiciousSalesReportWarning />
          <div className="mt-3 space-y-1 text-sm leading-6 text-muted">
            {suspiciousWarnings.slice(0, 6).map((warning) => (
              <p key={warning.reportId}>
                {warning.storeName} {warning.reportDate ?? "No date"} {warning.fileName ? `- ${warning.fileName}` : ""}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Actual sales (incl. tax)", formatMoney(summary.totalNetSale)],
          ["MRP value", summary.pricedRowCount ? formatMoney(summary.totalMrpValue) : "Not available"],
          ["Net discount given", summary.pricedRowCount ? formatMoney(summary.totalDiscountValue) : "Not available"],
          ["Average discount", summary.totalMrpValue > 0 ? `${summary.averageDiscountPercent.toFixed(1)}%` : "Not available"],
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
              className="h-2 rounded-full bg-primary"
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
                    <p className="mt-1 text-xs font-medium text-muted">
                      {store.totalMrpValue > 0
                        ? `MRP ${formatMoney(store.totalMrpValue)} · Discount ${formatMoney(store.totalDiscountValue)} · Avg ${store.averageDiscountPercent.toFixed(1)}%`
                        : "MRP and discount not available"}
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
          <DailySalesBars points={summary.dailyTrend} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Show daily numbers</summary>
          <div className="mt-3 space-y-3">
            {summary.dailyTrend.map((point) => (
              <div className="grid grid-cols-[6.5rem_1fr_6rem] items-center gap-3 text-sm" key={point.date}>
                <span className="font-medium text-muted">{point.date}</span>
                <div className="h-2 rounded-full bg-background">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.round((point.totalSale / maxTrendSale) * 100)}%` }}
                  />
                </div>
                <span className="text-right font-semibold">{formatMoney(point.totalSale)}</span>
              </div>
            ))}
          </div>
          </details>
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
