"use client";

import { useActionState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  BulkDuplicateBehavior,
  CorrectionActionState,
  CorrectionSalesReport,
} from "@/lib/reports/sales-correction";
import type { Store } from "@/lib/auth/session";

const initialState: CorrectionActionState = {
  ok: false,
  message: "",
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (Array.isArray(value)) return value.join(", ") || "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ActionResult({ state }: { state: CorrectionActionState }) {
  if (!state.message) return null;

  return (
    <div className={state.ok ? "rounded-2xl border border-border p-3 text-xs leading-5 text-success" : "rounded-2xl border border-border p-3 text-xs leading-5 text-danger"}>
      <p className="font-semibold">{state.message}</p>
      {state.warning ? <p className="mt-1 text-muted">Storage warning: {state.warning}</p> : null}
      {state.expectedPhrase ? (
        <p className="mt-1 text-muted">
          Required phrase: <span className="font-semibold text-foreground">{state.expectedPhrase}</span>
        </p>
      ) : null}
      {state.preview ? (
        <div className="mt-2 space-y-1 text-muted">
          {Object.entries(state.preview).map(([key, value]) => (
            <p key={key}>
              <span className="font-semibold text-foreground">{key}:</span> {formatValue(value)}
            </p>
          ))}
        </div>
      ) : null}
      {state.summary ? (
        <div className="mt-2 space-y-1 text-muted">
          {Object.entries(state.summary).map(([key, value]) => (
            <p key={key}>
              <span className="font-semibold text-foreground">{key}:</span> {formatValue(value)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DeleteSalesReportForm({
  action,
  report,
}: {
  action: (previous: CorrectionActionState, formData: FormData) => Promise<CorrectionActionState>;
  report: CorrectionSalesReport;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const phrase = `DELETE SALES ${report.report_date ?? "NO-DATE"}`;

  return (
    <form action={formAction} className="space-y-2 rounded-2xl border border-border p-3">
      <input name="reportId" type="hidden" value={report.id} />
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Trash2 className="size-4" />
        Delete
      </p>
      <p className="text-xs leading-5 text-muted">Preview is shown in this report card. Type the phrase to delete.</p>
      <input
        className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs outline-none focus:border-foreground"
        name="confirmation"
        placeholder={phrase}
      />
      <Button className="h-10 rounded-xl px-3 text-xs" disabled={pending} type="submit" variant="secondary">
        {pending ? <Loader2 className="size-3 animate-spin" /> : <AlertTriangle className="size-3" />}
        Delete sales report
      </Button>
      <ActionResult state={state} />
    </form>
  );
}

export function ReplaceSalesReportForm({
  action,
  report,
}: {
  action: (previous: CorrectionActionState, formData: FormData) => Promise<CorrectionActionState>;
  report: CorrectionSalesReport;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const phrase = `REPLACE SALES ${report.report_date ?? "NO-DATE"}`;

  return (
    <form action={formAction} className="space-y-2 rounded-2xl border border-border p-3">
      <input name="reportId" type="hidden" value={report.id} />
      <p className="flex items-center gap-2 text-sm font-semibold">
        <RefreshCw className="size-4" />
        Replace
      </p>
      <input
        accept=".xlsx,.xls,.csv"
        className="block w-full text-xs text-muted file:mr-3 file:h-9 file:rounded-xl file:border-0 file:bg-foreground file:px-3 file:text-xs file:font-semibold file:text-background"
        name="file"
        required
        type="file"
      />
      <input
        className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs outline-none focus:border-foreground"
        name="confirmation"
        placeholder={phrase}
      />
      <p className="text-xs leading-5 text-muted">
        Submit without the phrase to preview. For final replace, reselect the same file and type the phrase.
      </p>
      <Button className="h-10 rounded-xl px-3 text-xs" disabled={pending} type="submit" variant="secondary">
        {pending ? <Loader2 className="size-3 animate-spin" /> : <UploadCloud className="size-3" />}
        Replace sales report
      </Button>
      <ActionResult state={state} />
    </form>
  );
}

export function BulkSalesUploadForm({
  action,
  stores,
}: {
  action: (previous: CorrectionActionState, formData: FormData) => Promise<CorrectionActionState>;
  stores: Store[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const duplicateOptions: Array<{ value: BulkDuplicateBehavior; label: string; description: string }> = [
    { value: "stop", label: "Stop if duplicates", description: "Safest default. Nothing imports if any date exists." },
    { value: "skip", label: "Skip existing dates", description: "Imports only missing dates." },
    { value: "replace", label: "Replace existing dates", description: "Replaces duplicate daily reports with the bulk file rows." },
  ];

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Store</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
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
          <span className="mb-2 block text-sm font-medium text-muted">Duplicate behavior</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue="stop"
            name="duplicateBehavior"
          >
            {duplicateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block rounded-[1.35rem] border border-dashed border-border bg-card p-5">
        <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <UploadCloud className="size-4" />
          Upload historical sales file
        </span>
        <input
          accept=".xlsx,.xls,.csv"
          className="block w-full text-sm text-muted file:mr-4 file:h-10 file:rounded-xl file:border-0 file:bg-foreground file:px-4 file:text-sm file:font-semibold file:text-background"
          name="file"
          required
          type="file"
        />
      </label>
      <div className="grid gap-2 text-xs text-muted lg:grid-cols-3">
        {duplicateOptions.map((option) => (
          <div className="rounded-2xl border border-border p-3" key={option.value}>
            <p className="font-semibold text-foreground">{option.label}</p>
            <p className="mt-1 leading-5">{option.description}</p>
          </div>
        ))}
      </div>
      <Button disabled={pending} size="lg">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
        Process bulk historical upload
      </Button>
      <ActionResult state={state} />
    </form>
  );
}

