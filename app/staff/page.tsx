import Link from "next/link";
import { Bell, CheckSquare, FileText, TrendingUp } from "lucide-react";

import { Celebration } from "@/components/app/celebration";
import { StarsList, shortDay } from "@/components/app/store-stars";
import { TodayHero } from "@/components/app/today-hero";
import { TargetCard } from "@/components/staff/target-card";
import { dailyQuote, staffLine } from "@/lib/motivation/lines";
import { addDays, getIndiaToday, isMondayInIndia } from "@/lib/tasks/dates";
import { getMySalesSummary, getMyTarget, getMyWeek, getStaffHomeSummary, getStaffProfileSummary } from "@/lib/staff/portal";

function money(value: number) { return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value); }

export default async function StaffHomePage() {
  const [profile, home, week, target] = await Promise.all([getStaffProfileSummary(), getStaffHomeSummary(), getMyWeek(), getMyTarget()]);
  if (!profile || !home) return null;
  // Am I one of this week's stars? (my names as the sales reports spell them)
  const mine = new Set(week?.names ?? []);
  const myAwards = week?.linked ? [
    week.stars.top[0] && mine.has(week.stars.top[0].name) ? "top seller" : "",
    week.stars.best_bill && mine.has(week.stars.best_bill.name) ? "best average bill" : "",
    week.stars.most_items && mine.has(week.stars.most_items.name) ? "most items per bill" : "",
  ].filter(Boolean) : [];
  const verified = home.sales.linkage_verified;
  // Motivation: yesterday from this month's days (or a small read on the 1st).
  const today = getIndiaToday();
  const yesterdayDate = addDays(today, -1);
  const fromMonth = home.sales.daily.find((dayRow) => dayRow.sale_date === yesterdayDate);
  const yesterday = fromMonth ? Number(fromMonth.value) : verified && yesterdayDate.slice(0, 7) !== today.slice(0, 7)
    ? Number((await getMySalesSummary(yesterdayDate, yesterdayDate).catch(() => null))?.summary.value ?? 0) : 0;
  const goal = Number(target?.target ?? 0);
  const left = Math.max(0, goal - Number(target?.sale ?? 0));
  const line = verified ? staffLine({
    isMonday: isMondayInIndia(today),
    rank: week?.linked ? (week.rank ?? null) : null,
    target: goal ? { left, perDay: left / Math.max(1, Number(target?.days_left ?? 1)), reached: left === 0 } : null,
    today: Number(home.today_value ?? 0),
    yesterday,
  }) : null;
  const payslip = home.latest_payslip_month
    ? new Date(`${home.latest_payslip_month}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "Not linked";

  return (
    <div className="space-y-5">
      <TodayHero
        name={profile.name}
        stats={[
          { label: "Today sales", value: verified ? money(home.today_value) : "Verification needed" },
          { label: "Month sales", value: verified ? money(home.sales.summary.value) : "Verification needed" },
        ]}
        motivation={{ line, quote: dailyQuote(today) }}
        title={profile.store.name}
      />
      <TargetCard target={target} />
      {week ? (
        <section className={`rounded-2xl border p-4 shadow-sm ${myAwards.length ? "pop-in border-success/40 bg-success/10" : "border-border bg-card"}`}>
          {myAwards.length ? <Celebration id={`star:${week.to}`} /> : null}
          <p className="text-xs text-muted">Last 7 days{week.from && week.to ? ` · ${shortDay(week.from)} – ${shortDay(week.to)}` : ""} (until yesterday)</p>
          {myAwards.length ? <p className="mt-1 text-lg font-semibold">⭐ You are a star of the last 7 days: {myAwards.join(", ")}! Great work!</p> : null}
          {week.linked ? (
            <p className="mt-1 text-sm">
              <span className="text-lg font-semibold">{money(week.sale ?? 0)}</span> · {week.bills ?? 0} bills
              {week.rank ? ` · #${week.rank} of ${week.of} in the store` : ""}
              {week.rank && week.rank > 1 && week.rank <= 5 ? " · keep going, the top is close!" : ""}
            </p>
          ) : <p className="mt-1 text-sm text-muted">Your sales name is not verified yet; ask the owner to link it.</p>}
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-sm font-semibold">⭐ Stars of the last 7 days</p>
            <StarsList amounts={false} stars={week.stars} />
          </div>
        </section>
      ) : null}
      <Link className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary-soft p-4 shadow-sm active:scale-[0.98]" href="/staff/requests">
        <span>
          <span className="block text-lg font-semibold">✍️ Request to owner</span>
          <span className="text-xs text-muted">Stock needed, shop supplies, leave, a problem or an idea</span>
        </span>
        <span aria-hidden className="text-xl text-primary">→</span>
      </Link>
      <section className="grid grid-cols-2 gap-3">
        <Link className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary" href="/staff/sales">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><TrendingUp className="size-4" /></span>
          <p className="mt-3 text-xs text-muted">My sales</p>
          <p className="mt-1 text-lg font-semibold">{verified ? "See details" : "Verification needed"}</p>
        </Link>
        <Link className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary" href="/staff/tasks">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><CheckSquare className="size-4" /></span>
          <p className="mt-3 text-xs text-muted">Pending tasks</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{home.pending_tasks}</p>
        </Link>
        <Link className="col-span-2 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary" href="/staff/payslips">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#E3F4EC] text-success"><FileText className="size-4" /></span>
          <p className="mt-3 text-xs text-muted">Latest payslip</p>
          <p className="mt-1 text-xl font-semibold">{payslip}</p>
        </Link>
      </section>
      {!verified ? <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm font-semibold text-warning">Sales linkage requires owner verification.</div> : null}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary-soft text-primary"><Bell className="size-4" /></span>
          Important notices
        </h2>
        {home.notices.length ? home.notices.map((notice, index) => <div className="rounded-2xl border border-border bg-card p-4" key={`${notice.created_at}-${index}`}><p className="font-semibold">{notice.title}</p>{notice.details ? <p className="mt-2 text-sm leading-6 text-muted">{notice.details}</p> : null}</div>) : <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No current notices. You&apos;re all caught up.</p>}
      </section>
    </div>
  );
}
