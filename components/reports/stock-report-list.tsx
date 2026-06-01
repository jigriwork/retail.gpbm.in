import Link from "next/link";

import type { StockReportWithStore } from "@/lib/reports/stock-queries";

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

export function StockReportList({
  reports,
  emptyText = "No stock reports uploaded yet.",
}: {
  reports: StockReportWithStore[];
  emptyText?: string;
}) {
  if (!reports.length) {
    return (
      <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm leading-6 text-muted shadow-sm">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <article
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm"
          key={report.id}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-semibold">
                {report.stores?.name ?? "Store"} stock
              </p>
              <p className="mt-1 text-sm text-muted">
                Month: {report.period_month ?? "No month"}
              </p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-success">
              {report.status ?? "processed"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Rows</p>
              <p className="mt-1 font-semibold">{report.row_count ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Quantity</p>
              <p className="mt-1 font-semibold">{formatNumber(report.summary?.totalQuantity)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">MRP value</p>
              <p className="mt-1 font-semibold">{formatMoney(report.summary?.totalStockValueMrp)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Items</p>
              <p className="mt-1 font-semibold">{report.summary?.itemCount ?? 0}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted">
            {(report.summary?.topCategories ?? []).slice(0, 3).map((item) => (
              <span className="rounded-full border border-border px-3 py-1" key={item.name}>
                {item.name}
              </span>
            ))}
          </div>
          {report.store_id ? (
            <Link
              className="mt-4 inline-flex text-sm font-semibold text-foreground"
              href={`/app/stores/${report.store_id}`}
            >
              View store
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}
