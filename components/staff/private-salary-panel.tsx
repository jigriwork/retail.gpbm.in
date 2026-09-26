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
  return <div className="space-y-3">{periods.map((period) => <div className="rounded-2xl border border-border bg-card p-4" key={period.id}><div className="flex justify-between gap-3"><p className="font-semibold">{new Date(`${period.salary_month}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p><p className="text-xl font-semibold">{money(period.net_payable)}</p></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><p>Base: <strong>{money(period.salary_amount)}</strong></p><p>Absent days: <strong>{period.abs_days ?? 0}</strong></p><p>Absence: <strong>{money(period.abs_amount)}</strong></p><p>Advance: <strong>{money(period.advance)}</strong></p><p>Commission: <strong>{money(period.commission)}</strong></p><p>Sunday pay: <strong>{money(period.sunday_pay_amount)}</strong></p></div></div>)}</div>;
}
