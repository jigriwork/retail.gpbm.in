"use client";

import { useEffect, useState } from "react";

type SalaryPeriod = {
  abs_amount?: number | null;
  abs_days?: number | null;
  advance?: number | null;
  commission?: number | null;
  id: string;
  net_payable?: number | null;
  salary_amount?: number | null;
  salary_month: string;
  status?: string | null;
  sunday_pay_amount?: number | null;
};

function money(value?: number | null) { return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value ?? 0); }

export function PrivateSalaryPanel() {
  const [periods, setPeriods] = useState<SalaryPeriod[] | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => { fetch("/api/staff/salary", { cache: "no-store" }).then(async (response) => { if (response.status === 401) { setLocked(true); return; } const body = await response.json() as { periods?: SalaryPeriod[] }; setPeriods(body.periods ?? []); }).catch(() => setLocked(true)); }, []);
  if (locked) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">Verify your password above to reveal salary information.</p>;
  if (periods === null) return <p className="text-sm text-muted">Loading private salary…</p>;
  if (!periods.length) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No owner-linked salary record is available.</p>;
  return <div className="min-w-0 space-y-3">{periods.map((period) => <div className="min-w-0 rounded-2xl border border-border bg-card p-4" key={period.id}><div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{new Date(`${period.salary_month}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p><p className="break-words text-xl font-semibold tabular-nums">{money(period.net_payable)}</p></div><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-sm min-[360px]:grid-cols-2">{[["Base", money(period.salary_amount)], ["Absent days", String(period.abs_days ?? 0)], ["Absence", money(period.abs_amount)], ["Advance", money(period.advance)], ["Commission", money(period.commission)], ["Sunday pay", money(period.sunday_pay_amount)]].map(([label, value]) => <div className="min-w-0 rounded-xl bg-background p-3" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-1 break-words font-semibold tabular-nums">{value}</p></div>)}</div></div>)}</div>;
}
