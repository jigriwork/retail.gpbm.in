import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  ChartNoAxesCombined,
  FileText,
  FileSpreadsheet,
  LineChart,
  PackageSearch,
  Phone,
  ShieldAlert,
  UploadCloud,
  UserRoundCheck,
  UserRoundCog,
} from "lucide-react";

import { SalesReportList } from "@/components/reports/sales-report-list";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getRecentSalesReports, getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { getSalaryAttendanceOverview } from "@/lib/reports/salary-queries";
import { getStockOverview } from "@/lib/reports/stock-queries";

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
  const [statuses, recentReports, salaryOverview, stockOverview] = await Promise.all([
    getStoreSalesStatuses(stores),
    getRecentSalesReports(6),
    getSalaryAttendanceOverview(stores),
    getStockOverview(stores),
  ]);
  const missingStores = statuses.filter((status) => !status.yesterdayReport);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold">Business uploads</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Daily sales, stock, salary attendance and practical sales analytics are active.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
                <BarChart3 className="size-5" />
              </div>
              <h2 className="text-2xl font-semibold">Daily Sales Upload</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Upload store-wise daily sales files and convert them into searchable sales rows.
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
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/reports/business"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <ChartNoAxesCombined className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Buying & Restock Report</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Search brand/product/category/size, compare stock vs sales, and find what to reorder or avoid buying.
            </p>
          </Link>
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/reports/sales/analytics"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <LineChart className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Sales Analytics</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Track sales trends, targets, daily movement, brands and categories from uploaded sales rows.
            </p>
          </Link>
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/reports/staff"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <UserRoundCheck className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Staff Sales Report</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Check staff performance for daily, weekly and monthly sales.
            </p>
          </Link>
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/reports/staff-aliases"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <UserRoundCog className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Staff Name Aliases</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Map sales report agent names to staff directory contacts.
            </p>
          </Link>
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/reports/stock"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <FileSpreadsheet className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Stock Upload</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Upload monthly stock and confirm current stock status. Current month: {stockOverview.periodMonth}.
            </p>
            <div className="mt-4 space-y-2">
              {stockOverview.statuses.map((status) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={status.store.id}>
                  <span className="font-medium">{status.store.name}</span>
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
              ))}
            </div>
          </Link>
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/reports/stock/analytics"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <PackageSearch className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Stock Analytics</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Review stock movement, possible dead stock, high-stock low-sale items and reorder signals.
            </p>
          </Link>
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/reports/salary-attendance"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <CalendarClock className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Salary Attendance</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Due day 1. Salary day 3. Current month: {salaryOverview.periodMonth}.
            </p>
            <div className="mt-4 space-y-2">
              {salaryOverview.statuses.map((status) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={status.store.id}>
                  <span className="font-medium">{status.store.name}</span>
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
              ))}
            </div>
          </Link>
          <Link
            className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
            href="/app/employees"
          >
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
              <Phone className="size-5" />
            </div>
            <h2 className="text-2xl font-semibold">Staff Phone Directory</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Phone numbers for assigned store staff.
            </p>
          </Link>
          {profile?.role === "owner" ? (
            <>
              <Link
                className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
                href="/app/reports/correction"
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
                  <ShieldAlert className="size-5" />
                </div>
                <h2 className="text-2xl font-semibold">Data Correction Center</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Fix wrong uploads: delete, replace, repair or bulk upload sales reports. Owner only.
                </p>
              </Link>
              <Link
                className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
                href="/app/payslips"
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border">
                  <FileText className="size-5" />
                </div>
                <h2 className="text-2xl font-semibold">Payslip Generation</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Owner-only salary sheet upload, review, PDF generation and ZIP download.
                </p>
              </Link>
            </>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent sales uploads</h2>
        <SalesReportList reports={recentReports} />
      </section>
    </div>
  );
}
