import Link from "next/link";
import { Plus } from "lucide-react";

import { GenerateRemindersButton } from "@/components/tasks/generate-reminders-button";
import { TaskCard } from "@/components/tasks/task-card";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { filterTasksByTab, getTasksForProfile } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils/cn";

const tabs = [
  { label: "Today", value: "today" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tabs.some((item) => item.value === tab) ? tab! : "today";
  const { profile } = await requireProfile();
  const tasks = await getTasksForProfile();
  const visibleTasks = filterTasksByTab(tasks, activeTab);
  const stores = await getAccessibleStores(profile);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Tasks</p>
            <h1 className="mt-2 text-3xl font-semibold">Daily command list</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              {stores.length} accessible store{stores.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              href="/app/tasks/new"
            >
              <Plus className="size-4" />
              Add Task
            </Link>
            {profile?.role === "owner" ? <GenerateRemindersButton /> : null}
          </div>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <Link
            className={cn(
              "whitespace-nowrap rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-muted",
              activeTab === item.value && "bg-foreground text-background",
            )}
            href={`/app/tasks?tab=${item.value}`}
            key={item.value}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {visibleTasks.length ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </section>
      ) : (
        <section className="rounded-[1.35rem] border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-2xl font-semibold">Nothing waiting here.</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Add a task or generate today&apos;s reminders.
          </p>
        </section>
      )}
    </div>
  );
}
