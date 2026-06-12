import Link from "next/link";
import { PackageSearch } from "lucide-react";

import { StockReportList } from "@/components/reports/stock-report-list";
import { StockUploadForm } from "@/components/reports/stock-upload-form";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { uploadStockReport } from "@/lib/reports/stock-actions";
import { getRecentStockReports, getStockOverview } from "@/lib/reports/stock-queries";

export default async function StockReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { storeId } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const [recentReports, overview] = await Promise.all([
    getRecentStockReports(8),
    getStockOverview(stores),
  ]);
  const defaultStoreId = stores.some((store) => store.id === storeId) ? storeId : stores[0]?.id;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Monthly stock upload</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Upload one active store stock file at a time. Files can be .xlsx, .xls, or .csv.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-foreground"
          href="/app/reports/stock/analytics"
        >
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl border border-border">
            <PackageSearch className="size-5" />
          </div>
          <h2 className="text-xl font-semibold">Stock analytics</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Slow stock, possible dead stock and fast moving low-stock candidates.
          </p>
        </Link>
        {overview.statuses.map((status) => (
          <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={status.store.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{status.store.name}</p>
                <p className="mt-1 text-xs font-medium text-muted">
                  Current month: {overview.periodMonth}
                </p>
              </div>
              <span
                className={
                  status.report
                    ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
                    : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
                }
              >
                {status.report ? "Uploaded" : "Missing"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              {status.report
                ? `${status.report.row_count ?? 0} rows processed.`
                : "Upload the current month stock report."}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {stores.length ? (
          <StockUploadForm action={uploadStockReport} defaultStoreId={defaultStoreId} stores={stores} />
        ) : (
          <p className="text-sm leading-6 text-muted">
            No active assigned store is available for stock uploads.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent stock reports</h2>
        <StockReportList reports={recentReports} />
      </section>
    </div>
  );
}
