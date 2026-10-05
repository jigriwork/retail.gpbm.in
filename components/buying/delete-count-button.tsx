"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { deleteStockCount } from "@/lib/buying/actions";

const initial: AccountsActionState = { ok: false, message: "" };

/** Delete a stock count after a confirmation. */
export function DeleteCountButton({ countId, storeId, title }: { countId: string; storeId: string; title: string }) {
  const [state, action, pending] = useActionState(deleteStockCount, initial);
  return (
    <form
      action={action}
      className="flex items-center gap-2"
      onSubmit={(event) => { if (!window.confirm(`Delete the count "${title}"? Its counted numbers are removed.`)) event.preventDefault(); }}
    >
      <input name="countId" type="hidden" value={countId} />
      <input name="storeId" type="hidden" value={storeId} />
      <button className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-danger/30 px-3 text-xs font-semibold text-danger hover:bg-danger/5" disabled={pending} type="submit">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete
      </button>
      {state.message && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
