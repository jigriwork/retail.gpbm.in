"use client";

import { useActionState } from "react";
import { CalendarDays, Loader2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/auth/session";
import type { SalaryAttendanceUploadState } from "@/lib/reports/salary-actions";
import { getIndiaMonthInputValue } from "@/lib/tasks/dates";

const initialState: SalaryAttendanceUploadState = {
  ok: false,
  message: "",
};

export function SalaryAttendanceUploadForm({
  action,
  stores,
  defaultStoreId,
}: {
  action: (
    previous: SalaryAttendanceUploadState,
    formData: FormData,
  ) => Promise<SalaryAttendanceUploadState>;
  stores: Store[];
  defaultStoreId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Store</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={defaultStoreId ?? stores[0]?.id ?? ""}
              name="storeId"
              required
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Period month</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={getIndiaMonthInputValue()}
              name="periodMonth"
              required
              type="month"
            />
          </label>
        </div>

        <label className="block rounded-[1.35rem] border border-dashed border-border bg-card p-5">
          <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4" />
            Upload salary attendance file
          </span>
          <input
            accept=".xlsx,.xls,.csv,.pdf"
            className="block w-full text-sm text-muted file:mr-4 file:h-10 file:rounded-xl file:border-0 file:bg-foreground file:px-4 file:text-sm file:font-semibold file:text-background"
            name="file"
            required
            type="file"
          />
          <span className="mt-3 block text-xs leading-5 text-muted">
            Supported files: .xlsx, .xls, .csv, .pdf
          </span>
        </label>

        {state.message ? (
          <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
            {state.message}
          </p>
        ) : null}

        <Button disabled={pending} size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          Upload attendance
        </Button>
      </form>

      {state.summary ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">Upload summary</p>
          <h2 className="mt-2 text-2xl font-semibold">{state.summary.storeName}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Period month</p>
              <p className="mt-1 font-semibold">{state.summary.periodMonth}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">File</p>
              <p className="mt-1 break-words font-semibold">{state.summary.fileName}</p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
