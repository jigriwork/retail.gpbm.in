import Link from "next/link";

import type { SalaryAttendanceReportWithStore } from "@/lib/reports/salary-queries";

function formatDateTime(value: string | null) {
  if (!value) {
    return "No upload date";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function SalaryAttendanceReportList({
  reports,
  emptyText = "No salary attendance reports uploaded yet.",
}: {
  reports: SalaryAttendanceReportWithStore[];
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
                {report.stores?.name ?? "Store"} salary attendance
              </p>
              <p className="mt-1 text-sm text-muted">
                Month: {report.period_month ?? "No month"}
              </p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-success">
              {report.status ?? "processed"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Uploaded</p>
              <p className="mt-1 font-semibold">{formatDateTime(report.created_at)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Uploaded by</p>
              <p className="mt-1 font-semibold">
                {report.profiles?.full_name ?? report.profiles?.email ?? "User"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">File</p>
              <p className="mt-1 break-words font-semibold">{report.file_name ?? "No file"}</p>
            </div>
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
