"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Plus } from "lucide-react";

import { createStore, type StoreActionState } from "@/lib/stores/store-actions";

const initialState: StoreActionState = { ok: false, message: "" };
const input =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none transition focus:border-primary sm:text-sm";

function Field({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function AddStoreForm() {
  const [state, action, pending] = useActionState(createStore, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form action={action} className="space-y-4" ref={formRef}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Store name">
          <input className={input} maxLength={60} name="name" placeholder="e.g. Go Planet Kids" required />
        </Field>
        <Field hint="Short code shown on reports, 2–10 letters or numbers." label="Store code">
          <input className={`${input} uppercase`} maxLength={10} name="code" placeholder="e.g. GPK" required />
        </Field>
        <Field hint="Printed on payslips for this store's staff." label="Billing firm name">
          <input className={input} maxLength={80} name="firmName" placeholder="e.g. GP Fashion" required />
        </Field>
        <Field label="Location">
          <input className={input} maxLength={80} name="location" placeholder="e.g. Berhampur" />
        </Field>
        <Field label="Store type">
          <input className={input} maxLength={40} name="type" placeholder="e.g. Fashion, Kids, Footwear" />
        </Field>
        <Field hint="Leave empty for no target." label="Monthly sales target (₹)">
          <input className={input} inputMode="numeric" name="monthlyTarget" placeholder="e.g. 1500000" />
        </Field>
        <Field label="Slow stock after (days)">
          <input className={input} defaultValue="45" inputMode="numeric" name="slowStockDays" />
        </Field>
        <Field label="Dead stock after (days)">
          <input className={input} defaultValue="90" inputMode="numeric" name="deadStockDays" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-deep disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add store
        </button>
        {state.message ? (
          <p aria-live="polite" className={state.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-danger"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
