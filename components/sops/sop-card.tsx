import Link from "next/link";
import { AlertTriangle, ChevronRight, PencilLine, PhoneCall } from "lucide-react";

import { readSopSteps, withStore } from "@/lib/owner/phase2-shared";
import type { Sop } from "@/lib/sops/queries";

const exceptionTemplates: Record<string, string> = {
  closing: "Pending for tomorrow:\nCustomer commitments:\nAlterations / exchanges due:",
  complaints: "Bill no. and date:\nItem:\nProblem:\nCustomer is asking for:\nAction taken so far:",
  "floor-supervision": "What happened:\nWho was involved:\nWhat was corrected:",
  opening: "What is not ready:\nEffect on customers:\nExpected fix time:",
};

function updateHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/app/updates/new?${query.toString()}`;
}

export function SopCard({ canEdit, sop, storeId }: { canEdit: boolean; sop: Sop; storeId?: string | null }) {
  const steps = readSopSteps(sop.steps);
  const details = exceptionTemplates[sop.sop_key] ?? "What happened:\nAction taken:";

  return (
    <article className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm" id={sop.sop_key}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">
            {sop.store?.name ?? "All stores"}
            {!sop.is_active ? " · inactive (hidden from managers)" : ""}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">{sop.title}</h2>
          {sop.when_to_use ? <p className="mt-1 text-sm font-medium">{sop.when_to_use}</p> : null}
          {sop.purpose ? <p className="mt-1 text-sm leading-6 text-muted">{sop.purpose}</p> : null}
        </div>
        {canEdit ? (
          <Link className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold" href={`/app/sops/${sop.id}/edit`}>
            <PencilLine className="size-3.5" /> Edit
          </Link>
        ) : null}
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li className="flex gap-3 rounded-xl border border-border bg-background p-3" key={`${sop.id}-${index}`}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[0.7rem] font-bold text-white">
              {index + 1}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-6">{step.text}</p>
            {step.href ? (
              <Link aria-label={`Open for step ${index + 1}`} className="inline-flex shrink-0 items-center text-xs font-semibold" href={withStore(step.href, storeId)}>
                Open <ChevronRight className="size-3.5" />
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      {sop.escalate_when ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm leading-6">
          <PhoneCall className="mt-1 size-4 shrink-0 text-danger" />
          <p>{sop.escalate_when}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold"
          href={updateHref({ category: sop.exception_category, details, storeId: storeId ?? undefined, title: `${sop.title}: ` })}
        >
          <AlertTriangle className="size-4" /> Record an exception
        </Link>
        <Link
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white"
          href={updateHref({
            category: "Owner attention needed",
            details,
            storeId: storeId ?? undefined,
            title: `${sop.title} escalation: `,
            urgency: "urgent",
          })}
        >
          <PhoneCall className="size-4" /> Escalate to owner
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted">Record only exceptions. A normal routine needs no form.</p>
    </article>
  );
}
