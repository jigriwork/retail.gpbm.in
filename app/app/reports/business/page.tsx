import Link from "next/link";
import { BarChart3, Boxes, Layers3, PackageSearch, Ruler, Search, ShoppingBag, TrendingDown, UsersRound } from "lucide-react";

import { BusinessReportActions } from "@/components/reports/business-report-actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  getBusinessDateRange,
  getBusinessReport,
  type BusinessSignalRow,
  type BusinessPeriod,
  type BusinessRank,
  type BusinessItem,
  type SizeSummary,
  type StaffSummary,
} from "@/lib/analytics/business";
import { getMissingSalesReportDates } from "@/lib/analytics/sales";

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

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvSection(title: string, headers: string[], rows: Array<Array<unknown>>) {
  return [
    title,
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
    "",
  ].join("\n");
}

function buildSummaryText({
  brand,
  category,
  periodLabel,
  report,
  storeLabel,
}: {
  brand: string;
  category: string;
  periodLabel: string;
  report: Awaited<ReturnType<typeof getBusinessReport>>;
  storeLabel: string;
}) {
  const topStaff = report.staffRows[0]?.staffName ?? "None";
  const topProduct = report.itemRows[0]?.itemName ?? "None";

  return [
    "GPBM Business Report",
    `Store: ${storeLabel}`,
    `Period: ${periodLabel}`,
    brand ? `Brand: ${brand}` : "Brand: All",
    category ? `Category: ${category}` : "Category: All",
    "",
    `Net Sales: ${formatMoney(report.summary.netSales)}`,
    `Sold Qty: ${formatNumber(report.summary.soldQuantity)}`,
    `Current Stock: ${formatNumber(report.summary.stockQuantity)}`,
    `Return Amount: ${formatMoney(report.summary.returnAmount)}`,
    `Top Staff: ${topStaff}`,
    `Top Product: ${topProduct}`,
    `Restock Urgent: ${report.restockRows.filter((row) => row.signal === "Restock Urgent").length}`,
    `Slow / No-sale: ${report.slowRows.length}`,
    "",
    "Generated from GPBM Retail",
  ].join("\n");
}

function buildReportCsv(report: Awaited<ReturnType<typeof getBusinessReport>>) {
  return [
    csvSection(
      "Brand Performance",
      ["Brand", "Net Sales", "Sold Qty", "Return Amount", "Bills", "Stock Qty", "Stock MRP", "Items", "Sizes", "Top Category", "Top Staff", "Movement"],
      report.brandRows.map((row) => [
        row.name,
        row.netSales,
        row.soldQuantity,
        row.returnAmount,
        row.billCount,
        row.stockQuantity,
        row.stockMrpValue,
        row.uniqueItems,
        row.uniqueSizes,
        row.topCategory,
        row.topStaff,
        row.movementStatus,
      ]),
    ),
    csvSection(
      "Category Performance",
      ["Category", "Net Sales", "Sold Qty", "Return Amount", "Bills", "Stock Qty", "Stock MRP", "Items", "Brands", "Top Brand", "Top Staff"],
      report.categoryRows.map((row) => [
        row.name,
        row.netSales,
        row.soldQuantity,
        row.returnAmount,
        row.billCount,
        row.stockQuantity,
        row.stockMrpValue,
        row.uniqueItems,
        row.uniqueBrands,
        row.topBrand,
        row.topStaff,
      ]),
    ),
    csvSection(
      "Item/Product Performance",
      ["Brand", "Product", "Category", "Size", "Stock Qty", "Sold Qty", "Net Sales", "Return Qty", "MRP Value", "Staff", "Restock Signal", "Match Confidence", "Barcode", "SKU"],
      report.itemRows.map((row) => [
        row.brand,
        row.itemName,
        row.category,
        [...new Set([...row.sizesAvailable, ...row.sizesSold])].join(" / "),
        row.stockQuantity,
        row.soldQuantity,
        row.netSales,
        row.returnQuantity,
        row.stockMrpValue,
        row.staff.join(" / "),
        row.stockQuantity <= 2 && row.soldQuantity >= 5 ? "Restock Urgent" : "",
        row.matchConfidence,
        row.barcode,
        row.sku,
      ]),
    ),
    csvSection(
      "Size-wise Quantity",
      ["Size", "Stock Qty", "Sold Qty", "Return Qty", "Net Sold Qty", "Net Sales", "Brands", "Items"],
      report.sizeRows.map((row) => [
        row.size,
        row.stockQuantity,
        row.soldQuantity,
        row.returnQuantity,
        row.netSoldQuantity,
        row.netSales,
        row.brandsCount,
        row.itemsCount,
      ]),
    ),
    csvSection(
      "Restock Suggestions",
      ["Signal", "Brand", "Product", "Category", "Size", "Sold Qty", "Stock Qty", "Return Qty", "Net Sales", "Latest Stock Month", "Match Confidence"],
      report.restockRows.map((row) => [
        row.signal,
        row.brand,
        row.itemName,
        row.category,
        row.size,
        row.soldQuantity,
        row.stockQuantity,
        row.returnQuantity,
        row.netSales,
        row.latestStockMonth,
        row.matchConfidence,
      ]),
    ),
    csvSection(
      "Slow / No-sale Signals",
      ["Brand", "Product", "Category", "Size", "Stock Qty", "Sold Qty", "Net Sales", "MRP Value", "Suggested Action", "Match Confidence"],
      report.slowRows.map((row) => [
        row.brand,
        row.itemName,
        row.category,
        row.size,
        row.stockQuantity,
        row.soldQuantity,
        row.netSales,
        row.mrpValue,
        row.suggestedAction,
        row.matchConfidence,
      ]),
    ),
  ].join("\n");
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4 text-sm leading-6 text-muted">
      {children}
    </div>
  );
}

function DecisionItem({
  brand,
  itemName,
  netSales,
  soldQuantity,
  stockQuantity,
}: {
  brand?: string | null;
  itemName: string;
  netSales: number;
  soldQuantity: number;
  stockQuantity: number;
}) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="text-xs font-medium text-muted">{brand ?? "No brand"}</p>
      <p className="mt-1 font-semibold">{itemName}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted">Sold</p>
          <p className="font-semibold">{formatNumber(soldQuantity)}</p>
        </div>
        <div>
          <p className="text-muted">Sales</p>
          <p className="font-semibold">{formatMoney(netSales)}</p>
        </div>
        <div>
          <p className="text-muted">Stock</p>
          <p className="font-semibold">{formatNumber(stockQuantity)}</p>
        </div>
      </div>
    </div>
  );
}

function DecisionCard({
  children,
  count,
  emptyText,
  title,
}: {
  children: React.ReactNode;
  count?: number;
  emptyText: string;
  title: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        {count !== undefined ? (
          <span className="rounded-full border border-border px-2 py-1 text-xs font-semibold text-muted">
            {count}
          </span>
        ) : null}
      </div>
      {count === 0 ? <p className="text-sm leading-6 text-muted">{emptyText}</p> : children}
    </div>
  );
}

function statusClass(status: "ok" | "warning" | "danger") {
  if (status === "danger") return "text-danger";
  if (status === "warning") return "text-warning";
  return "text-success";
}

function BrandTable({
  rows,
  query,
}: {
  rows: BusinessRank[];
  query: Record<string, string | undefined>;
}) {
  if (!rows.length) {
    return (
      <EmptyState>
        No brand match for these filters. Check the spelling from the uploaded files, clear the brand field, or try a wider period.
      </EmptyState>
    );
  }

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
  if (!rows.length) {
    return (
      <EmptyState>
        No category match for these filters. Check if the category name differs in uploaded sales or stock files.
      </EmptyState>
    );
  }

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

function ItemTable({ hasItemSearch, rows }: { hasItemSearch: boolean; rows: BusinessItem[] }) {
  if (!rows.length) {
    return (
      <EmptyState>
        No product/item match for these filters. {hasItemSearch ? "Try widening period or clearing brand/category filters." : "Select a brand or category first, then search item name, barcode or SKU."}
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1240px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Brand</th>
            <th className="px-3 py-3 font-semibold">Item/Product Name</th>
            <th className="px-3 py-3 font-semibold">Category</th>
            <th className="px-3 py-3 font-semibold">Size</th>
            <th className="px-3 py-3 font-semibold">Stock Qty</th>
            <th className="px-3 py-3 font-semibold">Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Net Sales</th>
            <th className="px-3 py-3 font-semibold">Return Qty</th>
            <th className="px-3 py-3 font-semibold">Stock MRP</th>
            <th className="px-3 py-3 font-semibold">Staff</th>
            <th className="px-3 py-3 font-semibold">Restock Signal</th>
            <th className="px-3 py-3 font-semibold">Match Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-3">{row.brand ?? "None"}</td>
              <td className="px-3 py-3">
                <p className="font-semibold">{row.itemName}</p>
                <p className="mt-1 text-xs text-muted">
                  Barcode {row.barcode ?? "none"} · SKU {row.sku ?? "none"}
                </p>
              </td>
              <td className="px-3 py-3">{row.category ?? "None"}</td>
              <td className="px-3 py-3">
                {[...new Set([...row.sizesAvailable, ...row.sizesSold])].join(", ") || "None"}
              </td>
              <td className="px-3 py-3">{formatNumber(row.stockQuantity)}</td>
              <td className="px-3 py-3">{formatNumber(row.soldQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.netSales)}</td>
              <td className="px-3 py-3">{formatNumber(row.returnQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.stockMrpValue)}</td>
              <td className="px-3 py-3">{row.staff.slice(0, 5).join(", ") || "None"}</td>
              <td className="px-3 py-3">
                {row.soldQuantity >= 5 && row.stockQuantity <= 2
                  ? "Restock Urgent"
                  : row.soldQuantity >= 3 && row.stockQuantity <= 5
                    ? "Restock Soon"
                    : row.soldQuantity <= 1 && row.stockQuantity >= 10
                      ? "Do Not Reorder / Push Offer"
                      : row.soldQuantity === 0 && row.stockQuantity > 0
                        ? "No Sale Stock"
                        : "Watch"}
              </td>
              <td className="px-3 py-3">{row.matchConfidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalTable({
  mode,
  rows,
}: {
  mode: "restock" | "slow" | "low";
  rows: BusinessSignalRow[];
}) {
  if (!rows.length) {
    const message =
      mode === "restock"
        ? "No restock signal found. Try This Year or check if sales and latest stock reports are uploaded."
        : mode === "slow"
          ? "No slow/no-sale rows found for this selection. Try a wider period before deciding what to avoid buying."
          : "No low stock by size found. Size signals need explicit size in uploaded stock and sales rows.";

    return <EmptyState>{message}</EmptyState>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted">
          <tr>
            {mode === "restock" ? <th className="px-3 py-3 font-semibold">Signal</th> : null}
            <th className="px-3 py-3 font-semibold">Brand</th>
            <th className="px-3 py-3 font-semibold">Item/Product</th>
            <th className="px-3 py-3 font-semibold">Category</th>
            <th className="px-3 py-3 font-semibold">Size</th>
            <th className="px-3 py-3 font-semibold">Sold Qty</th>
            <th className="px-3 py-3 font-semibold">Current Stock Qty</th>
            <th className="px-3 py-3 font-semibold">Return Qty</th>
            <th className="px-3 py-3 font-semibold">Net Sales</th>
            {mode === "restock" ? <th className="px-3 py-3 font-semibold">Latest Stock Month</th> : null}
            {mode === "slow" ? <th className="px-3 py-3 font-semibold">MRP Value</th> : null}
            {mode === "slow" ? <th className="px-3 py-3 font-semibold">Suggested Action</th> : null}
            {mode === "low" ? <th className="px-3 py-3 font-semibold">Signal</th> : null}
            <th className="px-3 py-3 font-semibold">Match Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              {mode === "restock" ? <td className="px-3 py-3 font-semibold">{row.signal}</td> : null}
              <td className="px-3 py-3">{row.brand ?? "None"}</td>
              <td className="px-3 py-3 font-semibold">{row.itemName}</td>
              <td className="px-3 py-3">{row.category ?? "None"}</td>
              <td className="px-3 py-3">{row.size}</td>
              <td className="px-3 py-3">{formatNumber(row.soldQuantity)}</td>
              <td className="px-3 py-3">{formatNumber(row.stockQuantity)}</td>
              <td className="px-3 py-3">{formatNumber(row.returnQuantity)}</td>
              <td className="px-3 py-3">{formatMoney(row.netSales)}</td>
              {mode === "restock" ? <td className="px-3 py-3">{row.latestStockMonth ?? "None"}</td> : null}
              {mode === "slow" ? <td className="px-3 py-3">{formatMoney(row.mrpValue)}</td> : null}
              {mode === "slow" ? <td className="px-3 py-3">{row.suggestedAction}</td> : null}
              {mode === "low" ? <td className="px-3 py-3 font-semibold">{row.signal}</td> : null}
              <td className="px-3 py-3">{row.matchConfidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SizeTable({ rows }: { rows: SizeSummary[] }) {
  if (!rows.length) {
    return (
      <EmptyState>
        No size data found. Stock size works only when stock upload has size, and size-wise sales works only when sales upload has size.
      </EmptyState>
    );
  }

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
  if (!rows.length) {
    return (
      <EmptyState>
        No staff sales found for this selection. Try This Year or check whether sales files include staff names.
      </EmptyState>
    );
  }

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
  const missingSalesReports = await getMissingSalesReportDates(selectedStores, {
    endDate: range.endDate,
    startDate: range.startDate,
  });
  const storeLabel = selectedStoreId === "all" ? "All accessible stores" : selectedStores[0]?.name ?? "No store";
  const periodLabel = `${periodOptions.find((option) => option.value === period)?.label ?? "This month"} (${range.startDate} to ${range.endDate})`;
  const summaryText = buildSummaryText({
    brand: query.brand,
    category: query.category,
    periodLabel,
    report,
    storeLabel,
  });
  const csv = buildReportCsv(report);
  const weakItemRows = report.itemRows.filter((row) => row.matchConfidence === "weak item" || row.matchConfidence === "none").length;
  const missingDataCount =
    missingSalesReports.length +
    (report.stockWarning ? 1 : 0) +
    (report.summary.salesSizeMissingRows ? 1 : 0) +
    (weakItemRows ? 1 : 0);
  const topSellingRows = [...report.itemRows]
    .sort((left, right) => right.soldQuantity - left.soldQuantity || right.netSales - left.netSales)
    .slice(0, 3);
  const urgentRestockRows = report.restockRows.filter((row) => row.signal === "Restock Urgent");
  const avoidBuyingRows = report.slowRows;
  const lowStockRows = report.lowStockRows;
  const salesStatus =
    report.summary.billCount === 0 && report.summary.soldQuantity === 0 && report.summary.netSales === 0
      ? { label: "No sales data", tone: "danger" as const }
      : missingSalesReports.length
        ? { label: "Missing days", tone: "warning" as const }
        : { label: "Complete", tone: "ok" as const };
  const stockStatus =
    report.stockWarning || report.summary.stockQuantity === 0
      ? { label: "Missing stock", tone: "warning" as const }
      : { label: "Latest stock uploaded", tone: "ok" as const };
  const sizeStatus =
    report.sizeRows.length === 0
      ? { label: "No size data", tone: "danger" as const }
      : report.summary.salesSizeMissingRows
        ? { label: "Missing in some sales rows", tone: "warning" as const }
        : { label: "Available", tone: "ok" as const };
  const matchStatus =
    report.itemRows.length === 0
      ? { label: "No product matches", tone: "warning" as const }
      : weakItemRows
        ? { label: "Mixed / weak matches present", tone: "warning" as const }
        : { label: "Strong", tone: "ok" as const };

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Business Reporting</p>
            <h1 className="mt-2 text-3xl font-semibold">Buying & Restock Report</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Search brand, category, product and size to see stock, sold quantity, staff performance and reorder signals.
            </p>
          </div>
          <BarChart3 className="size-5 text-muted" />
        </div>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Selected filters</p>
            <h2 className="mt-2 text-2xl font-semibold">What this report is showing</h2>
          </div>
          <span className={missingDataCount ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-warning" : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"}>
            {missingDataCount ? `${missingDataCount} warning${missingDataCount === 1 ? "" : "s"}` : "No warnings"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Store", storeLabel],
            ["Period", periodLabel],
            ["Brand", query.brand || "All Brands"],
            ["Category", query.category || "All Categories"],
            ["Product search", query.item || "All Products"],
            ["Size", query.size || "All Sizes"],
            ["Latest stock month used", report.summary.latestStockMonthLabel || "None"],
            ["Missing data warnings", String(missingDataCount)],
          ].map(([label, value]) => (
            <div className="min-w-0 rounded-2xl border border-border p-3" key={label}>
              <p className="text-xs font-medium text-muted">{label}</p>
              <p className="mt-1 break-words text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Data Confidence</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Sales data", salesStatus],
            ["Stock data", stockStatus],
            ["Size data", sizeStatus],
            ["Match confidence", matchStatus],
          ].map(([label, item]) => {
            const status = item as { label: string; tone: "ok" | "warning" | "danger" };

            return (
              <div className="rounded-2xl border border-border p-3" key={label as string}>
                <p className="text-xs font-medium text-muted">{label as string}</p>
                <p className={`mt-2 font-semibold ${statusClass(status.tone)}`}>{status.label}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Stock note: latest monthly stock, not live inventory.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <DecisionCard count={topSellingRows.length} emptyText="No sales found for this period. Try This Year or check missing sales reports." title="Top Selling">
          <div className="space-y-2">
            {topSellingRows.map((row) => (
              <DecisionItem
                brand={row.brand}
                itemName={row.itemName}
                key={row.key}
                netSales={row.netSales}
                soldQuantity={row.soldQuantity}
                stockQuantity={row.stockQuantity}
              />
            ))}
          </div>
        </DecisionCard>
        <DecisionCard count={urgentRestockRows.length} emptyText="No urgent restock signal found for these filters." title="Restock Urgent">
          <div className="space-y-2">
            {urgentRestockRows.slice(0, 3).map((row) => (
              <DecisionItem
                brand={row.brand}
                itemName={row.itemName}
                key={row.key}
                netSales={row.netSales}
                soldQuantity={row.soldQuantity}
                stockQuantity={row.stockQuantity}
              />
            ))}
          </div>
        </DecisionCard>
        <DecisionCard count={avoidBuyingRows.length} emptyText="No avoid-buying or offer-push signal found." title="Avoid Buying / Push Offer">
          <div className="space-y-2">
            {avoidBuyingRows.slice(0, 3).map((row) => (
              <DecisionItem
                brand={row.brand}
                itemName={row.itemName}
                key={row.key}
                netSales={row.netSales}
                soldQuantity={row.soldQuantity}
                stockQuantity={row.stockQuantity}
              />
            ))}
          </div>
        </DecisionCard>
        <DecisionCard count={lowStockRows.length} emptyText="No low-stock size signal found." title="Low Stock by Size">
          <div className="space-y-2">
            {lowStockRows.slice(0, 3).map((row) => (
              <DecisionItem
                brand={row.brand}
                itemName={`${row.itemName} / ${row.size}`}
                key={row.key}
                netSales={row.netSales}
                soldQuantity={row.soldQuantity}
                stockQuantity={row.stockQuantity}
              />
            ))}
          </div>
        </DecisionCard>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm print:hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Share / Download</p>
            <h2 className="mt-2 text-2xl font-semibold">Owner-ready report actions</h2>
          </div>
          <BusinessReportActions
            csv={csv}
            fileName={`gpbm-business-report-${range.startDate}-to-${range.endDate}.csv`}
            summary={summaryText}
          />
        </div>
      </section>

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
            <span className="mt-2 block text-xs leading-5 text-muted">
              Searches within the selected store, period, brand and category. For best results, first select brand or category, then search item.
            </span>
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
      {missingSalesReports.length ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm leading-6 text-danger shadow-sm">
          Sales report missing for {missingSalesReports.length} selected store/date combination
          {missingSalesReports.length === 1 ? "" : "s"}. Decisions may be incomplete.
        </section>
      ) : null}
      {report.summary.salesSizeMissingRows ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm leading-6 text-muted shadow-sm">
          Size data not available in uploaded sales report for {report.summary.salesSizeMissingRows} row
          {report.summary.salesSizeMissingRows === 1 ? "" : "s"}.
        </section>
      ) : null}
      {weakItemRows ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm leading-6 text-muted shadow-sm">
          {weakItemRows} item row{weakItemRows === 1 ? "" : "s"} use weak or missing stock-sales match confidence. Verify before buying decisions.
        </section>
      ) : null}
      <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm leading-6 text-muted shadow-sm">
        Stock is based on the latest monthly upload, not a live inventory ledger.
      </section>

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
        <p className="mb-4 text-xs font-medium text-muted">Showing top 50 matching products.</p>
        <ItemTable hasItemSearch={Boolean(query.item)} rows={report.itemRows} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Restock Suggestions</h2>
          <ShoppingBag className="size-5 text-muted" />
        </div>
        <p className="mb-4 text-xs font-medium text-muted">
          Size-specific where uploaded stock/sales size data is available. Showing top 50 signals.
        </p>
        <SignalTable mode="restock" rows={report.restockRows} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Overstock / Slow Movement</h2>
          <TrendingDown className="size-5 text-muted" />
        </div>
        <p className="mb-4 text-xs font-medium text-muted">
          Slow / No-sale signal only. This is not final dead stock because ageing and purchase date are not used here.
        </p>
        <SignalTable mode="slow" rows={report.slowRows} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Low Stock by Size</h2>
          <Ruler className="size-5 text-muted" />
        </div>
        <p className="mb-4 text-xs font-medium text-muted">Uses explicit size columns only. Unsafe item-name size inference is not used.</p>
        <SignalTable mode="low" rows={report.lowStockRows} />
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
