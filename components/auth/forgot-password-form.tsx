"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = {
  ok: false,
  message: "",
};

export function ForgotPasswordForm({
  action,
}: {
  action: (previous: AuthActionState, formData: FormData) => Promise<AuthActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Email</span>
        <input
          autoComplete="email"
          className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition hover:border-muted/50 focus:border-foreground focus:ring-4 focus:ring-foreground/5"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </label>
      <Button className="w-full" disabled={pending} size="lg">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Send reset link
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
