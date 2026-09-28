"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { ActionMessage } from "@/components/owner/action-message";
import { saveDecision, type DecisionActionState } from "@/lib/owner/decision-actions";
import { decisionKinds, measureTypes } from "@/lib/owner/phase2-shared";

const initialState: DecisionActionState = { ok: false, message: "" };
const field = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground";
const area = "min-h-20 w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-foreground";

export type DecisionFormValues = {
  brand?: string | null;
  hypothesis?: string;
  id?: string;
  kind?: string;
  measure_filter?: string | null;
  measure_type?: string;
  responsible_name?: string;
  responsible_profile_id?: string | null;
  review_date?: string;
  start_date?: string;
  status?: string;
  store_id?: string | null;
  success_measure?: string;
  task_id?: string | null;
  title?: string;
};

function Label({ children, hint, text }: { children: React.ReactNode; hint?: string; text: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{text}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs leading-5 text-muted">{hint}</span> : null}
    </label>
  );
}

export function DecisionForm({
  defaults,
  followupId,
  people,
  stores,
  tasks,
}: {
  defaults: DecisionFormValues;
  followupId?: string;
  people: Array<{ id: string; full_name: string | null; email: string | null; role: string }>;
  stores: Array<{ id: string; name: string; code: string }>;
  tasks: Array<{ id: string; title: string; store: string }>;
}) {
  const [state, action, pending] = useActionState(saveDecision, initialState);
  const [measure, setMeasure] = useState(defaults.measure_type ?? "store_net_sales");
  const needsFilter = measure === "brand_net_sales" || measure === "category_net_sales";

  return (
    <form action={action} className="space-y-4">
      {defaults.id ? <input name="decisionId" type="hidden" value={defaults.id} /> : null}
      {followupId ? <input name="followupId" type="hidden" value={followupId} /> : null}

      <Label text="Idea or decision">
        <input className={field} defaultValue={defaults.title} maxLength={140} name="title" placeholder="Move one senior salesperson to the trial-room zone from 5 to 9 pm" required />
      </Label>

      <div className="grid gap-4 sm:grid-cols-3">
        <Label text="Type">
          <select className={field} defaultValue={defaults.kind ?? "display"} name="kind">
            {decisionKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </Label>
        <Label text="Store">
          <select className={field} defaultValue={defaults.store_id ?? ""} name="storeId">
            <option value="">Both stores</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </Label>
        <Label text="Brand (optional)">
          <input className={field} defaultValue={defaults.brand ?? ""} maxLength={80} name="brand" placeholder="e.g. MITTY" />
        </Label>
      </div>

      <Label hint="Why do you expect this to help? One or two sentences." text="Reason / hypothesis">
        <textarea className={area} defaultValue={defaults.hypothesis} maxLength={800} name="hypothesis" required />
      </Label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Label text="Responsible person">
          <select className={field} defaultValue={defaults.responsible_profile_id ?? ""} name="responsibleProfileId">
            <option value="">Not an app user (type below)</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name ?? person.email} · {person.role}
              </option>
            ))}
          </select>
        </Label>
        <Label hint="For staff without an app account." text="…or name">
          <input className={field} defaultValue={defaults.responsible_name} maxLength={80} name="responsibleName" />
        </Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Label text="Start date">
          <input className={field} defaultValue={defaults.start_date} name="startDate" required type="date" />
        </Label>
        <Label hint="At least 7 days after start to judge sales." text="Review date">
          <input className={field} defaultValue={defaults.review_date} name="reviewDate" required type="date" />
        </Label>
        <Label text="Status">
          <select className={field} defaultValue={defaults.status ?? "planned"} name="status">
            <option value="planned">Planned</option>
            <option value="active">Running</option>
            {defaults.id ? <option value="cancelled">Cancelled</option> : null}
          </select>
        </Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Label hint="Sales measures compare the trial days with the same number of days just before the start." text="Measured by">
          <select className={field} name="measureType" onChange={(event) => setMeasure(event.target.value)} value={measure}>
            {measureTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Label>
        {needsFilter ? (
          <Label hint="Must match the name used in the sales upload." text={measure === "brand_net_sales" ? "Brand name" : "Category name"}>
            <input className={field} defaultValue={defaults.measure_filter ?? ""} maxLength={80} name="measureFilter" required />
          </Label>
        ) : (
          <input name="measureFilter" type="hidden" value="" />
        )}
      </div>

      <Label hint="What result would make you keep it? e.g. “Average bill up at least 10% on weekday evenings.”" text="Success measure">
        <input className={field} defaultValue={defaults.success_measure} maxLength={400} name="successMeasure" required />
      </Label>

      <Label hint="Linking does not create a task." text="Link an existing task (optional)">
        <select className={field} defaultValue={defaults.task_id ?? ""} name="taskId">
          <option value="">No linked task</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title.slice(0, 70)} · {task.store}</option>)}
        </select>
      </Label>

      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex h-11 items-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {defaults.id ? "Save changes" : "Save decision"}
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
