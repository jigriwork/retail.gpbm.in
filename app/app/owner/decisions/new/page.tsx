import { AccessDenied } from "@/components/app/access-denied";
import { DecisionForm } from "@/components/owner/decision-form";
import { OwnerToolsNav, PageHeader } from "@/components/owner/owner-tools-nav";
import { requireOwner } from "@/lib/auth/session";
import { getDecisionFormOptions, getFollowupForDecision } from "@/lib/owner/decisions";
import { getOpenTaskChoices } from "@/lib/owner/followups";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

export default async function NewDecisionPage({ searchParams }: { searchParams: Promise<{ followup?: string }> }) {
  if (!(await requireOwner())) return <AccessDenied message="The decision log is shared between active owners only." />;
  const { followup: followupId } = await searchParams;
  const [options, tasks, followup] = await Promise.all([
    getDecisionFormOptions(),
    getOpenTaskChoices(),
    getFollowupForDecision(followupId ?? ""),
  ]);
  const today = getIndiaToday();

  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/owner/decisions" />
      <PageHeader
        description="Keep it small and testable: one change, one responsible person, one measure, one review date."
        eyebrow="Decision log"
        title="New decision"
      />
      {followup ? (
        <section className="rounded-2xl border border-border bg-card p-4 text-sm leading-6">
          <p className="font-semibold">From recommendation: {followup.title}</p>
          {followup.evidence_text ? <p className="mt-1 text-muted">{followup.evidence_text}</p> : null}
        </section>
      ) : null}
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <DecisionForm
          defaults={{
            hypothesis: followup?.evidence_text ? `Because: ${followup.evidence_text}`.slice(0, 800) : "",
            review_date: addDays(today, 14),
            start_date: today,
            task_id: followup?.task_id ?? null,
            title: followup?.title ?? "",
          }}
          followupId={followup?.id}
          people={options.people}
          stores={options.stores}
          tasks={tasks}
        />
      </section>
    </div>
  );
}
