"use client";

import { Loader2, Wrench } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { SalesRepairState } from "@/lib/reports/sales-actions";

const initialState: SalesRepairState = {
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

export function SalesRepairButton({
  action,
  reportId,
}: {
  action: (previous: SalesRepairState, formData: FormData) => Promise<SalesRepairState>;
  reportId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input name="reportId" type="hidden" value={reportId} />
      <Button className="h-10 rounded-xl px-3 text-xs" disabled={pending} type="submit" variant="secondary">
        {pending ? <Loader2 className="size-3 animate-spin" /> : <Wrench className="size-3" />}
        Repair totals
      </Button>
      <p className="text-xs leading-5 text-muted">
        Use this only if a footer/total row was imported by mistake.
      </p>
      {state.message ? (
        <div className={state.ok ? "text-xs leading-5 text-success" : "text-xs leading-5 text-danger"}>
          <p>{state.message}</p>
          {state.result ? (
            <p>
              Removed {state.result.removedFooterRows}. Rows {state.result.correctedRowCount}. Sale{" "}
              {formatMoney(state.result.correctedTotalSale)}. Bills {state.result.correctedBillCount}. Returns{" "}
              {state.result.correctedReturnRows}.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
