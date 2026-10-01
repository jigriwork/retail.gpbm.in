import Link from "next/link";
import { Bell, CheckSquare, FileText, TrendingUp } from "lucide-react";

import { TodayHero } from "@/components/app/today-hero";
import { getStaffHomeSummary, getStaffProfileSummary } from "@/lib/staff/portal";

function money(value: number) { return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value); }

export default async function StaffHomePage() {
  const [profile, home] = await Promise.all([getStaffProfileSummary(), getStaffHomeSummary()]);
  if (!profile || !home) return null;
  const verified = home.sales.linkage_verified;
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
        title={`${profile.designation ?? "Staff"} · ${profile.store.name}`}
      />
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
