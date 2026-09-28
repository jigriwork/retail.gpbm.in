import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { OwnerToolsNav, PageHeader } from "@/components/owner/owner-tools-nav";
import { requireOwner } from "@/lib/auth/session";
import { getRecommendationFollowups } from "@/lib/owner/followups";
import { followupStatusLabels, shortDate } from "@/lib/owner/phase2-shared";

export default async function FollowupsPage() {
  if (!(await requireOwner())) return <AccessDenied message="Recommendation follow-ups are shared between active owners only." />;
  const { available, records } = await getRecommendationFollowups({ limit: 120 });

  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/owner/follow-ups" />
      <PageHeader
        description="What was done with each daily priority and Secretary recommendation. A dismissed or reviewed item returns only if its evidence changes materially or 14 days pass."
        eyebrow="Owners only"
        title="Recommendation follow-ups"
      />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {!available ? (
          <p className="text-sm">Apply the Phase 2 migration to record follow-ups.</p>
        ) : records.length ? (
          <ul className="divide-y divide-border">
            {records.map((record) => (
              <li className="py-3" key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">{record.title}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                    {followupStatusLabels[record.status] ?? record.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {record.source === "secretary" ? "Secretary recommendation" : "Daily priority"} · {shortDate(record.created_at)}
                </p>
                {record.reason ? <p className="mt-1 text-sm">Reason: {record.reason}</p> : null}
                {record.outcome ? <p className="mt-1 text-sm">Outcome: {record.outcome}</p> : null}
                {record.evidence_text ? <p className="mt-1 text-xs leading-5 text-muted">Evidence then: {record.evidence_text}</p> : null}
                <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
                  {record.task ? <Link className="underline" href={`/app/tasks/${record.task.id}`}>Task: {record.task.title} ({record.task.status})</Link> : null}
                  {record.decision ? <Link className="underline" href={`/app/owner/decisions/${record.decision.id}`}>Decision: {record.decision.title}</Link> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No follow-ups recorded yet. Use “Follow up” on a priority in Today or on a Secretary answer.</p>
        )}
      </section>
    </div>
  );
}
