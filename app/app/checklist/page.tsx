import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { ChecklistCard } from "@/components/checklist/checklist-card";
import { getAccessibleChecklists } from "@/lib/checklist/queries";
import { requireProfile } from "@/lib/auth/session";

export default async function ChecklistPage() {
  const { profile } = await requireProfile();
  const checklists = await getAccessibleChecklists(profile);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Daily Checklist</p>
            <h1 className="mt-2 text-3xl font-semibold">Store readiness</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              One morning view for sales, reviews, updates, urgent issues and store tasks.
            </p>
          </div>
          <ClipboardCheck className="size-5 text-muted" />
        </div>
      </section>

      {checklists.length ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {checklists.map((checklist) => (
            <ChecklistCard checklist={checklist} key={checklist.store.id} />
          ))}
        </section>
      ) : (
        <section className="rounded-[1.35rem] border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-2xl font-semibold">No active store assigned.</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Active store access is needed before a checklist can be shown.
          </p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
          href="/app/tasks/new"
        >
          Add task
        </Link>
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
          href="/app/updates/new"
        >
          Add store issue
        </Link>
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-4 text-sm font-semibold shadow-sm transition hover:border-foreground"
          href="/app/updates/new?category=No+issues+today"
        >
          No issues today
        </Link>
      </section>
    </div>
  );
}
