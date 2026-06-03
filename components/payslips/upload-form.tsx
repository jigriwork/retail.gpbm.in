import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/auth/session";
import { getIndiaMonthInputValue } from "@/lib/tasks/dates";

export function PayslipUploadForm({
  action,
  error,
  stores,
}: {
  action: (formData: FormData) => Promise<void>;
  error?: string;
  stores: Store[];
}) {
  return (
    <form action={action} className="space-y-4">
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
          <span className="mb-2 block text-sm font-medium text-muted">Store selection</span>
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

      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}

      <Button size="lg">
        <UploadCloud className="size-4" />
        Upload and review
      </Button>
    </form>
  );
}
