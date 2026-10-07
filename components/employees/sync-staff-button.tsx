"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import type { EmployeeSyncState } from "@/lib/employees/actions";

const initialState: EmployeeSyncState = {
  ok: false,
  message: "",
};

export function SyncStaffButton({
  action,
}: {
  action: (previous: EmployeeSyncState, formData: FormData) => Promise<EmployeeSyncState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="contents">
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold transition hover:bg-black/[0.03] disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        <RefreshCw className={pending ? "size-4 shrink-0 animate-spin" : "size-4 shrink-0"} />
        <span className="truncate">{pending ? "Syncing…" : "Sync from salary sheet"}</span>
      </button>
      {state.message ? (
        <p className={`col-span-2 ${state.ok ? "text-xs font-semibold text-success" : "text-xs font-semibold text-danger"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
