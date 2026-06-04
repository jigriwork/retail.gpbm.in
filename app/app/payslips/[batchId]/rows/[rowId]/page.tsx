import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { GeneratePayslipRowForm, PayslipRowPhoneForm } from "@/components/payslips/action-buttons";
import { PayslipPreview } from "@/components/payslips/preview";
import { PayslipWhatsAppActions } from "@/components/payslips/whatsapp-actions";
import { requireProfile } from "@/lib/auth/session";
import { generatePayslipForRow, updatePayslipRowPhone } from "@/lib/payslips/actions";
import { getPayslipBatch, getPayslipRow } from "@/lib/payslips/queries";
import { payslipFileName } from "@/lib/payslips/utils";

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
          <PayslipRowPhoneForm action={updatePayslipRowPhone} phone={row.employee_phone} rowId={row.id} />
          {generated?.id ? (
            <PayslipWhatsAppActions
              absAmount={row.abs_amount}
              absDays={row.abs_days}
              advance={row.advance}
              commission={row.commission}
              downloadUrl={`/app/payslips/${batch.id}/rows/${row.id}/download`}
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

      <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">Employee phone</p>
        <p className="mt-1 text-sm text-muted">{row.employee_phone || "Phone Missing"}</p>
        <p className={row.whatsapp_phone ? "mt-2 text-sm font-semibold text-success" : "mt-2 text-sm font-semibold text-warning"}>
          {row.whatsapp_phone ? "Phone Ready" : row.warning_message?.toLowerCase().includes("invalid phone") ? "Invalid Phone" : "Phone Missing"}
        </p>
        {!row.whatsapp_phone ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            Add phone once. Future payslips for this staff will auto-fill it.
          </p>
        ) : null}
      </section>

      {row.warning_message ? (
        <div className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-medium text-warning shadow-sm">
          {row.warning_message}
        </div>
      ) : null}

      <PayslipPreview row={row} />
    </div>
  );
}
