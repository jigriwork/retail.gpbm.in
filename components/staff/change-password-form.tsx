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
      {requireCurrent ? <label className="grid gap-2 text-sm font-medium">Current password<input autoComplete="current-password" className="h-12 rounded-2xl border border-border bg-background px-4" minLength={6} name="currentPassword" required type="password" /></label> : null}
      <label className="grid gap-2 text-sm font-medium">New password (at least 6 characters)<input autoComplete="new-password" className="h-12 rounded-2xl border border-border bg-background px-4" maxLength={72} minLength={6} name="newPassword" required type="password" /></label>
      <label className="grid gap-2 text-sm font-medium">Type it again<input autoComplete="new-password" className="h-12 rounded-2xl border border-border bg-background px-4" maxLength={72} minLength={6} name="confirmPassword" required type="password" /></label>
      <button className="h-12 rounded-2xl bg-primary px-4 font-semibold text-white disabled:opacity-50" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
      {state.message ? <p className={state.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-danger"}>{state.message}</p> : null}
    </form>
  );
}
