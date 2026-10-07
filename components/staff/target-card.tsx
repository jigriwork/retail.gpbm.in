import type { MyTarget } from "@/lib/staff/portal";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (value: number) => new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value);

/** 🎯 This month's target: progress bar, what is left and what that means per day. */
export function TargetCard({ target }: { target: MyTarget | null }) {
  if (!target?.target) return null;
  const goal = Number(target.target);
  const sale = Number(target.sale ?? 0);
  const pct = Math.min(100, Math.round((sale / goal) * 100));
  const left = Math.max(0, goal - sale);
  const days = Math.max(1, Number(target.days_left ?? 1));
  const month = MONTHS[Number(target.month.slice(5, 7)) - 1];
  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${pct >= 100 ? "border-success/40 bg-success/10" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">🎯 My target for {month}{target.set_by ? ` · set by ${target.set_by}` : ""}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{money(sale)} <span className="text-sm font-medium text-muted">of {money(goal)}</span></p>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${pct >= 100 ? "text-success" : "text-primary"}`}>{pct}%</p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/10">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm">{pct >= 100 ? "🎉 Target achieved! Every sale now is extra. Great work!" : `${money(left)} to go · about ${money(Math.ceil(left / days))} a day for the ${days} day${days === 1 ? "" : "s"} left`}</p>
    </section>
  );
}
