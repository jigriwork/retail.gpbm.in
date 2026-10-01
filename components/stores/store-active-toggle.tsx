"use client";

import { useActionState } from "react";
import { Loader2, Power } from "lucide-react";

import { setStoreActive, type StoreActionState } from "@/lib/stores/store-actions";

const initialState: StoreActionState = { ok: false, message: "" };

export function StoreActiveToggle({ active, storeId, storeName }: { active: boolean; storeId: string; storeName: string }) {
  const [state, action, pending] = useActionState(setStoreActive, initialState);

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        if (active && !window.confirm(`Switch off ${storeName}? Managers will stop seeing it. All its history is kept and you can switch it on again.`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="storeId" type="hidden" value={storeId} />
      <input name="active" type="hidden" value={active ? "false" : "true"} />
      <button
        className={
          active
            ? "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
            : "inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary-deep disabled:opacity-50"
        }
        disabled={pending}
        type="submit"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
        {active ? "Switch off" : "Switch on"}
      </button>
      {state.message && !state.ok ? <span className="text-xs font-semibold text-danger">{state.message}</span> : null}
    </form>
  );
}
