import Link from "next/link";
import { ClipboardList, History, ShieldAlert, UploadCloud } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import {
  BulkSalesUploadForm,
  DeleteSalesReportForm,
  ReplaceSalesReportForm,
} from "@/components/reports/sales-correction-forms";
import { getAccessibleStores, requireOwner, requireProfile } from "@/lib/auth/session";
import {
  bulkHistoricalSalesUpload,
  deleteSalesReport,
  getCorrectionSalesReports,
  getRecentCorrectionAuditLogs,
  replaceSalesReport,
  type CorrectionSalesReport,
} from "@/lib/reports/sales-correction";

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value ?? 0));
}

function summaryValue(report: CorrectionSalesReport, key: string) {
  return report.summary && typeof report.summary === "object" && !Array.isArray(report.summary)
    ? (report.summary as Record<string, unknown>)[key]
    : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function metadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "No metadata";
  }

  const item = metadata as Record<string, unknown>;
  const parts = [
    item.file_name ? `file ${item.file_name}` : null,
    item.old_file_name ? `old ${item.old_file_name}` : null,
    item.new_file_name ? `new ${item.new_file_name}` : null,
    item.total_rows ? `rows ${item.total_rows}` : null,
    item.total_net_sale ? `sale ${formatMoney(item.total_net_sale)}` : null,
    item.duplicate_behavior ? `duplicates ${item.duplicate_behavior}` : null,
  ].filter(Boolean);

  return parts.join(" · ") || JSON.stringify(item).slice(0, 140);
}

export default async function SalesCorrectionPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; start?: string; end?: string; search?: string; page?: string }>;
}) {
  const { profile } = await requireProfile();
  const owner = await requireOwner();

  if (!owner || profile?.role !== "owner") {
    return <AccessDenied message="Data Correction Center is reserved for the owner account." />;
  }

  const { storeId = "all", start = "", end = "", search = "", page: rawPage = "1" } = await searchParams;
  const page = Math.max(Number(rawPage) || 1, 1);
  const stores = await getAccessibleStores(profile);
  const selectedStoreId = storeId !== "all" && stores.some((store) => store.id === storeId) ? storeId : "all";
  const [{ reports, count, pageSize }, auditLogs] = await Promise.all([
    getCorrectionSalesReports({
      endDate: end,
      page,
      search,
      startDate: start,
      storeId: selectedStoreId,
    }),
    getRecentCorrectionAuditLogs(25),
  ]);
  const totalPages = Math.max(Math.ceil(count / pageSize), 1);

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Owner only</p>
            <h1 className="mt-2 text-3xl font-semibold">Data Correction Center</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Delete, replace, or bulk-import sales reports with audit logs for every sensitive action.
            </p>
          </div>
          <ShieldAlert className="size-5 text-muted" />
        </div>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Sales Report Correction</p>
            <h2 className="mt-2 text-2xl font-semibold">Find wrong daily upload</h2>
          </div>
          <ClipboardList className="size-5 text-muted" />
        </div>
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Store</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={selectedStoreId}
              name="storeId"
            >
              <option value="all">All active stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Start</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={start}
              name="start"
              type="date"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">End</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={end}
              name="end"
              type="date"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">File search</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={search}
              name="search"
              placeholder="file name"
            />
          </label>
          <button className="mt-7 h-12 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85">
            Apply
          </button>
        </form>
      </section>

      <section className="space-y-3">
        {reports.length ? (
          reports.map((report) => (
            <article className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={report.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-lg font-semibold">
                    {report.stores?.name ?? "Store"} · {report.report_date ?? "No date"}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted">{report.file_name ?? "No file name"}</p>
                  <p className="mt-2 text-xs font-medium text-muted">
                    Uploaded by {report.profiles?.full_name ?? report.profiles?.email ?? "Unknown"} ·{" "}
                    {formatDateTime(report.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted">
                  <span className="rounded-full border border-border px-3 py-1">
                    {report.sales_upload_batch_id ? "Bulk batch" : "Daily upload"}
                  </span>
                  {report.sales_upload_batches?.status ? (
                    <span className="rounded-full border border-border px-3 py-1">
                      Batch {report.sales_upload_batches.status}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Rows</p>
                  <p className="mt-1 font-semibold">{report.row_count ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Total sale</p>
                  <p className="mt-1 font-semibold">{formatMoney(summaryValue(report, "totalNetSale"))}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Bills</p>
                  <p className="mt-1 font-semibold">{String(summaryValue(report, "billCount") ?? 0)}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Returns</p>
                  <p className="mt-1 font-semibold">{String(summaryValue(report, "returnsCount") ?? 0)}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Unmatched staff</p>
                  <p className="mt-1 font-semibold">{String(summaryValue(report, "unmatchedStaffCount") ?? 0)}</p>
                </div>
              </div>
              <details className="mt-4 rounded-2xl border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">View details</summary>
                <div className="mt-3 grid gap-3 text-xs leading-5 text-muted lg:grid-cols-2">
                  <p>
                    <span className="font-semibold text-foreground">Report id:</span> {report.id}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">File path:</span> {report.file_path ?? "None"}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Batch file:</span>{" "}
                    {report.sales_upload_batches?.original_file_name ?? "None"}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Status:</span> {report.status ?? "processed"}
                  </p>
                </div>
              </details>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <DeleteSalesReportForm action={deleteSalesReport} report={report} />
                <ReplaceSalesReportForm action={replaceSalesReport} report={report} />
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm leading-6 text-muted shadow-sm">
            No sales reports found for these filters.
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
          <Link
            className={page <= 1 ? "pointer-events-none text-muted opacity-40" : "text-foreground"}
            href={`/app/reports/correction?storeId=${selectedStoreId}&start=${start}&end=${end}&search=${search}&page=${Math.max(page - 1, 1)}`}
          >
            Previous
          </Link>
          <span className="text-muted">
            Page {page} of {totalPages} · {count} report{count === 1 ? "" : "s"}
          </span>
          <Link
            className={page >= totalPages ? "pointer-events-none text-muted opacity-40" : "text-foreground"}
            href={`/app/reports/correction?storeId=${selectedStoreId}&start=${start}&end=${end}&search=${search}&page=${Math.min(page + 1, totalPages)}`}
          >
            Next
          </Link>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Bulk Historical Sales Upload</p>
            <h2 className="mt-2 text-2xl font-semibold">Split one file date-wise</h2>
          </div>
          <UploadCloud className="size-5 text-muted" />
        </div>
        <BulkSalesUploadForm action={bulkHistoricalSalesUpload} stores={stores} />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Recent Audit Logs</p>
            <h2 className="mt-2 text-2xl font-semibold">Latest sensitive actions</h2>
          </div>
          <History className="size-5 text-muted" />
        </div>
        {auditLogs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-3 font-semibold">Action</th>
                  <th className="px-3 py-3 font-semibold">Store</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Actor</th>
                  <th className="px-3 py-3 font-semibold">Created</th>
                  <th className="px-3 py-3 font-semibold">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-3 font-semibold">{log.action}</td>
                    <td className="px-3 py-3">{log.stores?.name ?? "None"}</td>
                    <td className="px-3 py-3">{log.report_date ?? log.period_month ?? "None"}</td>
                    <td className="px-3 py-3">{log.profiles?.full_name ?? log.profiles?.email ?? "Unknown"}</td>
                    <td className="px-3 py-3">{formatDateTime(log.created_at)}</td>
                    <td className="px-3 py-3 text-xs text-muted">{metadataSummary(log.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted">No audit logs found yet.</p>
        )}
      </section>
    </div>
  );
}

