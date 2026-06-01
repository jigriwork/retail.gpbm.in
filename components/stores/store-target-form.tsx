"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { StoreTargetState } from "@/lib/stores/target-actions";

const initialState: StoreTargetState = {
  ok: false,
  message: "",
};

function formatMoney(value?: number | null) {
  if (!value) return "";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function StoreTargetForm({
  action,
  storeId,
  storeName,
  enabled,
  target,
}: {
  action: (previous: StoreTargetState, formData: FormData) => Promise<StoreTargetState>;
  storeId: string;
  storeName: string;
  enabled: boolean;
  target: number | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input name="storeId" type="hidden" value={storeId} />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{storeName}</p>
          <p className="mt-1 text-xs text-muted">Monthly sales target</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            className="size-5 accent-black"
            defaultChecked={enabled}
            name="enabled"
            type="checkbox"
          />
          Enable
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Target amount (₹)</span>
        <input
          className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus:border-foreground"
          defaultValue={formatMoney(target)}
          name="target"
          placeholder="500000"
          type="text"
          inputMode="numeric"
        />
      </label>

      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}

      <Button disabled={pending} size="md">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save target
      </Button>
    </form>
  );
}
