import Link from "next/link";
import { Download, Eye } from "lucide-react";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { GenerateBatchPayslipsProgress, GeneratePayslipRowForm, PayslipRowPhoneForm } from "@/components/payslips/action-buttons";
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

function phoneStatus(row: RowWithGenerated) {
  if (row.whatsapp_phone) return { className: "text-success", label: "Phone Ready" };
  if (row.warning_message?.toLowerCase().includes("invalid phone")) {
    return { className: "text-danger", label: "Invalid Phone" };
  }
  return { className: "text-warning", label: "Phone Missing" };
}

export default async function PayslipBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
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

      <section className="grid gap-3">
        {rows.map((row) => {
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
                    downloadUrl={downloadUrl}
                    fileName={generated.pdf_file_name ?? payslipFileName(row.store_name, row.staff_name ?? "Staff", row.salary_month)}
                    firmName={row.firm_name}
                    netPayable={row.net_payable}
                    salaryAmount={row.salary_amount}
                    salaryMonth={row.salary_month}
                    staffName={row.staff_name ?? "Staff"}
                    storeName={row.store_name}
                    sundayPayAmount={row.sunday_pay_amount}
                    sundayPresent={row.sunday_present}
                    whatsappPhone={row.whatsapp_phone}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
