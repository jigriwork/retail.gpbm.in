import Link from "next/link";
import { AlertTriangle, Download, Eye } from "lucide-react";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { GenerateBatchPayslipsProgress, GeneratePayslipRowForm, PayslipRowPhoneForm } from "@/components/payslips/action-buttons";
import { PayslipSentStatusActions } from "@/components/payslips/sent-status-actions";
import { PayslipWhatsAppActions } from "@/components/payslips/whatsapp-actions";
import { requireProfile } from "@/lib/auth/session";
import { generatePayslipForRow, updatePayslipRowPhone } from "@/lib/payslips/actions";
import { getPayslipBatch, getPayslipRows } from "@/lib/payslips/queries";
import { formatMoney, formatMonth, payslipFileName } from "@/lib/payslips/utils";

type RowWithGenerated = Awaited<ReturnType<typeof getPayslipRows>>[number];

function latestGenerated(row: RowWithGenerated) {
  const generated = row.generated_payslips;
  return Array.isArray(generated) ? generated[0] : null;
}

function statusClass(status?: string | null) {
  if (status === "ready" || status === "generated") return "text-success";
  if (status === "total_mismatch") return "text-warning";
  return "text-danger";
}

function canGenerate(status?: string | null) {
  return status === "ready" || status === "total_mismatch" || status === "generated";
}

function sentStatus(generated: ReturnType<typeof latestGenerated>) {
  return generated?.sent_status ?? "not_sent";
}

function phoneStatus(row: RowWithGenerated) {
  if (row.whatsapp_phone) return { className: "text-success", label: "Phone Ready" };
  if (row.warning_message?.toLowerCase().includes("invalid phone")) {
    return { className: "text-danger", label: "Invalid Phone" };
  }
  return { className: "text-warning", label: "Phone Missing" };
}

export default async function PayslipBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { batchId } = await params;
  const { sent: sentFilter = "all" } = await searchParams;
  const { profile } = await requireProfile();

  if (profile?.role !== "owner") {
    return <AccessDenied message="Payslip generation is reserved for the owner account." />;
  }

  const [batch, rows] = await Promise.all([getPayslipBatch(batchId), getPayslipRows(batchId)]);

  if (!batch) {
    notFound();
  }

  const generatableRows = rows
    .filter((row) => canGenerate(row.status))
    .map((row) => ({
      id: row.id,
      staffName: row.staff_name ?? "Unnamed staff",
      storeName: row.store_name,
    }));
  const generatedRows = rows.map((row) => latestGenerated(row)).filter((generated) => generated?.id);
  const sentCounts = generatedRows.reduce(
    (counts, generated) => {
      const status = sentStatus(generated);
      counts[status as keyof typeof counts] += 1;
      return counts;
    },
    { failed: 0, not_sent: 0, sent: 0, skipped: 0 },
  );
  const filteredRows =
    sentFilter === "all"
      ? rows
      : rows.filter((row) => {
          const generated = latestGenerated(row);
          return generated?.id && sentStatus(generated) === sentFilter;
        });
  const filters = [
    { href: `/app/payslips/${batch.id}`, label: "All", value: "all" },
    { href: `/app/payslips/${batch.id}?sent=sent`, label: "Sent", value: "sent" },
    { href: `/app/payslips/${batch.id}?sent=not_sent`, label: "Not Sent", value: "not_sent" },
    { href: `/app/payslips/${batch.id}?sent=failed`, label: "Failed", value: "failed" },
    { href: `/app/payslips/${batch.id}?sent=skipped`, label: "Skipped", value: "skipped" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/payslips">
          Back to payslips
        </Link>
        <Link className="ml-4 text-sm font-semibold text-muted" href="/app/employees">
          Employee Directory
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{formatMonth(batch.salary_month)}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Review parsed salary rows before sharing generated PDFs.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Salary Month</p>
            <p className="mt-1 font-semibold">{formatMonth(batch.salary_month)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Total rows</p>
            <p className="mt-1 text-2xl font-semibold">{batch.total_rows ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Valid rows</p>
            <p className="mt-1 text-2xl font-semibold">{batch.valid_rows ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Warnings</p>
            <p className="mt-1 text-2xl font-semibold">{batch.warning_count ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Generated</p>
            <p className="mt-1 text-2xl font-semibold">{batch.generated_count ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Sent</p>
            <p className="mt-1 text-2xl font-semibold text-success">{sentCounts.sent}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Not sent</p>
            <p className="mt-1 text-2xl font-semibold">{sentCounts.not_sent}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Failed</p>
            <p className="mt-1 text-2xl font-semibold text-danger">{sentCounts.failed}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Skipped</p>
            <p className="mt-1 text-2xl font-semibold text-muted">{sentCounts.skipped}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link
              className={
                sentFilter === filter.value
                  ? "inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background"
                  : "inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
              }
              href={filter.href}
              key={filter.value}
            >
              {filter.label}
            </Link>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-start gap-3">
          <GenerateBatchPayslipsProgress action={generatePayslipForRow} rows={generatableRows} />
          {(batch.generated_count ?? 0) > 0 ? (
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href={`/app/payslips/${batch.id}/zip`}
            >
              <Download className="size-4" />
              Download all ZIP
            </Link>
          ) : null}
        </div>
      </section>

      {/* Receivable warning summary for batch */}
      {(() => {
        const negRows = rows.filter((r) => (r.net_payable ?? 0) < 0);
        if (!negRows.length) return null;
        const totalReceivable = negRows.reduce((sum, r) => sum + Math.abs(r.net_payable ?? 0), 0);
        return (
          <section className="rounded-[1.35rem] border border-warning bg-yellow-50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 text-warning" />
                <div>
                  <p className="text-sm font-semibold text-warning">
                    This batch has {formatMoney(totalReceivable)} receivable from {negRows.length} staff.
                  </p>
                  <p className="mt-1 text-xs text-muted">Staff with negative net payable owe us money.</p>
                </div>
              </div>
              <Link
                className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                href={`/app/payslips/receivables?month=${batch.salary_month}`}
              >
                View Receivables
              </Link>
            </div>
          </section>
        );
      })()}

      <section className="grid gap-3">
        {filteredRows.map((row) => {
          const generated = latestGenerated(row);
          const rowPhoneStatus = phoneStatus(row);
          const downloadUrl = `/app/payslips/${batch.id}/rows/${row.id}/download`;

          return (
            <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={row.id}>
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr]">
                <div>
                  <p className="text-lg font-semibold">{row.staff_name || "Missing staff name"}</p>
                  <p className="mt-1 text-xs text-muted">
                    {row.store_name} | Firm {row.firm_name || "Missing"}
                  </p>
                </div>
                <div className="text-sm">
                  <p>Salary {formatMoney(row.salary_amount)}</p>
                  <p>Absent {row.abs_days ?? 0} days / {formatMoney(row.abs_amount)}</p>
                  <p>Advance {formatMoney(row.advance)}</p>
                </div>
                <div className="text-sm">
                  <p>Commission {formatMoney(row.commission)}</p>
                  <p>Uploaded total {row.uploaded_total_amount === null ? "Blank" : formatMoney(row.uploaded_total_amount)}</p>
                  <p>Calculated {formatMoney(row.calculated_total_amount)}</p>
                  <p className="font-semibold">Net {formatMoney(row.net_payable)}</p>
                  {(row.net_payable ?? 0) < 0 ? (
                    <span className="mt-1 inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                      Receivable {formatMoney(Math.abs(row.net_payable ?? 0))}
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${statusClass(row.status)}`}>{row.status}</p>
                  {row.warning_message ? (
                    <p className="mt-1 text-xs leading-5 text-warning">{row.warning_message}</p>
                  ) : null}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${rowPhoneStatus.className}`}>{rowPhoneStatus.label}</p>
                  <p className="mt-1 text-xs text-muted">{row.employee_phone || "No phone saved"}</p>
                  <p className="mt-1 text-xs text-muted">WhatsApp {row.whatsapp_phone || "Missing"}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-start gap-2">
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                  href={`/app/payslips/${batch.id}/rows/${row.id}`}
                >
                  <Eye className="size-4" />
                  Preview
                </Link>
                <GeneratePayslipRowForm action={generatePayslipForRow} rowId={row.id} />
                <PayslipRowPhoneForm action={updatePayslipRowPhone} phone={row.employee_phone} rowId={row.id} />
                {generated?.id ? (
                  <PayslipWhatsAppActions
                    absAmount={row.abs_amount}
                    absDays={row.abs_days}
                    advance={row.advance}
                    commission={row.commission}
                    dividedByDays={row.divided_by_days}
                    downloadUrl={downloadUrl}
                    fileName={generated.pdf_file_name ?? payslipFileName(row.store_name, row.staff_name ?? "Staff", row.salary_month)}
                    firmName={row.firm_name}
                    generatedPayslipId={generated.id}
                    netPayable={row.net_payable}
                    salaryAmount={row.salary_amount}
                    salaryMonth={row.salary_month}
                    staffName={row.staff_name ?? "Staff"}
                    storeName={row.store_name}
                    sundayPay={row.sunday_pay}
                    sundayPayAmount={row.sunday_pay_amount}
                    sundayPresent={row.sunday_present}
                    whatsappPhone={row.whatsapp_phone}
                  />
                ) : null}
              </div>
              {generated?.id ? (
                <div className="mt-4 border-t border-border pt-4">
                  <PayslipSentStatusActions
                    generatedPayslipId={generated.id}
                    lastShareAttemptAt={generated.last_share_attempt_at}
                    lastShareMethod={generated.last_share_method}
                    sentAt={generated.sent_at}
                    sentMethod={generated.sent_method}
                    sentNote={generated.sent_note}
                    sentStatus={generated.sent_status}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
