"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { changeStaffPassword, type StaffActionState } from "@/lib/staff/actions";

const initial: StaffActionState = { ok: false, message: "" };

export function StaffChangePasswordForm({ requireCurrent = true }: { requireCurrent?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(changeStaffPassword, initial);
  useEffect(() => { if (state.ok) router.refresh(); }, [router, state.ok]);
  return (
    <form action={action} className="grid gap-4">
      {requireCurrent ? <label className="grid gap-2 text-sm font-medium">Current PIN<input autoComplete="current-password" className="h-12 rounded-2xl border border-border bg-background px-4" inputMode="numeric" maxLength={8} minLength={6} name="currentPassword" pattern="[0-9]{6,8}" required type="password" /></label> : null}
      <label className="grid gap-2 text-sm font-medium">New private PIN (6–8 digits)<input autoComplete="new-password" className="h-12 rounded-2xl border border-border bg-background px-4" inputMode="numeric" maxLength={8} minLength={6} name="newPassword" pattern="[0-9]{6,8}" required type="password" /></label>
      <label className="grid gap-2 text-sm font-medium">Confirm private PIN<input autoComplete="new-password" className="h-12 rounded-2xl border border-border bg-background px-4" inputMode="numeric" maxLength={8} minLength={6} name="confirmPassword" pattern="[0-9]{6,8}" required type="password" /></label>
      <button className="h-12 rounded-2xl bg-foreground px-4 font-semibold text-background disabled:opacity-50" disabled={pending}>{pending ? "Saving…" : "Save private PIN"}</button>
      {state.message ? <p className={state.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-danger"}>{state.message}</p> : null}
    </form>
  );
}
