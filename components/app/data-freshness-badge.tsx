import type { DataFreshness } from "@/lib/analytics/freshness";

export function DataFreshnessBadge({ freshness, source }: { freshness?: DataFreshness | null; source: string }) {
  if (!freshness) return null;

  const state = !freshness.sourceThroughDate ? "Missing input" : freshness.stale ? "Stale input" : "Current input";
  const tone = freshness.stale || !freshness.sourceThroughDate ? "text-danger" : "text-success";

  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{source} freshness</p>
        <span className={`rounded-full border border-border px-3 py-1 text-xs font-semibold ${tone}`}>{state}</span>
      </div>
      <p className="mt-2 leading-6 text-muted">
        Data updated through {freshness.sourceThroughDate ?? "no processed source"}. Expected within {freshness.slaDays} day
        {freshness.slaDays === 1 ? "" : "s"}. A missing or stale upload is not a technical failure.
      </p>
    </section>
  );
}
