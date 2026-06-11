import Link from "next/link";
import { BarChart3, Boxes, Layers3, PackageSearch, Ruler, Search, UsersRound } from "lucide-react";

import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  getBusinessDateRange,
  getBusinessReport,
  type BusinessPeriod,
  type BusinessRank,
  type BusinessItem,
  type SizeSummary,
  type StaffSummary,
} from "@/lib/analytics/business";

const periodOptions: Array<{ value: BusinessPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

function safePeriod(value?: string): BusinessPeriod {
  return periodOptions.some((option) => option.value === value) ? (value as BusinessPeriod) : "month";
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "Not available";
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function hrefWith(params: Record<string, string | undefined>) {
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) url.set(key, value);
  }
  return `/app/reports/business?${url.toString()}`;
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {note ? <p className="mt-2 text-xs leading-5 text-muted">{note}</p> : null}
    </div>
  );
}

function BrandTable({
  rows,
  query,
}: {
  rows: BusinessRank[];
  query: Record<string, string | undefined>;
}) {
  if (!rows.length) return <p className="text-sm leading-6 text-muted">No brand data found for the selected filters.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Brand</th>
            <th className="px-3 py-3 font-semibold">Net Sales</th>
            <th className="px-3 py-3 font-semibold">Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Return Amt</th>
            <th className="px-3 py-3 font-semibold">Bills</th>
            <th className="px-3 py-3 font-semibold">Stock Qty</th>
            <th className="px-3 py-3 font-semibold">Stock MRP</th>
            <th className="px-3 py-3 font-semibold">Items</th>
            <th className="px-3 py-3 font-semibold">Sizes</th>
            <th className="px-3 py-3 font-semibold">Top Category</th>
            <th className="px-3 py-3 font-semibold">Top Staff</th>
            <th className="px-3 py-3 font-semibold">Movement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="px-3 py-3 font-semibold">
                <Link className="text-foreground underline-offset-4 hover:underline" href={hrefWith({ ...query, brand: row.name })}>
                  {row.name}
                </Link>
              </td>
              <td className="px-3 py-3">{formatMoney(row.netSales)}</td>
              <td className="px-3 py-3">{formatNumber(row.soldQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.returnAmount)}</td>
              <td className="px-3 py-3">{row.billCount}</td>
              <td className="px-3 py-3">{formatNumber(row.stockQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.stockMrpValue)}</td>
              <td className="px-3 py-3">{row.uniqueItems}</td>
              <td className="px-3 py-3">{row.uniqueSizes}</td>
              <td className="px-3 py-3">{row.topCategory ?? "None"}</td>
              <td className="px-3 py-3">{row.topStaff ?? "None"}</td>
              <td className="px-3 py-3">{row.movementStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryTable({
  rows,
  query,
}: {
  rows: BusinessRank[];
  query: Record<string, string | undefined>;
}) {
  if (!rows.length) return <p className="text-sm leading-6 text-muted">No category data found for the selected filters.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Category</th>
            <th className="px-3 py-3 font-semibold">Net Sales</th>
            <th className="px-3 py-3 font-semibold">Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Return Amt</th>
            <th className="px-3 py-3 font-semibold">Bills</th>
            <th className="px-3 py-3 font-semibold">Stock Qty</th>
            <th className="px-3 py-3 font-semibold">Stock MRP</th>
            <th className="px-3 py-3 font-semibold">Items</th>
            <th className="px-3 py-3 font-semibold">Brands</th>
            <th className="px-3 py-3 font-semibold">Top Brand</th>
            <th className="px-3 py-3 font-semibold">Top Staff</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="px-3 py-3 font-semibold">
                <Link className="text-foreground underline-offset-4 hover:underline" href={hrefWith({ ...query, category: row.name })}>
                  {row.name}
                </Link>
              </td>
              <td className="px-3 py-3">{formatMoney(row.netSales)}</td>
              <td className="px-3 py-3">{formatNumber(row.soldQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.returnAmount)}</td>
              <td className="px-3 py-3">{row.billCount}</td>
              <td className="px-3 py-3">{formatNumber(row.stockQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.stockMrpValue)}</td>
              <td className="px-3 py-3">{row.uniqueItems}</td>
              <td className="px-3 py-3">{row.uniqueBrands}</td>
              <td className="px-3 py-3">{row.topBrand ?? "None"}</td>
              <td className="px-3 py-3">{row.topStaff ?? "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemTable({ rows }: { rows: BusinessItem[] }) {
  if (!rows.length) return <p className="text-sm leading-6 text-muted">No item/product data found for the selected filters.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1240px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Item Name</th>
            <th className="px-3 py-3 font-semibold">Brand</th>
            <th className="px-3 py-3 font-semibold">Category</th>
            <th className="px-3 py-3 font-semibold">Barcode</th>
            <th className="px-3 py-3 font-semibold">SKU</th>
            <th className="px-3 py-3 font-semibold">Net Sales</th>
            <th className="px-3 py-3 font-semibold">Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Return Qty</th>
            <th className="px-3 py-3 font-semibold">Return Amt</th>
            <th className="px-3 py-3 font-semibold">Stock Qty</th>
            <th className="px-3 py-3 font-semibold">Stock MRP</th>
            <th className="px-3 py-3 font-semibold">Sizes Available</th>
            <th className="px-3 py-3 font-semibold">Sizes Sold</th>
            <th className="px-3 py-3 font-semibold">Staff</th>
            <th className="px-3 py-3 font-semibold">Match Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-3 font-semibold">{row.itemName}</td>
              <td className="px-3 py-3">{row.brand ?? "None"}</td>
              <td className="px-3 py-3">{row.category ?? "None"}</td>
              <td className="px-3 py-3">{row.barcode ?? "None"}</td>
              <td className="px-3 py-3">{row.sku ?? "None"}</td>
              <td className="px-3 py-3">{formatMoney(row.netSales)}</td>
              <td className="px-3 py-3">{formatNumber(row.soldQuantity)}</td>
              <td className="px-3 py-3">{formatNumber(row.returnQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.returnAmount)}</td>
              <td className="px-3 py-3">{formatNumber(row.stockQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.stockMrpValue)}</td>
              <td className="px-3 py-3">{row.sizesAvailable.join(", ") || "None"}</td>
              <td className="px-3 py-3">{row.sizesSold.join(", ") || "None"}</td>
              <td className="px-3 py-3">{row.staff.slice(0, 5).join(", ") || "None"}</td>
              <td className="px-3 py-3">{row.matchConfidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SizeTable({ rows }: { rows: SizeSummary[] }) {
  if (!rows.length) return <p className="text-sm leading-6 text-muted">No size data found for the selected filters.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Size</th>
            <th className="px-3 py-3 font-semibold">Stock Qty</th>
            <th className="px-3 py-3 font-semibold">Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Return Qty</th>
            <th className="px-3 py-3 font-semibold">Net Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Net Sales</th>
            <th className="px-3 py-3 font-semibold">Brands</th>
            <th className="px-3 py-3 font-semibold">Items</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.size}>
              <td className="px-3 py-3 font-semibold">{row.size}</td>
              <td className="px-3 py-3">{formatNumber(row.stockQuantity)}</td>
              <td className="px-3 py-3">{formatNumber(row.soldQuantity)}</td>
              <td className="px-3 py-3">{formatNumber(row.returnQuantity)}</td>
              <td className="px-3 py-3">{formatNumber(row.netSoldQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.netSales)}</td>
              <td className="px-3 py-3">{row.brandsCount}</td>
              <td className="px-3 py-3">{row.itemsCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffTable({ rows }: { rows: StaffSummary[] }) {
  if (!rows.length) return <p className="text-sm leading-6 text-muted">No staff sales found for the selected filters.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Staff Name</th>
            <th className="px-3 py-3 font-semibold">Net Sales</th>
            <th className="px-3 py-3 font-semibold">Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Bills</th>
            <th className="px-3 py-3 font-semibold">Return Amt</th>
            <th className="px-3 py-3 font-semibold">Top Brand</th>
            <th className="px-3 py-3 font-semibold">Top Category</th>
            <th className="px-3 py-3 font-semibold">Source Names</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.staffName}>
              <td className="px-3 py-3 font-semibold">{row.staffName}</td>
              <td className="px-3 py-3">{formatMoney(row.netSales)}</td>
              <td className="px-3 py-3">{formatNumber(row.soldQuantity)}</td>
              <td className="px-3 py-3">{row.billCount}</td>
              <td className="px-3 py-3">{formatMoney(row.returnAmount)}</td>
              <td className="px-3 py-3">{row.topBrand ?? "None"}</td>
              <td className="px-3 py-3">{row.topCategory ?? "None"}</td>
              <td className="px-3 py-3">
                {row.sourceBreakdown.map((source) => `${source.sourceName}: ${formatMoney(source.netSales)}`).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function BusinessReportingPage({
  searchParams,
}: {
  searchParams: Promise<{
    storeId?: string;
    period?: string;
    start?: string;
    end?: string;
    brand?: string;
    category?: string;
    item?: string;
    size?: string;
  }>;
}) {
  const params = await searchParams;
  const { profile } = await requireProfile();
  const stores = (await getAccessibleStores(profile)).filter((store) => ["GP", "BM"].includes(store.code));
  const selectedStoreId = params.storeId && stores.some((store) => store.id === params.storeId) ? params.storeId : "all";
  const selectedStores = selectedStoreId === "all" ? stores : stores.filter((store) => store.id === selectedStoreId);
  const period = safePeriod(params.period);
  const range = getBusinessDateRange(period, params.start, params.end);
  const query = {
    brand: params.brand ?? "",
    category: params.category ?? "",
    end: range.endDate,
    item: params.item ?? "",
    period,
    size: params.size ?? "",
    start: range.startDate,
    storeId: selectedStoreId,
  };
  const report = await getBusinessReport(
    {
      brand: query.brand,
      category: query.category,
      endDate: range.endDate,
      itemSearch: query.item,
      period,
      size: query.size,
      startDate: range.startDate,
      storeIds: selectedStores.map((store) => store.id),
    },
    selectedStores,
  );

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Business Reporting</p>
            <h1 className="mt-2 text-3xl font-semibold">Brand, category, item and size performance</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Search stock and sales together without salary, payslip or incentive data.
            </p>
          </div>
          <BarChart3 className="size-5 text-muted" />
        </div>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Store</span>
            <select className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={selectedStoreId} name="storeId">
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
            <select className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={period} name="period">
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Start</span>
            <input className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={range.startDate} name="start" type="date" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">End</span>
            <input className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={range.endDate} name="end" type="date" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Brand</span>
            <input className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={query.brand} list="business-brands" name="brand" placeholder="All brands" />
            <datalist id="business-brands">
              {report.options.brands.map((brand) => (
                <option key={brand} value={brand} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Category</span>
            <input className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={query.category} list="business-categories" name="category" placeholder="All categories" />
            <datalist id="business-categories">
              {report.options.categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Item/Product</span>
            <input className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={query.item} name="item" placeholder="Name, barcode, SKU" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Size</span>
            <input className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground" defaultValue={query.size} list="business-sizes" name="size" placeholder="All sizes" />
            <datalist id="business-sizes">
              {report.options.sizes.map((size) => (
                <option key={size} value={size} />
              ))}
            </datalist>
          </label>
          <button className="h-12 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85 lg:col-span-4">
            <Search className="mr-2 inline size-4" />
            Apply filters
          </button>
        </form>
      </section>

      {report.stockWarning ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm leading-6 text-danger shadow-sm">
          {report.stockWarning}
        </section>
      ) : null}
      {report.summary.salesSizeMissingRows ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm leading-6 text-muted shadow-sm">
          Size data not available in uploaded sales report for {report.summary.salesSizeMissingRows} row
          {report.summary.salesSizeMissingRows === 1 ? "" : "s"}.
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Net Sales" value={formatMoney(report.summary.netSales)} />
        <MetricCard label="Sold Quantity" value={formatNumber(report.summary.soldQuantity)} />
        <MetricCard label="Distinct Bills" value={String(report.summary.billCount)} note={`ABV ${formatMoney(report.summary.averageBillValue)}`} />
        <MetricCard label="Returns" value={formatMoney(report.summary.returnAmount)} note={`Qty ${formatNumber(report.summary.returnQuantity)} · Rows ${report.summary.returnRows}`} />
        <MetricCard label="Current Stock Quantity" value={formatNumber(report.summary.stockQuantity)} />
        <MetricCard label="Current MRP Value" value={formatMoney(report.summary.stockMrpValue)} />
        <MetricCard label="Unique Items / Sizes" value={`${report.summary.uniqueItems} / ${report.summary.uniqueSizes}`} />
        <MetricCard label="Latest Stock Month Used" value={report.summary.latestStockMonthLabel || "None"} />
        <MetricCard label="Sell-through Indicator" value={report.summary.sellThrough === null ? "Not available" : `${Math.round(report.summary.sellThrough * 100)}%`} note="Sold quantity / current stock quantity" />
        <MetricCard label="Fast Moving Count" value={String(report.summary.fastMovingCount)} />
        <MetricCard label="Slow Moving Count" value={String(report.summary.slowMovingCount)} />
        <MetricCard label="No-sale Stock Count" value={String(report.summary.noSaleStockCount)} />
      </section>

      {(query.brand || query.category) && (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">Selected filter detail</p>
          <h2 className="mt-2 text-2xl font-semibold">{[query.brand, query.category].filter(Boolean).join(" · ")}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Sales this period" value={formatMoney(report.summary.netSales)} />
            <MetricCard label="Current stock" value={formatNumber(report.summary.stockQuantity)} />
            <MetricCard label="Return amount" value={formatMoney(report.summary.returnAmount)} />
            <MetricCard label="Daily trend days" value={String(report.dailyTrend.length)} />
          </div>
        </section>
      )}

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Brand Performance</h2>
          <Boxes className="size-5 text-muted" />
        </div>
        <BrandTable query={query} rows={report.brandRows} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Category Performance</h2>
          <Layers3 className="size-5 text-muted" />
        </div>
        <CategoryTable query={query} rows={report.categoryRows} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Item/Product Performance</h2>
          <PackageSearch className="size-5 text-muted" />
        </div>
        <ItemTable rows={report.itemRows} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Size-wise Quantity</h2>
          <Ruler className="size-5 text-muted" />
        </div>
        <SizeTable rows={report.sizeRows} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Staff by Selected Filters</h2>
          <UsersRound className="size-5 text-muted" />
        </div>
        <StaffTable rows={report.staffRows} />
      </section>
    </div>
  );
}

