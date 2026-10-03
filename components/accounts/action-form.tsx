"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AccountsActionState } from "@/lib/accounts/master-actions";

const initial: AccountsActionState = { ok: false, message: "" };

/** A form posting to an accounts server action, with its result shown inline. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  submitLabel,
  variant = "primary",
}: {
  action: (state: AccountsActionState, formData: FormData) => Promise<AccountsActionState>;
  children: React.ReactNode;
  className?: string;
  submitLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.duplicates?.length ? (
        <ul className="space-y-1 rounded-2xl border border-accent/40 bg-accent-soft p-3 text-sm text-accent-ink">
          {state.duplicates.map((duplicate) => (
            <li key={duplicate.id}>
              <Link className="font-semibold underline" href={`/app/accounts/parties/${duplicate.id}`}>{duplicate.name}</Link> · {duplicate.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} variant={variant}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        {state.message ? (
          <p aria-live="polite" className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"} role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
