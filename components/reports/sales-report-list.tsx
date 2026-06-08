import Link from "next/link";

import { SalesRepairButton } from "@/components/reports/sales-repair-button";
import type { SalesRepairState } from "@/lib/reports/sales-actions";
import type { SalesReportWithStore } from "@/lib/reports/sales-queries";

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

function formatDate(date: string | null) {
  return date ?? "No date";
}

export function SalesReportList({
  canRepair = false,
  repairAction,
  reports,
  emptyText = "No sales reports uploaded yet.",
}: {
  canRepair?: boolean;
  repairAction?: (previous: SalesRepairState, formData: FormData) => Promise<SalesRepairState>;
  reports: SalesReportWithStore[];
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
                {report.stores?.name ?? "Store"} sales
              </p>
              <p className="mt-1 text-sm text-muted">{formatDate(report.report_date)}</p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-muted">
              {report.status ?? "processed"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Total sale</p>
              <p className="mt-1 font-semibold">
                {formatMoney(report.summary?.totalNetSale)}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Rows</p>
              <p className="mt-1 font-semibold">{report.row_count ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Bills</p>
              <p className="mt-1 font-semibold">{report.summary?.billCount ?? 0}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted">
            {(report.summary?.topCategories ?? []).slice(0, 3).map((item) => (
              <span className="rounded-full border border-border px-3 py-1" key={item.name}>
                {item.name}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-start gap-3">
            {report.store_id ? (
              <Link
                className="inline-flex min-h-10 items-center text-sm font-semibold text-foreground"
                href={`/app/stores/${report.store_id}`}
              >
                View store
              </Link>
            ) : null}
            {canRepair && repairAction ? (
              <SalesRepairButton action={repairAction} reportId={report.id} />
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
