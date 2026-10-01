"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import { ActionMessage } from "@/components/owner/action-message";
import { saveSop, type SopActionState } from "@/lib/sops/actions";
import { updateCategories } from "@/lib/updates/constants";

const initialState: SopActionState = { ok: false, message: "" };
const field = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary";
const area = "w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-primary";

export type SopFormValues = {
  escalate_when?: string;
  exception_category?: string;
  id?: string;
  is_active?: boolean;
  purpose?: string;
  sop_key?: string;
  sort_order?: number;
  steps?: string;
  store_id?: string | null;
  title?: string;
  when_to_use?: string;
};

export function SopForm({ defaults, stores }: { defaults: SopFormValues; stores: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(saveSop, initialState);
  return (
    <form action={action} className="space-y-4">
      {defaults.id ? <input name="sopId" type="hidden" value={defaults.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">Title</span>
          <input className={field} defaultValue={defaults.title} maxLength={80} name="title" required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Applies to</span>
          <select className={field} defaultValue={defaults.store_id ?? ""} name="storeId">
            <option value="">All stores</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name} only</option>)}
          </select>
        </label>
      </div>
      {!defaults.id ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Short key</span>
          <input className={field} maxLength={40} name="sopKey" pattern="[a-z0-9-]{2,40}" placeholder="bm-opening" required />
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">When to use</span>
        <input className={field} defaultValue={defaults.when_to_use} maxLength={200} name="whenToUse" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Purpose</span>
        <input className={field} defaultValue={defaults.purpose} maxLength={300} name="purpose" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Steps (one per line, up to 12)</span>
        <textarea className={`${area} min-h-60`} defaultValue={defaults.steps} maxLength={5000} name="steps" required />
        <span className="mt-1 block text-xs leading-5 text-muted">
          To add a button to an existing app screen, end a line with “ | /app/reviews/rack”. Keep each step short and practical.
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Call the owner when</span>
        <textarea className={`${area} min-h-20`} defaultValue={defaults.escalate_when} maxLength={600} name="escalateWhen" />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Exception update category</span>
          <select className={field} defaultValue={defaults.exception_category ?? "Owner attention needed"} name="exceptionCategory">
            {updateCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Order</span>
          <input className={field} defaultValue={defaults.sort_order ?? 100} max={999} min={0} name="sortOrder" type="number" />
        </label>
        <label className="flex items-center gap-2 pt-7 text-sm font-medium">
          <input defaultChecked={defaults.is_active ?? true} name="isActive" type="checkbox" /> Visible to managers
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save SOP
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
