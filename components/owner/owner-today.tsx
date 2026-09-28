import Link from "next/link";
import { AlertTriangle, Bot, CalendarClock, CheckCircle2, ChevronRight, Clock3, ListTodo, UploadCloud } from "lucide-react";

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
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Start here</p>
          <h2 className="mt-2 text-2xl font-semibold">Today&apos;s priorities</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Only evidence-backed exceptions, capped at five.
            <span className="block sm:hidden"> Swipe to review each priority.</span>
          </p>
        </div>
        <ListTodo className="size-5 shrink-0 text-muted" />
      </div>

      {priorities.length ? (
        <div className="mt-5 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2 sm:block sm:space-y-3 sm:overflow-visible sm:pb-0">
          {priorities.map((priority, index) => {
            const followup = "followup" in priority ? priority.followup : null;
            return (
              <article
                className="block w-[88%] shrink-0 snap-start rounded-2xl border border-border bg-background p-4 sm:w-auto"
                key={priority.id}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">
                        <Link className="hover:underline" href={priority.href}>{priority.title}</Link>
                      </h3>
                      {priority.uncertain ? (
                        <span className="rounded-full border border-warning/50 px-2 py-0.5 text-[0.65rem] font-bold text-warning">UNCERTAIN</span>
                      ) : null}
                      {followup?.kind === "raised_again" ? (
                        <span className="rounded-full border border-danger/40 px-2 py-0.5 text-[0.65rem] font-bold text-danger">RAISED AGAIN</span>
                      ) : null}
                    </div>
                    {followup?.kind === "raised_again" ? (
                      <p className="mt-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs leading-5">{followup.explanation}</p>
                    ) : null}
                    <p className="mt-2 text-xs font-semibold text-muted">What happened · {priority.evidenceDate}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{priority.evidence}</p>
                    <p className="mt-3 text-sm leading-6"><span className="font-semibold">Do:</span> {priority.action}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                      <span>Who: {priority.owner}</span>
                      <span>Confidence: {priority.confidence}</span>
                      <span>Check: {priority.review}</span>
                    </div>
                    {followup ? <PriorityFollowup priorityId={priority.id} tasks={tasks} /> : null}
                  </div>
                  <Link aria-label={`Open ${priority.title}`} className="shrink-0" href={priority.href}>
                    <ChevronRight className="size-4 text-muted" />
                  </Link>
                </div>
              </article>
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
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Daily control</p>
          <h2 className="mt-2 text-2xl font-semibold">Sales-upload freshness</h2>
        </div>
        <UploadCloud className="size-5 text-muted" />
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">Current means the latest closed day ({displayDate(expectedDate)}) is available.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {statuses.map((status) => {
          const latest = status.latestReport?.report_date ?? null;
          const current = Boolean(latest && latest >= expectedDate);
          return (
            <Link className="rounded-2xl border border-border bg-background p-4" href={`/app/reports/sales?storeId=${status.store.id}`} key={status.store.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{status.store.name}</p>
                <span className={current ? "rounded-full border border-success/40 px-2 py-1 text-xs font-semibold text-success" : "rounded-full border border-danger/40 px-2 py-1 text-xs font-semibold text-danger"}>
                  {current ? "Current" : "Behind"}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">Latest sales date: {displayDate(latest)}</p>
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
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Existing task system</p>
          <h2 className="mt-2 text-2xl font-semibold">Owner workboard</h2>
          <p className="mt-2 text-sm leading-6 text-muted">A clearer view only—no overdue task was changed or removed.</p>
        </div>
        <Link className="text-xs font-semibold text-muted" href="/app/tasks">All tasks</Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {groups.map(({ empty, icon: Icon, label, tasks }) => (
          <div className="rounded-2xl border border-border p-4" key={label}>
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
    <section className="rounded-[1.35rem] border border-border bg-foreground p-5 text-background shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-background/65">Your existing private assistant</p>
          <h2 className="mt-2 text-2xl font-semibold">Ask the Secretary</h2>
          <p className="mt-2 text-sm leading-6 text-background/70">Uses the existing backend and your own private chat history.</p>
        </div>
        <Link className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-background px-4 text-sm font-semibold text-foreground" href="/app/secretary">
          <Bot className="size-4" /> Open Secretary
        </Link>
      </div>
    </section>
  );
}
