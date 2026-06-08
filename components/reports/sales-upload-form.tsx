"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/auth/session";
import type { SalesUploadState } from "@/lib/reports/sales-actions";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

const initialState: SalesUploadState = {
  ok: false,
  message: "",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function SalesUploadForm({
  action,
  stores,
  defaultStoreId,
}: {
  action: (previous: SalesUploadState, formData: FormData) => Promise<SalesUploadState>;
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
            <span className="mb-2 block text-sm font-medium text-muted">Report date</span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={addDays(getIndiaToday(), -1)}
              name="reportDate"
              required
              type="date"
            />
          </label>
        </div>

        <label className="block rounded-[1.35rem] border border-dashed border-border bg-card p-5">
          <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UploadCloud className="size-4" />
            Upload sales file
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

        {state.message ? (
          <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
            {state.message}
          </p>
        ) : null}

        <Button disabled={pending} size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          Process sales report
        </Button>
      </form>

      {state.summary ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">Upload summary</p>
          <h2 className="mt-2 text-2xl font-semibold">{state.summary.storeName}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Report date</p>
              <p className="mt-1 font-semibold">{state.summary.reportDate}</p>
              {state.summary.detectedDate ? (
                <p className="mt-1 text-xs text-muted">Detected from bill date</p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Rows</p>
              <p className="mt-1 font-semibold">{state.summary.rowsProcessed}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Total sale</p>
              <p className="mt-1 font-semibold">{formatMoney(state.summary.totalNetSale)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Bills</p>
              <p className="mt-1 font-semibold">{state.summary.billCount}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Returns</p>
              <p className="mt-1 font-semibold">{state.summary.returnsCount}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Skipped rows</p>
              <p className="mt-1 font-semibold">{state.summary.skippedRows}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Unmatched staff</p>
              <p className="mt-1 font-semibold">{state.summary.unmatchedStaffCount}</p>
            </div>
          </div>
          {state.summary.unmatchedStaffNames.length ? (
            <div className="mt-5 rounded-2xl border border-border p-4">
              <p className="text-sm font-semibold">Unmatched staff names</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {state.summary.unmatchedStaffNames.join(", ")}
              </p>
              <Link
                className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
                href="/app/reports/staff-aliases"
              >
                Open alias mapping
              </Link>
            </div>
          ) : null}
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div>
              <p className="text-sm font-semibold">Staff found</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {state.summary.staffNames.length
                  ? state.summary.staffNames.join(", ")
                  : "No staff column found"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Top categories</p>
              <div className="mt-2 space-y-1 text-sm text-muted">
                {state.summary.topCategories.length
                  ? state.summary.topCategories.map((item) => (
                      <p key={item.name}>
                        {item.name}: {formatMoney(item.sale)}
                      </p>
                    ))
                  : "No category column found"}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">Top brands</p>
              <div className="mt-2 space-y-1 text-sm text-muted">
                {state.summary.topBrands.length
                  ? state.summary.topBrands.map((item) => (
                      <p key={item.name}>
                        {item.name}: {formatMoney(item.sale)}
                      </p>
                    ))
                  : "No brand column found"}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
