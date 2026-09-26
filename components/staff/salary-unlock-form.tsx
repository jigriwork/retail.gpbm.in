"use client";

import { useActionState, useEffect } from "react";

import { verifySalaryPassword, type StaffActionState } from "@/lib/staff/actions";

const initial: StaffActionState = { ok: false, message: "" };

export function SalaryUnlockForm() {
  const [state, action, pending] = useActionState(verifySalaryPassword, initial);
  useEffect(() => { if (state.ok) window.location.reload(); }, [state.ok]);
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
      <p className="font-semibold">Verify your password</p>
      <p className="text-xs leading-5 text-muted">Salary and payslip access stays unlocked for 10 minutes on this session.</p>
      <input autoComplete="current-password" className="h-12 rounded-2xl border border-border bg-background px-4" name="currentPassword" placeholder="Current password" required type="password" />
      <button className="h-12 rounded-2xl bg-foreground font-semibold text-background disabled:opacity-50" disabled={pending}>{pending ? "Verifying…" : "Unlock private salary"}</button>
      {state.message ? <p className={state.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-danger"}>{state.message}</p> : null}
    </form>
  );
}
