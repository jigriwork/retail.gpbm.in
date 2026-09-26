"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { changeStaffPassword, type StaffActionState } from "@/lib/staff/actions";

const initial: StaffActionState = { ok: false, message: "" };

export function StaffChangePasswordForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(changeStaffPassword, initial);
  useEffect(() => { if (state.ok) router.refresh(); }, [router, state.ok]);
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">Current temporary password<input autoComplete="current-password" className="h-12 rounded-2xl border border-border bg-background px-4" name="currentPassword" required type="password" /></label>
      <label className="grid gap-2 text-sm font-medium">New private password<input autoComplete="new-password" className="h-12 rounded-2xl border border-border bg-background px-4" name="newPassword" required type="password" /></label>
      <label className="grid gap-2 text-sm font-medium">Confirm new password<input autoComplete="new-password" className="h-12 rounded-2xl border border-border bg-background px-4" name="confirmPassword" required type="password" /></label>
      <p className="text-xs leading-5 text-muted">Use at least 10 characters with a letter, number and symbol. Your password is sent only to Supabase Auth and is never stored by GPBM Retail.</p>
      <button className="h-12 rounded-2xl bg-foreground px-4 font-semibold text-background disabled:opacity-50" disabled={pending}>{pending ? "Saving…" : "Save private password"}</button>
      {state.message ? <p className={state.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-danger"}>{state.message}</p> : null}
    </form>
  );
}
