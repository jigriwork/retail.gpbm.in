import Link from "next/link";
import { Calendar, Clock3, LockKeyhole, Store, UserRound } from "lucide-react";

import { TaskActionButtons } from "@/components/tasks/task-action-buttons";
import type { TaskWithRelations } from "@/lib/tasks/queries";

function displayDate(date: string | null) {
  if (!date) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T00:00:00+05:30`));
}

function label(value: string | null | undefined, fallback = "Not set") {
  return value ? value.replaceAll("_", " ") : fallback;
}

export function TaskCard({ task }: { task: TaskWithRelations }) {
  return (
    <article className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Link className="min-w-0 flex-1" href={`/app/tasks/${task.id}`}>
          <h3 className="text-lg font-semibold leading-6">{task.title}</h3>
          {task.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
              {task.description}
            </p>
          ) : null}
        </Link>
        {task.is_private ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-semibold text-muted">
            <LockKeyhole className="size-3" />
            Private
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 text-xs font-semibold text-muted sm:grid-cols-2">
        <span className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 capitalize">
          <Store className="size-3.5" />
          {task.stores?.name ?? "Personal"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2">
          <Calendar className="size-3.5" />
          {displayDate(task.due_date)}
        </span>
        <span className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2">
          <Clock3 className="size-3.5" />
          {task.due_time?.slice(0, 5) ?? "Any time"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2">
          <UserRound className="size-3.5" />
          {task.assigned_profile?.full_name ?? task.assigned_profile?.email ?? "Unassigned"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold capitalize text-muted">
        <span className="rounded-full border border-border px-3 py-1">
          {label(task.category, "No category")}
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          {label(task.priority, "normal")}
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          {label(task.status, "pending")}
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          {label(task.source, "manual")}
        </span>
      </div>

      <div className="mt-5">
        <TaskActionButtons taskId={task.id} />
      </div>
    </article>
  );
}
