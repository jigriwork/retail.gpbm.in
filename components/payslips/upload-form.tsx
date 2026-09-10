"use client";
import { DirectUploadForm } from "@/components/uploads/direct-upload-form";

import Link from "next/link";
import { useActionState } from "react";
import type { PayrollUploadState } from "@/lib/payslips/import";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/auth/session";
import { getIndiaMonthInputValue } from "@/lib/tasks/dates";

export function PayslipUploadForm({
  action,
  error,
  stores,
}: {
  action: (state: PayrollUploadState, formData: FormData) => Promise<PayrollUploadState>;
  error?: string;
  stores: Store[];
}) {
  const [state, submit, pending] = useActionState(action, { ok: false, message: "" });
  return (
    <DirectUploadForm result={state} processing={pending} kind={"payroll"} action={submit} className="space-y-4">
      {state.importId ? <section className="space-y-3">
        <input type="hidden" name="importId" value={state.importId} />
        <input type="hidden" name="token" value={state.token ?? ""} />
        <h2 className="font-semibold">Review payroll version</h2>
        <p>Proposed workbook: {state.proposedRows ?? "reviewed"} rows; net payable {state.proposedTotal ?? "as reviewed"}.</p>
        {(state.comparison ?? []).map(batch => <details key={batch.batch_id}>
          <summary>{batch.file_name}: {batch.rows} rows, net payable {batch.total}{batch.legacy ? " (legacy batch: retained separately)" : " (current version)"}</summary>
          <ul>{batch.employees.map((employee, index) => <li key={index}>{employee.staff_name}: {employee.net_payable}</li>)}</ul>
        </details>)}
        <p>Original workbooks, PDFs and payment history will be retained. A revised logical run becomes current only after the complete import succeeds.</p>
        <label className="block">Type CREATE PAYROLL VERSION to confirm
          <input className="mt-2 block w-full rounded-xl border p-3" name="confirmation" required pattern="CREATE PAYROLL VERSION" autoComplete="off" />
        </label>
        <Link className="underline" href="/app/payslips/upload">Cancel and choose another file</Link>
      </section> : <>
      <label className="block">Payroll source/run name
        <input className="mt-2 block w-full rounded-xl border p-3" name="sourceLabel" defaultValue="monthly salary" required maxLength={80} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Salary month</span>
          <input
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={getIndiaMonthInputValue()}
            name="salaryMonth"
            required
            type="month"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Fallback store (if auto-detect fails)</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue=""
            name="fallbackStoreId"
          >
            <option value="">Auto detect</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block rounded-[1.35rem] border border-dashed border-border bg-card p-5">
        <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <UploadCloud className="size-4" />
          Upload salary sheet
        </span>
        <input
          accept=".xlsx,.xls,.csv"
          className="block w-full text-sm text-muted file:mr-4 file:h-10 file:rounded-xl file:border-0 file:bg-foreground file:px-4 file:text-sm file:font-semibold file:text-background"
          name="file"
          required
          type="file"
        />
        <span className="mt-3 block text-xs leading-5 text-muted">
          Supported files: .xlsx, .xls, .csv
        </span>
      </label>

      </>}
      {state.message ? <p role="status">{state.message}</p> : null}
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}

      <Button size="lg" disabled={pending}>
        <UploadCloud className="size-4" />
        {pending ? "Processing…" : state.importId ? "Confirm payroll version" : "Upload and review"}
      </Button>
    </DirectUploadForm>
  );
}
