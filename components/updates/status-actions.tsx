"use client";

import { useActionState } from "react";
import { CheckCircle2, Circle, Loader2, PauseCircle, XCircle } from "lucide-react";

import { setManagerUpdateStatus, type UpdateActionState } from "@/lib/updates/actions";

const initialState: UpdateActionState = {
  ok: false,
  message: "",
};

const actions = [
  { status: "open", label: "Open", icon: Circle },
  { status: "in_progress", label: "In progress", icon: PauseCircle },
  { status: "resolved", label: "Resolved", icon: CheckCircle2 },
  { status: "cancelled", label: "Cancel", icon: XCircle },
];

export function UpdateStatusActions({ updateId }: { updateId: string }) {
  const [, formAction, pending] = useActionState(setManagerUpdateStatus, initialState);

  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input name="updateId" type="hidden" value={updateId} />
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold transition hover:bg-black/[0.03] disabled:opacity-50"
            disabled={pending}
            key={action.status}
            name="status"
            type="submit"
            value={action.status}
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
            {action.label}
          </button>
        );
      })}
    </form>
  );
}
