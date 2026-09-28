"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, CheckSquare, FlaskConical, Link2, Loader2, MessageSquareOff, NotebookPen } from "lucide-react";

import { ActionMessage } from "@/components/owner/action-message";
import { recordPriorityFollowup, type FollowupActionState } from "@/lib/owner/followup-actions";

const initialState: FollowupActionState = { ok: false, message: "" };
const button =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50";
const input = "h-9 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-xs outline-none focus:border-foreground";

export type TaskChoice = { id: string; title: string; store: string; due_date: string | null };

export function PriorityFollowup({ priorityId, tasks }: { priorityId: string; tasks: TaskChoice[] }) {
  const [state, action, pending] = useActionState(recordPriorityFollowup, initialState);
  const hidden = <input name="priorityId" type="hidden" value={priorityId} />;
  const icon = (Icon: typeof Check) => (pending ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />);

  return (
    <details className="mt-3 rounded-xl border border-border bg-card/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold">Follow up</summary>
      <p className="mt-2 text-xs leading-5 text-muted">
        Nothing is created or changed automatically. Your choice is shared with the other owner and remembered.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={action}>
          {hidden}
          <button className={button} disabled={pending} name="intent" value="accept">{icon(Check)}Accept</button>
        </form>
        <form action={action}>
          {hidden}
          <button className={button} disabled={pending} name="intent" value="create_task">{icon(CheckSquare)}Create one task</button>
        </form>
        <form action={action}>
          {hidden}
          <button className={button} disabled={pending} name="intent" value="decision">{icon(FlaskConical)}Test as decision</button>
        </form>
      </div>
      <form action={action} className="mt-2 flex gap-2">
        {hidden}
        <input name="intent" type="hidden" value="link_task" />
        <select aria-label="Existing task" className={input} defaultValue="" name="taskId" required>
          <option disabled value="">Link to an existing task…</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title.slice(0, 60)} · {task.store}
            </option>
          ))}
        </select>
        <button aria-label="Link task" className={button} disabled={pending}>{icon(Link2)}Link</button>
      </form>
      <form action={action} className="mt-2 flex gap-2">
        {hidden}
        <input name="intent" type="hidden" value="dismiss" />
        <input aria-label="Reason for dismissing" className={input} maxLength={600} name="reason" placeholder="Dismiss because…" required />
        <button className={button} disabled={pending}>{icon(MessageSquareOff)}Dismiss</button>
      </form>
      <form action={action} className="mt-2 flex gap-2">
        {hidden}
        <input name="intent" type="hidden" value="review" />
        <input aria-label="Outcome" className={input} maxLength={600} name="outcome" placeholder="Outcome after acting…" required />
        <button className={button} disabled={pending}>{icon(NotebookPen)}Reviewed</button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ActionMessage state={state} />
        {state.ok && state.taskId ? (
          <Link className="text-xs font-semibold underline" href={`/app/tasks/${state.taskId}`}>Open task</Link>
        ) : null}
      </div>
    </details>
  );
}
