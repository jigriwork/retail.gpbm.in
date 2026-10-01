import type { ReactNode } from "react";

export type HeroStat = {
  label: string;
  value: string;
  hint?: string;
  /** "up" shows the hint as a marigold pill; "down" in soft red. */
  trend?: "up" | "down";
};

function greetingForHour() {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(new Date());
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const share = total ? Math.min(done / total, 1) : 1;

  return (
    <div className="relative size-[4.5rem] shrink-0">
      <svg aria-hidden className="size-full -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" fill="none" r={radius} stroke="rgb(255 255 255 / 0.14)" strokeWidth="7" />
        <circle
          className="transition-[stroke-dasharray] duration-700 ease-out"
          cx="36"
          cy="36"
          fill="none"
          r={radius}
          stroke="var(--accent)"
          strokeDasharray={`${circumference * share} ${circumference}`}
          strokeLinecap="round"
          strokeWidth="7"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold tabular-nums">
        {total ? `${done}/${total}` : "✓"}
      </span>
    </div>
  );
}

/**
 * The deep-indigo greeting card at the top of a home screen. Purely visual:
 * every number is passed in by the page that already loaded it.
 */
export function TodayHero({
  action,
  name,
  progress,
  stats,
  title,
}: {
  action?: ReactNode;
  name?: string | null;
  progress?: { done: number; total: number; label: string; caption: string };
  stats: HeroStat[];
  title: string;
}) {
  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] bg-primary-deep p-5 text-white shadow-sm sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full border-[28px] border-white/5" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">{title}</p>
          <p className="mt-1 text-sm text-white/70">{todayLabel()}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <h1 className="relative mt-2 text-[1.75rem] font-bold leading-tight sm:text-4xl">
        {greetingForHour()}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      {progress ? (
        <div className="relative mt-4 flex items-center gap-4">
          <ProgressRing done={progress.done} total={progress.total} />
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-6">{progress.label}</p>
            <p className="text-sm leading-5 text-white/70">{progress.caption}</p>
          </div>
        </div>
      ) : null}

      {stats.length ? (
        <div
          className={`relative mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 sm:gap-3 ${stats.length > 2 ? "sm:grid-cols-4" : ""}`}
        >
          {stats.map((stat) => (
            <div className="min-w-0 rounded-2xl bg-white/[0.06] p-3" key={stat.label}>
              <p className="truncate text-xs text-white/65">{stat.label}</p>
              <p className="mt-0.5 truncate font-display text-xl font-bold tabular-nums sm:text-2xl">{stat.value}</p>
              {stat.hint ? (
                stat.trend ? (
                  <span
                    className={
                      stat.trend === "up"
                        ? "mt-1 inline-flex rounded-full bg-accent px-2 py-0.5 text-[0.7rem] font-semibold text-primary-deep"
                        : "mt-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] font-semibold text-[#ffb3c0]"
                    }
                  >
                    {stat.hint}
                  </span>
                ) : (
                  <p className="mt-1 truncate text-xs text-white/65">{stat.hint}</p>
                )
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
