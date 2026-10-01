import Link from "next/link";
import { BookOpenCheck, CalendarRange, FlaskConical, History } from "lucide-react";

import { weekLabel } from "@/lib/owner/phase2-shared";
import type { OwnerToolsSummary } from "@/lib/owner/tools-summary";

export function OwnerToolsStrip({ handledCount, summary }: { handledCount: number; summary: OwnerToolsSummary }) {
  if (!summary.available) {
    return (
      <section className="rounded-[1.35rem] border border-warning/40 bg-warning/5 p-4 text-sm leading-6">
        Weekly review, decisions and SOPs are ready in code. Apply the Phase 2 migration to use them; production was not changed.
      </section>
    );
  }

  const reviewText =
    summary.lastWeekStatus === "completed"
      ? "Reviewed"
      : summary.lastWeekStatus === "draft"
        ? "Draft — not completed"
        : "Not reviewed yet";
  const items = [
    {
      href: "/app/owner/review",
      icon: CalendarRange,
      label: `Week ${weekLabel(summary.lastWeekStart)}`,
      tone: summary.lastWeekStatus === "completed" ? "text-success" : "text-warning",
      value: reviewText,
    },
    {
      href: "/app/owner/decisions",
      icon: FlaskConical,
      label: "Decision log",
      tone: summary.decisionsDue ? "text-warning" : "text-muted",
      value: summary.decisionsDue
        ? `${summary.decisionsDue} due for review`
        : `${summary.decisionsRunning} running`,
    },
    {
      href: "/app/owner/follow-ups",
      icon: History,
      label: "Follow-ups",
      tone: "text-muted",
      value: handledCount ? `${handledCount} handled today` : "History",
    },
    { href: "/app/sops", icon: BookOpenCheck, label: "Store SOPs", tone: "text-muted", value: `${summary.sopCount} active` },
  ];

  return (
    <section aria-label="Owner tools" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map(({ href, icon: Icon, label, tone, value }) => (
        <Link
          className="rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:border-primary"
          href={href}
          key={href}
        >
          <p className="flex items-center gap-2 text-xs font-medium text-muted">
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </p>
          <p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p>
        </Link>
      ))}
    </section>
  );
}
