import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";

import type { ChecklistItem } from "@/lib/checklist/queries";

export function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <article className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={
              item.done
                ? "mt-0.5 flex size-9 items-center justify-center rounded-2xl border border-border text-success"
                : "mt-0.5 flex size-9 items-center justify-center rounded-2xl border border-border text-danger"
            }
          >
            {item.done ? <CheckCircle2 className="size-5" /> : <CircleAlert className="size-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <span
                className={
                  item.done
                    ? "rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
                    : "rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
                }
              >
                {item.done ? "Done" : item.required ? "Missing" : "Optional"}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted">{item.description}</p>
          </div>
        </div>
        {item.href ? (
          <Link
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
            href={item.href}
          >
            {item.actionLabel ?? "Open"}
          </Link>
        ) : (
          <span className="text-sm font-medium text-muted">Later</span>
        )}
      </div>
    </article>
  );
}
