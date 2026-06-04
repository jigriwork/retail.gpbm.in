import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { PayslipUploadForm } from "@/components/payslips/upload-form";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { uploadPayslipSalarySheet } from "@/lib/payslips/actions";

export default async function PayslipUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { profile } = await requireProfile();

  if (profile?.role !== "owner") {
    return <AccessDenied message="Managers do not have payslip access in v1." />;
  }

  const stores = (await getAccessibleStores(profile)).filter((store) => ["GP", "BM"].includes(store.code));
  const errorMessage =
    error === "missing"
      ? "Choose a salary month and upload a salary sheet."
      : error === "type"
        ? "Upload a .xlsx, .xls, or .csv file."
        : error;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/payslips">
          Back to payslips
        </Link>
        <Link className="ml-4 text-sm font-semibold text-muted" href="/app/employees">
          Employee Directory
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Upload Combined Salary Sheet</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Upload one combined Go Planet + Brand Mark salary Excel to generate payslips. Stores are auto-detected from sheet tabs or a store column.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <PayslipUploadForm action={uploadPayslipSalarySheet} error={errorMessage} stores={stores} />
      </section>
    </div>
  );
}
