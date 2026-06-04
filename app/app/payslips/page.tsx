import Link from "next/link";
import { Download, Eye, Phone, UploadCloud } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { requireProfile } from "@/lib/auth/session";
import { getRecentPayslipBatches } from "@/lib/payslips/queries";
import { formatMonth } from "@/lib/payslips/utils";

export default async function PayslipsPage() {
  const { profile } = await requireProfile();

  if (profile?.role !== "owner") {
    return <AccessDenied message="Payslip generation is reserved for the owner account." />;
  }

  const batches = await getRecentPayslipBatches(12);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Payslips</p>
            <h1 className="mt-2 text-3xl font-semibold">Payslip Generation</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Upload salary sheets, review parsed rows and generate staff payslip PDFs.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
            href="/app/employees"
          >
            <Phone className="size-4" />
            Employee Directory
          </Link>
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href="/app/payslips/upload"
          >
            <UploadCloud className="size-4" />
            Upload Salary Sheet
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent payslip batches</h2>
        {batches.length ? (
          <div className="grid gap-3">
            {batches.map((batch) => {
              const generated = Array.isArray(batch.generated_payslips) ? batch.generated_payslips : [];
              const sentCount = generated.filter((item) => item.sent_status === "sent").length;
              const pendingCount = generated.filter((item) => (item.sent_status ?? "not_sent") === "not_sent").length;

              return (
                <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={batch.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold">{formatMonth(batch.salary_month)}</p>
                      <p className="mt-1 text-xs text-muted">{batch.source_file_name ?? "Salary sheet"}</p>
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-6 lg:min-w-[38rem]">
                      <span>Total {batch.total_rows ?? 0}</span>
                      <span>Valid {batch.valid_rows ?? 0}</span>
                      <span>Warnings {batch.warning_count ?? 0}</span>
                      <span>Generated {batch.generated_count ?? generated.length}</span>
                      <span className="text-success">Sent {sentCount}</span>
                      <span>Pending {pendingCount}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                        href={`/app/payslips/${batch.id}`}
                      >
                        <Eye className="size-4" />
                        View batch
                      </Link>
                      {(batch.generated_count ?? generated.length) > 0 ? (
                        <Link
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                          href={`/app/payslips/${batch.id}/zip`}
                        >
                          <Download className="size-4" />
                          ZIP
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-semibold capitalize text-muted">{batch.status ?? "review"}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm text-muted shadow-sm">
            No payslip batch uploaded yet.
          </div>
        )}
      </section>
    </div>
  );
}
