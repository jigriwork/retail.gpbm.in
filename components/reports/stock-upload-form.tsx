"use client";

import { useActionState } from "react";
import { Loader2, PackageSearch, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/auth/session";
import type { StockUploadState } from "@/lib/reports/stock-actions";
import { getIndiaMonthInputValue } from "@/lib/tasks/dates";

const initialState: StockUploadState = {
  ok: false,
  message: "",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "Not calculable";
  }

  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function StockUploadForm({
  action,
  stores,
  defaultStoreId,
}: {
  action: (previous: StockUploadState, formData: FormData) => Promise<StockUploadState>;
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
            <PackageSearch className="size-4" />
            Upload stock file
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
          Process stock report
        </Button>
      </form>

      {state.summary ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted">Upload summary</p>
          <h2 className="mt-2 text-2xl font-semibold">{state.summary.storeName}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Rows</p>
              <p className="mt-1 font-semibold">{state.summary.rowsProcessed}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Items</p>
              <p className="mt-1 font-semibold">{state.summary.itemCount}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Total quantity</p>
              <p className="mt-1 font-semibold">{formatNumber(state.summary.totalQuantity)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">MRP value</p>
              <p className="mt-1 font-semibold">{formatMoney(state.summary.totalStockValueMrp)}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Top brands</p>
              <div className="mt-2 space-y-1 text-sm text-muted">
                {state.summary.topBrands.length
                  ? state.summary.topBrands.map((item) => (
                      <p key={item.name}>
                        {item.name}: {formatNumber(item.quantity)}
                      </p>
                    ))
                  : "No brand column found"}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">Top categories</p>
              <div className="mt-2 space-y-1 text-sm text-muted">
                {state.summary.topCategories.length
                  ? state.summary.topCategories.map((item) => (
                      <p key={item.name}>
                        {item.name}: {formatNumber(item.quantity)}
                      </p>
                    ))
                  : "No category column found"}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
