import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";

import type { StoreChecklist } from "@/lib/checklist/queries";

export function ChecklistCard({ checklist }: { checklist: StoreChecklist }) {
  const complete = checklist.completionPercent === 100 && checklist.urgentOpenCount === 0;

  return (
    <Link
      className="block rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
      href={`/app/checklist/${checklist.store.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold">{checklist.store.name}</p>
          <p className="mt-1 text-sm text-muted">{checklist.store.code}</p>
        </div>
        <span
          className={
            complete
              ? "inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
              : "inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
          }
        >
          {complete ? <CheckCircle2 className="size-3" /> : <CircleAlert className="size-3" />}
          {checklist.status}
        </span>
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between gap-3">
          <p className="text-4xl font-semibold">{checklist.completionPercent}%</p>
          <p className="text-sm font-medium text-muted">
            {checklist.missingItems.length} missing
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-background">
          <div
            className="h-2 rounded-full bg-foreground"
            style={{ width: `${checklist.completionPercent}%` }}
          />
        </div>
      </div>

      {checklist.missingItems.length ? (
        <p className="mt-4 text-sm leading-6 text-muted">
          Missing: {checklist.missingItems.map((item) => item.title).join(", ")}
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted">All required items are complete.</p>
      )}
    </Link>
  );
}
