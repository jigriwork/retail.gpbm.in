"use client";

import { useActionState } from "react";
import { FileDown, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PayslipActionState } from "@/lib/payslips/actions";

const initialState: PayslipActionState = {
  ok: false,
  message: "",
};

export function GenerateAllPayslipsForm({
  action,
  batchId,
}: {
  action: (previous: PayslipActionState, formData: FormData) => Promise<PayslipActionState>;
  batchId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input name="batchId" type="hidden" value={batchId} />
      <Button disabled={pending} size="md">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        Generate all valid payslips
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function GeneratePayslipRowForm({
  action,
  rowId,
}: {
  action: (previous: PayslipActionState, formData: FormData) => Promise<PayslipActionState>;
  rowId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input name="rowId" type="hidden" value={rowId} />
      <Button className="h-10 rounded-xl px-3 text-xs" disabled={pending} size="md" variant="secondary">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Generate
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
