"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FirmMappingState } from "@/lib/stores/firm-actions";

const initialState: FirmMappingState = {
  ok: false,
  message: "",
};

export function FirmMappingForm({
  action,
  firmName,
  storeId,
  storeName,
}: {
  action: (previous: FirmMappingState, formData: FormData) => Promise<FirmMappingState>;
  firmName?: string | null;
  storeId: string;
  storeName: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input name="storeId" type="hidden" value={storeId} />

      <div>
        <p className="font-semibold">{storeName}</p>
        <p className="mt-1 text-xs text-muted">Store Name readonly</p>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Firm Name</span>
        <input
          className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus:border-foreground"
          defaultValue={firmName ?? ""}
          name="firmName"
          required
          type="text"
        />
      </label>

      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}

      <Button disabled={pending} size="md">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save
      </Button>
    </form>
  );
}
