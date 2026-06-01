import Link from "next/link";

import { SalaryAttendanceReportList } from "@/components/reports/salary-attendance-report-list";
import { SalaryAttendanceUploadForm } from "@/components/reports/salary-attendance-upload-form";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { uploadSalaryAttendanceReport } from "@/lib/reports/salary-actions";
import {
  getRecentSalaryAttendanceReports,
  getSalaryAttendanceOverview,
} from "@/lib/reports/salary-queries";

export default async function SalaryAttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { storeId } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const [recentReports, overview] = await Promise.all([
    getRecentSalaryAttendanceReports(8),
    getSalaryAttendanceOverview(stores),
  ]);
  const defaultStoreId = stores.some((store) => store.id === storeId) ? storeId : stores[0]?.id;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Salary attendance upload</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Monthly attendance is due on the 1st. Salary day is the 3rd.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
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
                ? `Uploaded file: ${status.report.file_name ?? "Attendance file"}`
                : "Upload the current month salary attendance report."}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {stores.length ? (
          <SalaryAttendanceUploadForm
            action={uploadSalaryAttendanceReport}
            defaultStoreId={defaultStoreId}
            stores={stores}
          />
        ) : (
          <p className="text-sm leading-6 text-muted">
            No active assigned store is available for salary attendance uploads.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent salary attendance reports</h2>
        <SalaryAttendanceReportList reports={recentReports} />
      </section>
    </div>
  );
}
