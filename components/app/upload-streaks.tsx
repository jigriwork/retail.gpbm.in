import { Flame } from "lucide-react";

import type { StoreSalesStatus } from "@/lib/reports/sales-queries";

/** Consecutive days of on-time sales uploads per store, with the last 14 days as dots. */
export function UploadStreaks({ statuses }: { statuses: StoreSalesStatus[] }) {
  const rows = statuses.filter((status) => status.dailySales?.length);
  if (!rows.length) return null;

  return (
    <section className="rounded-[1.35rem] bg-primary-deep p-4 text-white shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary-deep">
          <Flame className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold leading-6">Upload streaks</h2>
          <p className="text-xs text-white/70">Days in a row with sales uploaded</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((status) => {
          const streak = status.uploadStreak ?? 0;
          const days = (status.dailySales ?? []).slice(-14);
          return (
            <div className="flex items-center gap-3" key={status.store.id}>
              <span className="w-24 shrink-0 truncate text-sm font-semibold">{status.store.name}</span>
              <div aria-hidden className="flex flex-1 gap-1">
                {days.map((day) => (
                  <span
                    className={day.sale === null ? "h-3.5 flex-1 rounded bg-white/15" : "h-3.5 flex-1 rounded bg-accent"}
                    key={day.date}
                  />
                ))}
              </div>
              <span className="w-16 shrink-0 text-right font-display text-sm font-bold tabular-nums text-accent">
                {streak} {streak === 1 ? "day" : "days"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
