import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { OwnerToolsNav } from "@/components/owner/owner-tools-nav";
import { WeeklyReviewForm } from "@/components/owner/weekly-review-form";
import { WeeklyReviewView } from "@/components/owner/weekly-review-view";
import { requireOwner } from "@/lib/auth/session";
import { isoDate, lastCompletedWeekStart, weekLabel, weekStartFor } from "@/lib/owner/phase2-shared";
import { buildWeeklyEvidence, getWeeklyReview, getWeeklyReviewHistory } from "@/lib/owner/weekly-review";
import { readWeeklyEvidence } from "@/lib/owner/weekly-review-rules";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

function dateTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export default async function WeeklyReviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (!(await requireOwner())) return <AccessDenied message="The weekly business review is shared between active owners only." />;

  const today = getIndiaToday();
  const currentWeek = weekStartFor(today);
  const requested = isoDate((await searchParams).week ?? "");
  const weekStart = requested && requested <= currentWeek ? weekStartFor(requested) : lastCompletedWeekStart(today);
  const [{ available, review }, history] = await Promise.all([getWeeklyReview(weekStart), getWeeklyReviewHistory()]);

  if (!available) {
    return (
      <div className="space-y-5">
        <OwnerToolsNav active="/app/owner/review" />
        <p className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">Apply the Phase 2 migration to use weekly reviews.</p>
      </div>
    );
  }

  const completed = review?.status === "completed";
  const storedEvidence = completed ? readWeeklyEvidence(review?.evidence) : null;
  const evidence = storedEvidence ?? (await buildWeeklyEvidence(weekStart));
  const inProgress = weekStart >= currentWeek;
  const reviewer = review?.completed_profile?.full_name ?? review?.completed_profile?.email;

  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/owner/review" />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted">Weekly business review · owners only</p>
          <div className="flex items-center gap-1">
            <Link aria-label="Previous week" className="inline-flex size-9 items-center justify-center rounded-xl border border-border" href={`/app/owner/review?week=${addDays(weekStart, -7)}`}>
              <ChevronLeft className="size-4" />
            </Link>
            {weekStart < currentWeek ? (
              <Link aria-label="Next week" className="inline-flex size-9 items-center justify-center rounded-xl border border-border" href={`/app/owner/review?week=${addDays(weekStart, 7)}`}>
                <ChevronRight className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
        <h1 className="mt-2 text-3xl font-semibold">Week {weekLabel(weekStart)}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-full border px-2 py-0.5 ${completed ? "border-success/40 text-success" : "border-warning/50 text-warning"}`}>
            {completed ? `Completed${reviewer ? ` by ${reviewer}` : ""}` : review ? "Draft" : "Not reviewed yet"}
          </span>
          {inProgress ? <span className="rounded-full border border-border px-2 py-0.5 text-muted">Week in progress</span> : null}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          Evidence period {weekLabel(weekStart)} (Monday–Sunday, India time).{" "}
          {completed
            ? `Evidence frozen as generated on ${dateTime(review?.evidence_generated_at)}.`
            : `Live evidence generated ${dateTime(evidence?.generatedAt)}; saving stores this snapshot.`}
        </p>
      </section>

      {evidence ? <WeeklyReviewView evidence={evidence} /> : null}

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold">Owner conclusion</h2>
        <p className="mb-4 text-xs text-muted">
          {review?.updated_profile ? `Last edited by ${review.updated_profile.full_name ?? review.updated_profile.email} on ${dateTime(review.updated_at)}.` : "Shared with the other owner."}
        </p>
        <WeeklyReviewForm
          canComplete={!inProgress}
          completed={completed}
          conclusion={review?.conclusion ?? ""}
          nextWeekDecisions={review?.next_week_decisions ?? ""}
          weekStart={weekStart}
        />
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold">Past reviews</h2>
        {history.length ? (
          <ul className="divide-y divide-border">
            {history.map((item) => (
              <li className="py-3" key={item.id}>
                <Link className="flex flex-wrap items-center justify-between gap-2" href={`/app/owner/review?week=${item.week_start}`}>
                  <span className="font-semibold">{weekLabel(item.week_start)}</span>
                  <span className="text-xs text-muted">{item.status === "completed" ? "Completed" : "Draft"}</span>
                </Link>
                {item.conclusion ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{item.conclusion}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No saved reviews yet.</p>
        )}
      </section>
    </div>
  );
}
