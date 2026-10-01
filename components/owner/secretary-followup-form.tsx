"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { ActionMessage } from "@/components/owner/action-message";
import type { TaskChoice } from "@/components/owner/priority-followup";
import { recordSecretaryFollowup, type FollowupActionState } from "@/lib/owner/followup-actions";

const initialState: FollowupActionState = { ok: false, message: "" };
const field = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary";
const button = "inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold";

export function SecretaryFollowupForm({
  chatId,
  excerpt,
  tasks,
  title,
}: {
  chatId: string;
  excerpt: string;
  tasks: TaskChoice[];
  title: string;
}) {
  const [state, action, pending] = useActionState(recordSecretaryFollowup, initialState);

  return (
    <form action={action} className="space-y-4">
      <input name="chatId" type="hidden" value={chatId} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Short title</span>
        <input className={field} defaultValue={title} maxLength={160} name="title" required />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Shared excerpt</span>
        <textarea className="min-h-28 w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-primary" defaultValue={excerpt} maxLength={1500} name="excerpt" />
        <span className="mt-1 block text-xs leading-5 text-muted">
          Only this excerpt is shared with the other owner. Your Secretary chat history stays private.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={pending} name="intent" value="accept">Accept</button>
        <button className={button} disabled={pending} name="intent" value="create_task">Create one task</button>
        <button className={button} disabled={pending} name="intent" value="decision">Test as decision</button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select aria-label="Existing task" className={field} defaultValue="" name="taskId">
          <option value="">Link to an existing task…</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title.slice(0, 70)} · {task.store}</option>)}
        </select>
        <button className={button} disabled={pending} name="intent" value="link_task">Link task</button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label="Reason for dismissing" className={field} maxLength={600} name="reason" placeholder="Dismiss because…" />
        <button className={button} disabled={pending} name="intent" value="dismiss">Dismiss</button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label="Outcome" className={field} maxLength={600} name="outcome" placeholder="Outcome after acting…" />
        <button className={button} disabled={pending} name="intent" value="review">Mark reviewed</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        <ActionMessage state={state} />
        {state.ok && state.taskId ? <Link className="text-sm font-semibold underline" href={`/app/tasks/${state.taskId}`}>Open task</Link> : null}
      </div>
    </form>
  );
}
