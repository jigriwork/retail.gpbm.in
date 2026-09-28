"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";

import { ActionMessage } from "@/components/owner/action-message";
import { saveWeeklyReview, type WeeklyReviewActionState } from "@/lib/owner/weekly-review-actions";

const initialState: WeeklyReviewActionState = { ok: false, message: "" };
const area = "w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-foreground";

export function WeeklyReviewForm({
  canComplete,
  completed,
  conclusion,
  nextWeekDecisions,
  weekStart,
}: {
  canComplete: boolean;
  completed: boolean;
  conclusion: string;
  nextWeekDecisions: string;
  weekStart: string;
}) {
  const [state, action, pending] = useActionState(saveWeeklyReview, initialState);
  const button = "inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold";

  return (
    <form action={action} className="space-y-4">
      <input name="weekStart" type="hidden" value={weekStart} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Conclusion</span>
        <textarea
          className={`${area} min-h-28`}
          defaultValue={conclusion}
          maxLength={1500}
          name="conclusion"
          placeholder="Three or four sentences: what the week tells us and what we will do about it."
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Decisions for next week</span>
        <textarea
          className={`${area} min-h-20`}
          defaultValue={nextWeekDecisions}
          maxLength={800}
          name="nextWeekDecisions"
          placeholder="One per line. Keep it to the few that matter."
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${button} border border-border bg-card`} disabled={pending} name="intent" value="save">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {completed ? "Update conclusion" : "Save draft"}
        </button>
        {!completed && canComplete ? (
          <button className={`${button} bg-foreground text-background`} disabled={pending} name="intent" value="complete">
            <CheckCircle2 className="size-4" /> Complete review
          </button>
        ) : null}
        {completed ? (
          <button className={`${button} border border-border bg-card`} disabled={pending} name="intent" value="reopen">
            <RotateCcw className="size-4" /> Reopen to refresh evidence
          </button>
        ) : null}
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
