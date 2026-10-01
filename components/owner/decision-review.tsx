"use client";

import { useActionState } from "react";
import { Loader2, Play, Save, XCircle } from "lucide-react";

import { ActionMessage } from "@/components/owner/action-message";
import {
  reviewDecision,
  setDecisionStatus,
  updateDecisionLearning,
  type DecisionActionState,
} from "@/lib/owner/decision-actions";
import { decisionResults } from "@/lib/owner/phase2-shared";

const initialState: DecisionActionState = { ok: false, message: "" };
const area = "min-h-20 w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-primary";

export function DecisionReviewForm({
  basis,
  decisionId,
  verdict,
}: {
  basis: "data" | "observation";
  decisionId: string;
  verdict: string;
}) {
  const [state, action, pending] = useActionState(reviewDecision, initialState);
  const workedAllowed = basis === "observation" || verdict === "improved";

  return (
    <form action={action} className="space-y-4">
      <input name="decisionId" type="hidden" value={decisionId} />
      <fieldset>
        <legend className="text-sm font-medium">Your judgement</legend>
        <p className="mb-2 mt-1 text-xs leading-5 text-muted">
          What you believe happened. It is saved as the owner&apos;s judgement, separate from the measured sales above.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {decisionResults.map((result) => {
            const disabled = result.value === "worked" && !workedAllowed;
            return (
              <label
                className={`flex items-start gap-2 rounded-xl border border-border p-3 text-sm ${disabled ? "opacity-50" : ""}`}
                key={result.value}
              >
                <input className="mt-1" disabled={disabled} name="result" required type="radio" value={result.value} />
                <span>
                  <span className="font-semibold">{result.label}</span>
                  {disabled ? (
                    <span className="block text-xs leading-5 text-muted">
                      Not available: measured sales did not clearly improve. Record mixed or inconclusive and explain in the note.
                    </span>
                  ) : null}
                  {result.value === "worked" && basis === "observation" ? (
                    <span className="block text-xs leading-5 text-muted">Needs a written observation below.</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{basis === "observation" ? "What you observed" : "What you believe happened"}</span>
        <textarea className={area} maxLength={1000} name="resultNote" placeholder="What actually happened, in plain words." />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">What we learned</span>
        <textarea className={area} maxLength={1000} name="learned" placeholder="Keep, change or stop — and why." />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Record review
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function DecisionStatusButtons({ decisionId, status }: { decisionId: string; status: string }) {
  const [state, action, pending] = useActionState(setDecisionStatus, initialState);
  const button = "inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "planned" ? (
        <form action={action}>
          <input name="decisionId" type="hidden" value={decisionId} />
          <button className={button} disabled={pending} name="status" value="active">
            <Play className="size-4" /> Start now
          </button>
        </form>
      ) : null}
      {status === "planned" || status === "active" ? (
        <form action={action}>
          <input name="decisionId" type="hidden" value={decisionId} />
          <button className={button} disabled={pending} name="status" value="cancelled">
            <XCircle className="size-4" /> Cancel decision
          </button>
        </form>
      ) : null}
      {status === "cancelled" ? (
        <form action={action}>
          <input name="decisionId" type="hidden" value={decisionId} />
          <button className={button} disabled={pending} name="status" value="planned">Restore to planned</button>
        </form>
      ) : null}
      <ActionMessage state={state} />
    </div>
  );
}

export function DecisionLearningForm({ decisionId, learned }: { decisionId: string; learned: string }) {
  const [state, action, pending] = useActionState(updateDecisionLearning, initialState);
  return (
    <form action={action} className="space-y-3">
      <input name="decisionId" type="hidden" value={decisionId} />
      <textarea className={area} defaultValue={learned} maxLength={1000} name="learned" />
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Update lesson
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
