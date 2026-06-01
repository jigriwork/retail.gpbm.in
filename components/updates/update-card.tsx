import Link from "next/link";
import { AlertTriangle, ClipboardCheck } from "lucide-react";

import { UpdateStatusActions } from "@/components/updates/status-actions";
import type { ManagerUpdate } from "@/lib/updates/queries";

function displayTime(value: string | null) {
  if (!value) {
    return "No time";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function createdBy(update: ManagerUpdate) {
  return update.created_profile?.full_name ?? update.created_profile?.email ?? "Unknown";
}

function label(value: string | null | undefined, fallback: string) {
  return value ? value.replaceAll("_", " ") : fallback;
}

export function UpdateCard({ update, compact = false }: { update: ManagerUpdate; compact?: boolean }) {
  const urgent = update.urgency === "urgent";

  return (
    <article
      className={
        urgent
          ? "rounded-[1.35rem] border border-danger bg-card p-4 shadow-sm"
          : "rounded-[1.35rem] border border-border bg-card p-4 shadow-sm"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <Link className="min-w-0 flex-1" href={`/app/updates/${update.id}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-6">{update.title}</h3>
            {urgent ? <AlertTriangle className="size-4 text-danger" /> : null}
          </div>
          <p className="mt-1 text-sm font-medium text-muted">
            {update.stores?.name ?? "Store"} · {displayTime(update.created_at)}
          </p>
          {update.details ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted">
              {update.details}
            </p>
          ) : null}
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold capitalize text-muted">
        <span className="rounded-full border border-border px-3 py-1">
          {update.category ?? "Other"}
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          {label(update.urgency, "normal")}
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          {label(update.status, "open")}
        </span>
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Created by</p>
            <p className="mt-1 font-semibold">{createdBy(update)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Linked task</p>
            {update.created_task ? (
              <Link
                className="mt-1 inline-flex items-center gap-2 font-semibold"
                href={`/app/tasks/${update.created_task.id}`}
              >
                <ClipboardCheck className="size-3" />
                {update.created_task.status ?? "pending"}
              </Link>
            ) : (
              <p className="mt-1 font-semibold">None</p>
            )}
          </div>
        </div>
      ) : null}

      {!compact ? (
        <div className="mt-4">
          <UpdateStatusActions updateId={update.id} />
        </div>
      ) : null}
    </article>
  );
}
