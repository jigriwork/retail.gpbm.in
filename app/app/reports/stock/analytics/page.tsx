import Link from "next/link";
import { CircleAlert, PackageSearch, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  getLatestStockMonth,
  getStockSummary,
  type StockItemSummary,
  type StockLookbackDays,
} from "@/lib/analytics/stock";
import { getIndiaMonthStart } from "@/lib/tasks/dates";

const lookbackOptions: StockLookbackDays[] = [7, 15, 30, 60, 90];

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) {
    return "Not calculable";
  }

  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function safeLookback(value?: string): StockLookbackDays {
  const parsed = Number(value);
  return lookbackOptions.includes(parsed as StockLookbackDays) ? (parsed as StockLookbackDays) : 30;
}

function CandidateList({
  items,
  emptyText,
}: {
  items: StockItemSummary[];
  emptyText: string;
}) {
  if (!items.length) {
    return <p className="text-sm leading-6 text-muted">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((item) => (
        <div className="rounded-2xl border border-border p-3" key={item.key}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{item.itemName}</p>
              <p className="mt-1 text-xs font-medium text-muted">
                {item.storeName} · {item.brand ?? "No brand"} · {item.category ?? "No category"}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                Match: {item.matchQuality === "none" ? "no sale match" : item.matchQuality}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Stock {formatNumber(item.stockQuantity)}</p>
              <p className="mt-1 text-xs font-medium text-muted">
                Sold {formatNumber(item.salesQuantity)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function StockAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; stockMonth?: string; lookback?: string }>;
}) {
  const { storeId, stockMonth: rawStockMonth, lookback } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const selectedStores =
    storeId && stores.some((store) => store.id === storeId)
      ? stores.filter((store) => store.id === storeId)
      : stores;
  const latestMonth =
    rawStockMonth ??
    (selectedStores.length === 1
      ? await getLatestStockMonth(selectedStores[0].id)
      : await getLatestStockMonth()) ??
    getIndiaMonthStart();
  const selectedLookback = safeLookback(lookback);
  const summary = await getStockSummary({
    storeIds: selectedStores.map((store) => store.id),
    stockMonth: latestMonth,
    lookbackDays: selectedLookback,
    stores: selectedStores,
  });

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Stock analytics</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Slow stock, dead stock signals and fast moving low-stock candidates from stock and sales rows.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <span className="mb-2 block text-sm font-medium text-muted">Stock month</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={latestMonth}
              name="stockMonth"
              type="date"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Sales lookback</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={selectedLookback}
              name="lookback"
            >
              {lookbackOptions.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </label>
          <button className="mt-7 h-12 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85">
            Apply
          </button>
        </form>
      </section>

      {summary.dataQualityNote ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm leading-6 text-muted shadow-sm">
          <span className="font-semibold text-foreground">Data quality note:</span> Some stock rows do not
          have SKU or barcode. Those items use item-name matching as a weaker fallback.
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Stock quantity", formatNumber(summary.totalStockQuantity)],
          ["Stock MRP value", formatMoney(summary.totalStockMrpValue)],
          ["Items", String(summary.itemCount)],
          ["Brands", String(summary.brandCount)],
          ["Categories", String(summary.categoryCount)],
        ].map(([label, value]) => (
          <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={label}>
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Top brands</h2>
            <PackageSearch className="size-5 text-muted" />
          </div>
          <div className="space-y-2">
            {summary.topBrands.map((brand) => (
              <div className="rounded-2xl border border-border p-3" key={brand.name}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{brand.name}</p>
                  <p className="text-sm font-semibold">{formatNumber(brand.quantity)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Top categories</h2>
          <div className="space-y-2">
            {summary.topCategories.map((category) => (
              <div className="rounded-2xl border border-border p-3" key={category.name}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{category.name}</p>
                  <p className="text-sm font-semibold">{formatNumber(category.quantity)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Top stock items</h2>
          <CandidateList emptyText="No stock items found." items={summary.topItems} />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Dead stock candidates</h2>
            <CircleAlert className="size-5 text-muted" />
          </div>
          <CandidateList
            emptyText="No dead stock candidates found for the current thresholds."
            items={summary.deadStockCandidates}
          />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Slow stock candidates</h2>
            <TrendingDown className="size-5 text-muted" />
          </div>
          <CandidateList
            emptyText="No slow stock candidates found for the current thresholds."
            items={summary.slowStockCandidates}
          />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Fast moving low stock</h2>
            <TrendingUp className="size-5 text-muted" />
          </div>
          <CandidateList
            emptyText="No fast moving low-stock candidates found."
            items={summary.fastMovingLowStockCandidates}
          />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">High stock low sale</h2>
            <Sparkles className="size-5 text-muted" />
          </div>
          <CandidateList
            emptyText="No high-stock low-sale candidates found."
            items={summary.highStockLowSaleCandidates}
          />
        </div>
      </section>
    </div>
  );
}
