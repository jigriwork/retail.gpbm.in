"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { celebrate } from "@/components/app/celebrate";
import { markNoIssuesToday } from "@/lib/checklist/actions";

type State = {
  ok: boolean;
  message: string;
};

const initialState: State = {
  ok: false,
  message: "",
};

export function NoIssuesButton({ storeId }: { storeId: string }) {
  const [state, formAction, pending] = useActionState(async (previous: State, formData: FormData) => {
    const result = await markNoIssuesToday(previous, formData);
    if (result.ok) celebrate();
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input name="storeId" type="hidden" value={storeId} />
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-deep disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        Mark no issues today
      </button>
      {state.message ? (
        <p className={state.ok ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
