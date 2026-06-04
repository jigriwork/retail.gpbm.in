"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <form action={formAction} className="space-y-2">
      <Button disabled={pending} size="md">
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
        Sync staff from payslips
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-xs font-semibold text-success" : "text-xs font-semibold text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
