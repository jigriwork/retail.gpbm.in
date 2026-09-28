import Link from "next/link";
import { Plus } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { OwnerToolsNav, PageHeader } from "@/components/owner/owner-tools-nav";
import { requireOwner } from "@/lib/auth/session";
import { getDecisions, groupDecisions, type BusinessDecision } from "@/lib/owner/decisions";
import { decisionKinds, decisionResults, labelFor, shortDate } from "@/lib/owner/phase2-shared";

function DecisionRow({ decision }: { decision: BusinessDecision }) {
  const responsible = decision.responsible?.full_name ?? decision.responsible?.email ?? decision.responsible_name;
  return (
    <Link className="block rounded-2xl border border-border bg-background p-4 transition hover:border-foreground" href={`/app/owner/decisions/${decision.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">{decision.title}</p>
        {decision.result ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
            Judged: {labelFor(decisionResults, decision.result)}
            {decision.evidence_basis === "observation" ? " · not measured" : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted">
        {labelFor(decisionKinds, decision.kind)} · {decision.store?.name ?? "Both stores"}
        {decision.brand ? ` · ${decision.brand}` : ""} · {responsible || "No owner set"}
      </p>
      <p className="mt-2 text-xs font-semibold text-muted">
        {shortDate(decision.start_date)} → review {shortDate(decision.review_date)}
      </p>
      {decision.learned ? <p className="mt-2 text-sm leading-6 text-muted">Learned: {decision.learned}</p> : null}
    </Link>
  );
}

function Group({ decisions, empty, title }: { decisions: BusinessDecision[]; empty: string; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">{decisions.length}</span>
      </div>
      {decisions.length ? (
        <div className="grid gap-3 lg:grid-cols-2">{decisions.map((decision) => <DecisionRow decision={decision} key={decision.id} />)}</div>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}

export default async function DecisionsPage() {
  if (!(await requireOwner())) return <AccessDenied message="The decision log is shared between active owners only." />;
  const { available, decisions } = await getDecisions();
  const groups = groupDecisions(decisions);

  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/owner/decisions" />
      <PageHeader
        description="Ideas you are trying in the stores, who is responsible, how you will know if it worked, and what you learned. Shared by both owners; managers cannot see it."
        eyebrow="Owners only"
        title="Decision log"
      />
      {!available ? (
        <p className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">Apply the Phase 2 migration to use the decision log.</p>
      ) : (
        <>
          <Link className="inline-flex h-11 items-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background" href="/app/owner/decisions/new">
            <Plus className="size-4" /> New decision
          </Link>
          <Group decisions={groups.dueForReview} empty="Nothing is due for review." title="Due for review" />
          <Group decisions={groups.running} empty="No decision is running." title="Running" />
          <Group decisions={groups.planned} empty="No planned decisions." title="Planned" />
          <Group decisions={groups.reviewed.slice(0, 20)} empty="No reviewed decisions yet." title="Reviewed" />
          {groups.cancelled.length ? (
            <details className="rounded-[1.35rem] border border-border bg-card p-5">
              <summary className="cursor-pointer text-sm font-semibold text-muted">Cancelled ({groups.cancelled.length})</summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">{groups.cancelled.map((decision) => <DecisionRow decision={decision} key={decision.id} />)}</div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
