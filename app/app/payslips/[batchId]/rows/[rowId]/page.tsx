import Link from "next/link";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { GeneratePayslipRowForm } from "@/components/payslips/action-buttons";
import { PayslipPreview } from "@/components/payslips/preview";
import { requireProfile } from "@/lib/auth/session";
import { generatePayslipForRow } from "@/lib/payslips/actions";
import { getPayslipBatch, getPayslipRow } from "@/lib/payslips/queries";

export default async function PayslipRowPage({
  params,
}: {
  params: Promise<{ batchId: string; rowId: string }>;
}) {
  const { batchId, rowId } = await params;
  const { profile } = await requireProfile();

  if (profile?.role !== "owner") {
    return <AccessDenied message="Payslip previews are reserved for the owner account." />;
  }

  const [batch, row] = await Promise.all([getPayslipBatch(batchId), getPayslipRow(rowId)]);
  if (!batch || !row || row.batch_id !== batch.id) {
    notFound();
  }

  const generated = Array.isArray(row.generated_payslips) ? row.generated_payslips[0] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link className="text-sm font-semibold text-muted" href={`/app/payslips/${batch.id}`}>
            Back to batch
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">{row.staff_name ?? "Payslip preview"}</h1>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <GeneratePayslipRowForm action={generatePayslipForRow} rowId={row.id} />
          {generated?.id ? (
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
              href={`/app/payslips/${batch.id}/rows/${row.id}/download`}
            >
              <Download className="size-4" />
              Download PDF
            </Link>
          ) : null}
        </div>
      </div>

      {row.warning_message ? (
        <div className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-medium text-warning shadow-sm">
          {row.warning_message}
        </div>
      ) : null}

      <PayslipPreview row={row} />
    </div>
  );
}
