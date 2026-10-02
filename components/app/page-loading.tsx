import { Loader2 } from "lucide-react";

/** Shown the moment a page is opened, while the server prepares it. */
export function PageLoading({ note, title = "Loading…" }: { note?: string; title?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="flex items-center gap-3 rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
        <div>
          <p className="font-semibold">{title}</p>
          {note ? <p className="mt-0.5 text-sm leading-6 text-muted">{note}</p> : null}
        </div>
      </div>
      {[0, 1, 2].map((index) => (
        <div className="h-28 animate-pulse rounded-[1.35rem] border border-border bg-card" key={index} />
      ))}
    </div>
  );
}
