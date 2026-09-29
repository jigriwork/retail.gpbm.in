import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Clock3, ListTodo, Mic, UploadCloud } from "lucide-react";

import { PriorityFollowup, type TaskChoice } from "@/components/owner/priority-followup";
import type { AssessedPriority } from "@/lib/owner/followups";
import type { DailyPriority } from "@/lib/owner/priorities";
import type { StoreSalesStatus } from "@/lib/reports/sales-queries";
import type { TaskWithRelations } from "@/lib/tasks/queries";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

function displayDate(date?: string | null) {
  if (!date) return "No date";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(`${date}T00:00:00+05:30`),
  );
}

export function DailyPriorities({
  handled = [],
  priorities,
  tasks = [],
}: {
  handled?: AssessedPriority[];
  priorities: Array<DailyPriority | AssessedPriority>;
  tasks?: TaskChoice[];
}) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">
            Today&apos;s priorities
            {priorities.length ? <span className="ml-2 align-middle text-sm font-semibold text-muted">{priorities.length}</span> : null}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">Only evidence-backed exceptions, capped at five.</p>
        </div>
        <ListTodo className="size-5 shrink-0 text-muted" />
      </div>

      {priorities.length ? (
        <div className="mt-4 space-y-3">
          {priorities.map((priority, index) => {
            const followup = "followup" in priority ? priority.followup : null;
            // Title and evidence stay visible; the action detail opens on tap so all
            // five priorities fit on a phone screen. The first one starts open.
            return (
              <details
                className="group rounded-2xl border border-border bg-background p-3 sm:p-4"
                key={priority.id}
                open={index === 0}
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background sm:size-8">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold leading-6">{priority.title}</span>
                      {priority.uncertain ? (
                        <span className="rounded-full border border-warning/50 px-2 py-0.5 text-[0.65rem] font-bold text-warning">UNCERTAIN</span>
                      ) : null}
                      {followup?.kind === "raised_again" ? (
                        <span className="rounded-full border border-danger/40 px-2 py-0.5 text-[0.65rem] font-bold text-danger">RAISED AGAIN</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm leading-6 text-muted">{priority.evidence}</span>
                  </span>
                  <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition group-open:rotate-180" />
                </summary>
                <div className="mt-2 pl-10 sm:pl-11">
                  {followup?.kind === "raised_again" ? (
                    <p className="mb-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs leading-5">{followup.explanation}</p>
                  ) : null}
                  <p className="text-xs font-semibold text-muted">What happened · {priority.evidenceDate}</p>
                  <p className="mt-2 text-sm leading-6"><span className="font-semibold">Do:</span> {priority.action}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                    <span>Who: {priority.owner}</span>
                    <span>Confidence: {priority.confidence}</span>
                    <span>Check: {priority.review}</span>
                  </div>
                  <Link className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline" href={priority.href}>
                    Open <ChevronRight className="size-3.5" />
                  </Link>
                  {followup ? <PriorityFollowup priorityId={priority.id} tasks={tasks} /> : null}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-border bg-background p-4">
          <p className="font-semibold">{handled.length ? "Every current exception is already being handled." : "No urgent exception found."}</p>
          <p className="mt-1 text-sm leading-6 text-muted">Keep daily uploads and manager routines current.</p>
        </div>
      )}

      {handled.length ? (
        <details className="mt-4 rounded-2xl border border-border p-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">
            {handled.length} already handled — not repeated today
          </summary>
          <ul className="mt-3 space-y-2">
            {handled.map((priority) => (
              <li className="text-sm leading-6" key={priority.id}>
                <span className="font-semibold">{priority.title}.</span>{" "}
                <span className="text-muted">{priority.followup.kind === "handled" ? priority.followup.explanation : ""}</span>
              </li>
            ))}
          </ul>
          <Link className="mt-2 inline-block text-xs font-semibold underline" href="/app/owner/follow-ups">Follow-up history</Link>
        </details>
      ) : null}
    </section>
  );
}

export function SalesFreshness({ statuses }: { statuses: StoreSalesStatus[] }) {
  const expectedDate = addDays(getIndiaToday(), -1);

  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">Sales uploads</h2>
        <UploadCloud className="size-5 text-muted" />
      </div>
      <p className="mt-1 text-sm leading-6 text-muted">Current means {displayDate(expectedDate)} (last closed day) is uploaded.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-3">
        {statuses.map((status) => {
          const latest = status.latestReport?.report_date ?? null;
          const current = Boolean(latest && latest >= expectedDate);
          return (
            <Link className="rounded-2xl border border-border bg-background p-3 sm:p-4" href={`/app/reports/sales?storeId=${status.store.id}`} key={status.store.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{status.store.name}</p>
                <span className={current ? "rounded-full border border-success/40 px-2 py-1 text-xs font-semibold text-success" : "rounded-full border border-danger/40 px-2 py-1 text-xs font-semibold text-danger"}>
                  {current ? "Current" : "Behind"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">Latest sales date: {displayDate(latest)}</p>
              <p className="mt-1 text-xs text-muted">Uploaded: {status.latestReport?.created_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(status.latestReport.created_at)) : "Not available"}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TaskList({ empty, tasks }: { empty: string; tasks: TaskWithRelations[] }) {
  return tasks.length ? (
    <div className="space-y-2">
      {tasks.slice(0, 4).map((task) => (
        <Link className="block rounded-xl border border-border bg-background px-3 py-2" href={`/app/tasks/${task.id}`} key={task.id}>
          <p className="truncate text-sm font-semibold">{task.title}</p>
          <p className="mt-1 text-xs text-muted">{task.stores?.name ?? "Owner"} · {displayDate(task.due_date)}</p>
        </Link>
      ))}
    </div>
  ) : <p className="text-sm text-muted">{empty}</p>;
}

export function OwnerTaskWorkboard({
  workboard,
}: {
  workboard: {
    dueToday: TaskWithRelations[];
    overdue: TaskWithRelations[];
    recentlyCompleted: TaskWithRelations[];
    waiting: TaskWithRelations[];
  };
}) {
  const groups = [
    { icon: AlertTriangle, label: "Overdue", tasks: workboard.overdue, empty: "No overdue work." },
    { icon: CalendarClock, label: "Due today", tasks: workboard.dueToday, empty: "Nothing due today." },
    { icon: Clock3, label: "Waiting", tasks: workboard.waiting, empty: "Nothing waiting." },
    { icon: CheckCircle2, label: "Recently done", tasks: workboard.recentlyCompleted, empty: "No recent completion." },
  ];
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Store &amp; team tasks</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Tasks for stores and managers, by status.</p>
        </div>
        <Link className="shrink-0 text-xs font-semibold text-muted" href="/app/tasks">All tasks</Link>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3">
        {groups.map(({ empty, icon: Icon, label, tasks }) => (
          <div className="rounded-2xl border border-border p-3 sm:p-4" key={label}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 font-semibold"><Icon className="size-4 text-muted" />{label}</p>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">{tasks.length}</span>
            </div>
            <TaskList empty={empty} tasks={tasks} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SecretaryShortcut() {
  return (
    <Link
      className="flex items-center gap-3 rounded-[1.35rem] border border-border bg-foreground p-4 text-background shadow-sm"
      href="/app/secretary"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-background text-foreground">
        <Mic className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Talk to Tia</span>
        <span className="block text-sm leading-5 text-background/70">Your secretary — ask, tick off to-dos, in English or Hindi.</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-background/70" />
    </Link>
  );
}
