import Link from "next/link";
import { BarChart3, CalendarClock, FileSpreadsheet, UploadCloud } from "lucide-react";

import { SalesReportList } from "@/components/reports/sales-report-list";
import { StatusCard } from "@/components/app/status-card";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getRecentSalesReports, getStoreSalesStatuses } from "@/lib/reports/sales-queries";

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

export default async function ReportsPage() {
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const [statuses, recentReports] = await Promise.all([
    getStoreSalesStatuses(stores),
    getRecentSalesReports(6),
  ]);
  const missingStores = statuses.filter((status) => !status.yesterdayReport);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold">Business uploads</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Daily sales is active. Stock and salary attendance are ready as placeholders for the next build steps.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
                <BarChart3 className="size-5" />
              </div>
              <h2 className="text-2xl font-semibold">Daily Sales Report</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Upload store-wise sales files and convert them into searchable sales rows.
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href="/app/reports/sales"
            >
              <UploadCloud className="size-4" />
              Upload
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {statuses.map((status) => (
              <div
                className="rounded-2xl border border-border p-4"
                key={status.store.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{status.store.name}</p>
                    <p className="mt-1 text-xs font-medium text-muted">
                      Yesterday: {status.yesterdayDate}
                    </p>
                  </div>
                  <span
                    className={
                      status.yesterdayReport
                        ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
                        : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
                    }
                  >
                    {status.yesterdayReport ? "Uploaded" : "Missing"}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold">
                  {formatMoney(status.latestReport?.summary?.totalNetSale)}
                </p>
                <p className="mt-1 text-xs font-medium text-muted">
                  Latest: {status.latestReport?.report_date ?? "No upload yet"}
                </p>
              </div>
            ))}
          </div>

          {missingStores.length ? (
            <div className="mt-4 rounded-2xl border border-border bg-background p-4 text-sm font-medium text-danger">
              Missing yesterday sales report:{" "}
              {missingStores.map((status) => status.store.name).join(", ")}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <StatusCard
            body="Placeholder only. Monthly stock upload will use the existing reports and stock rows tables later."
            icon={FileSpreadsheet}
            title="Monthly Stock Report"
          />
          <StatusCard
            body="Placeholder only. Salary attendance upload will be built after daily sales is stable."
            icon={CalendarClock}
            title="Salary Attendance"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent sales uploads</h2>
        <SalesReportList reports={recentReports} />
      </section>
    </div>
  );
}
