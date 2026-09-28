import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { DecisionEvidencePanel } from "@/components/owner/decision-evidence";
import { DecisionForm } from "@/components/owner/decision-form";
import { DecisionLearningForm, DecisionReviewForm, DecisionStatusButtons } from "@/components/owner/decision-review";
import { OwnerToolsNav } from "@/components/owner/owner-tools-nav";
import { requireOwner } from "@/lib/auth/session";
import { getDecision, getDecisionFormOptions, previewDecisionEvidence, readEvidence } from "@/lib/owner/decisions";
import { getOpenTaskChoices } from "@/lib/owner/followups";
import { causationNote, decisionKinds, decisionResults, formatPercent, labelFor, measureTypes, shortDate, verdictLabels } from "@/lib/owner/phase2-shared";
import { getIndiaToday } from "@/lib/tasks/dates";

const statusLabels: Record<string, string> = { active: "Running", cancelled: "Cancelled", planned: "Planned", reviewed: "Reviewed" };

export default async function DecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ decisionId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  if (!(await requireOwner())) return <AccessDenied message="The decision log is shared between active owners only." />;
  const [{ decisionId }, { saved }] = await Promise.all([params, searchParams]);
  const decision = await getDecision(decisionId);
  if (!decision) notFound();

  const open = decision.status === "planned" || decision.status === "active";
  const [options, tasks, preview] = await Promise.all([
    open || decision.status === "cancelled" ? getDecisionFormOptions() : Promise.resolve({ people: [], stores: [] }),
    open || decision.status === "cancelled" ? getOpenTaskChoices() : Promise.resolve([]),
    open ? previewDecisionEvidence(decision.id) : Promise.resolve(null),
  ]);
  const taskChoices =
    decision.task && !tasks.some((task) => task.id === decision.task?.id)
      ? [{ due_date: null, id: decision.task.id, store: "linked", title: decision.task.title }, ...tasks]
      : tasks;
  const saved_evidence = readEvidence(decision.evidence);
  const responsible = decision.responsible?.full_name ?? decision.responsible?.email ?? decision.responsible_name;
  const due = open && decision.review_date <= getIndiaToday();

  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/owner/decisions" />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">{statusLabels[decision.status] ?? decision.status}</span>
          {due ? <span className="rounded-full border border-warning/50 px-2 py-0.5 text-xs font-bold text-warning">DUE FOR REVIEW</span> : null}
          {saved ? <span className="text-xs font-semibold text-success">Saved.</span> : null}
        </div>
        <h1 className="mt-3 text-3xl font-semibold">{decision.title}</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-semibold text-muted">Type · store</dt><dd>{labelFor(decisionKinds, decision.kind)} · {decision.store?.name ?? "Both stores"}{decision.brand ? ` · ${decision.brand}` : ""}</dd></div>
          <div><dt className="text-xs font-semibold text-muted">Responsible</dt><dd>{responsible || "—"}</dd></div>
          <div><dt className="text-xs font-semibold text-muted">Dates</dt><dd>{shortDate(decision.start_date)} → review {shortDate(decision.review_date)}</dd></div>
          <div><dt className="text-xs font-semibold text-muted">Measured by</dt><dd>{labelFor(measureTypes, decision.measure_type)}{decision.measure_filter ? `: ${decision.measure_filter}` : ""}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted">Why</dt><dd className="leading-6">{decision.hypothesis}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted">Success looks like</dt><dd className="leading-6">{decision.success_measure}</dd></div>
          {decision.task ? (
            <div><dt className="text-xs font-semibold text-muted">Linked task</dt><dd><Link className="underline" href={`/app/tasks/${decision.task.id}`}>{decision.task.title}</Link> ({decision.task.status})</dd></div>
          ) : null}
          {decision.followup ? (
            <div><dt className="text-xs font-semibold text-muted">From recommendation</dt><dd>{decision.followup.title}</dd></div>
          ) : null}
        </dl>
        <div className="mt-4"><DecisionStatusButtons decisionId={decision.id} status={decision.status} /></div>
      </section>

      {decision.status === "reviewed" ? (
        <section className="space-y-4 rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Owner&apos;s judgement: {labelFor(decisionResults, decision.result)}</h2>
          <p className="text-sm leading-6">
            <span className="font-semibold">Measured sales: </span>
            {decision.evidence_basis === "observation"
              ? "Not measured — this decision was judged by owner observation, not sales data."
              : `${verdictLabels[saved_evidence?.verdict ?? ""] ?? "Not available"}${
                  saved_evidence?.change_ratio !== null && saved_evidence?.change_ratio !== undefined ? ` (${formatPercent(saved_evidence.change_ratio)})` : ""
                }. ${causationNote}`}
          </p>
          <p className="text-xs text-muted">Reviewed {shortDate(decision.reviewed_at)}. Measured sales below are frozen as they were at review.</p>
          {decision.result_note ? <p className="text-sm leading-6"><span className="font-semibold">What the owner saw: </span>{decision.result_note}</p> : null}
          <DecisionEvidencePanel evidence={saved_evidence} title="Measured sales at review"
          />
          <div>
            <h3 className="mb-2 text-sm font-semibold">What we learned</h3>
            <DecisionLearningForm decisionId={decision.id} learned={decision.learned} />
          </div>
        </section>
      ) : null}

      {open ? (
        <section className="space-y-4 rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xl font-semibold">{due ? "Review this decision" : "Evidence so far"}</h2>
          <DecisionEvidencePanel evidence={preview} title="Measured sales so far" />
          {due || decision.status === "active" ? (
            <DecisionReviewForm
              basis={decision.measure_type === "observation" ? "observation" : "data"}
              decisionId={decision.id}
              verdict={preview?.verdict ?? "insufficient_data"}
            />
          ) : (
            <p className="text-sm text-muted">Start the decision to record a review.</p>
          )}
        </section>
      ) : null}

      {open || decision.status === "cancelled" ? (
        <details className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold">Edit details</summary>
          <div className="mt-4">
            <DecisionForm defaults={decision} people={options.people} stores={options.stores} tasks={taskChoices} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
