import Link from "next/link";

import { SalesReportList } from "@/components/reports/sales-report-list";
import { SalesUploadForm } from "@/components/reports/sales-upload-form";
import { uploadSalesReport } from "@/lib/reports/sales-actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getRecentSalesReports } from "@/lib/reports/sales-queries";

export default async function SalesReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { storeId } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const recentReports = await getRecentSalesReports(8);
  const defaultStoreId = stores.some((store) => store.id === storeId) ? storeId : stores[0]?.id;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Daily sales upload</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Upload one active store report at a time. Files can be .xlsx, .xls, or .csv.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {stores.length ? (
          <SalesUploadForm
            action={uploadSalesReport}
            defaultStoreId={defaultStoreId}
            stores={stores}
          />
        ) : (
          <p className="text-sm leading-6 text-muted">
            No active assigned store is available for sales uploads.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent sales reports</h2>
        <SalesReportList reports={recentReports} />
      </section>
    </div>
  );
}
