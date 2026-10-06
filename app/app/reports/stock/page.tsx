export const maxDuration = 300;
import Link from "next/link";
import { PackageSearch } from "lucide-react";

import { StockReportList } from "@/components/reports/stock-report-list";
import { StockUploadForm } from "@/components/reports/stock-upload-form";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { uploadStockReport } from "@/lib/reports/stock-actions";
import { getRecentStockReports, getStockOverview } from "@/lib/reports/stock-queries";

export default async function StockReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { storeId } = await searchParams;
  const { profile } = await requireProfile();
  const limited = await isLimitedView(profile);
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
        <h1 className="mt-2 text-3xl font-semibold">Weekly stock upload</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Upload each store&apos;s current stock file every week (Monday). A newer file replaces the older one. Files can be .xlsx, .xls, or .csv.
        </p>
        {profile?.role === "owner" ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            Wrong stock file uploaded?{" "}
            <Link className="font-semibold text-primary underline" href="/app/reports/correction?tab=stock">
              Delete it in Data Correction Center
            </Link>
            , then the manager can upload the correct one.
          </p>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {!limited ? (
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm transition hover:border-primary"
          href="/app/reports/stock/analytics"
        >
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl border border-border">
            <PackageSearch className="size-5" />
          </div>
          <h2 className="text-xl font-semibold">Stock analytics</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Open all stores as separate store-wise stock reports, or use each store card below.
          </p>
        </Link>
        ) : null}
        {overview.statuses.map((status) => (
          <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={status.store.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{status.store.name}</p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {status.latestDate ? `Latest stock: ${status.latestDate.split("-").reverse().join("/")}` : "No stock file yet"}
                </p>
              </div>
              <span
                className={
                  status.report
                    ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
                    : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
                }
              >
                {status.report ? "Up to date" : "Due"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              {status.report
                ? `${status.report.row_count ?? 0} rows processed.`
                : "Stock is more than 7 days old: upload this week's stock file."}
            </p>
            {!limited ? (
              <Link
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                href={`/app/reports/stock/analytics?storeId=${status.store.id}`}
              >
                Open {status.store.name} Stock Analytics
              </Link>
            ) : null}
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
        <StockReportList hideAmounts={limited} reports={recentReports} />
      </section>
    </div>
  );
}
