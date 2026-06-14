"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = {
  ok: false,
  message: "",
};

export function ChangePasswordForm({
  action,
}: {
  action: (previous: AuthActionState, formData: FormData) => Promise<AuthActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Current password</span>
        <input
          autoComplete="current-password"
          className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          name="currentPassword"
          required
          type="password"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">New password</span>
        <input
          autoComplete="new-password"
          className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          minLength={8}
          name="newPassword"
          required
          type="password"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Confirm new password</span>
        <input
          autoComplete="new-password"
          className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
      </label>
      <Button disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Change My Password
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
