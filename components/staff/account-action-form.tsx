"use client";

import { useActionState } from "react";

import type { StaffActionState } from "@/lib/staff/actions";

type Action = (state: StaffActionState, data: FormData) => Promise<StaffActionState>;

const initialState: StaffActionState = { ok: false, message: "" };

export function AccountActionForm({
  action,
  children,
  submitLabel,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="grid gap-3">
      {children}
      <button className="h-11 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </button>
      {state.message ? <p className={state.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-danger"}>{state.message}</p> : null}
    </form>
  );
}

export function PasswordFields({ includeTemporary = true }: { includeTemporary?: boolean }) {
  return (
    <>
      {includeTemporary ? (
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Temporary password
          <input autoComplete="new-password" className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground" name="temporaryPassword" required type="password" />
        </label>
      ) : null}
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Your current password (recent authentication)
        <input autoComplete="current-password" className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground" name="currentPassword" required type="password" />
      </label>
    </>
  );
}
