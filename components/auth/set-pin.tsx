"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { setOwnPin } from "@/lib/auth/phone-actions";

/** Shown after a WhatsApp code login until the person chooses their password. */
export function SetPinForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(setOwnPin, { message: "", ok: false });
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);
  const input = "mt-1 h-12 w-full rounded-2xl border border-border bg-background px-4 text-lg outline-none focus:border-primary";
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">New password (at least 6 characters)
        <input autoComplete="new-password" className={input} maxLength={72} minLength={6} name="pin" required type="password" />
      </label>
      <label className="block text-sm font-medium">Type it again
        <input autoComplete="new-password" className={input} maxLength={72} minLength={6} name="confirm" required type="password" />
      </label>
      {state.message ? <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`} role="status">{state.message}</p> : null}
      <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-white disabled:opacity-60" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}Save password
      </button>
    </form>
  );
}
