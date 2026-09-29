"use client";

import { useActionState } from "react";
import { Loader2, WandSparkles } from "lucide-react";

import { generateTodayReminders } from "@/lib/tasks/actions";

type ActionState = {
  ok: boolean;
  message: string;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

export function GenerateRemindersButton() {
  const [state, formAction, pending] = useActionState(
    async () => generateTodayReminders(),
    initialState,
  );

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03] disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <WandSparkles className="size-4" />
          )}
          Generate reminders
        </button>
      </form>
      {state.message ? (
        <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
