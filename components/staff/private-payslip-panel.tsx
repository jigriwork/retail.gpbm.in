"use client";

import { useEffect, useState } from "react";

type Payslip = { created_at: string; file_name: string | null; id: string; salary_month: string };

export function PrivatePayslipPanel() {
  const [items, setItems] = useState<Payslip[] | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => { fetch("/api/staff/payslips", { cache: "no-store" }).then(async (response) => { if (response.status === 401) { setLocked(true); return; } setItems(await response.json() as Payslip[]); }).catch(() => setLocked(true)); }, []);
  if (locked) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">Verify your password above to reveal payslips.</p>;
  if (items === null) return <p className="text-sm text-muted">Loading private payslips…</p>;
  if (!items.length) return <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No owner-linked payslip is available.</p>;
  return <div className="space-y-3">{items.map((item) => <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4" key={item.id}><div><p className="font-semibold">{new Date(`${item.salary_month}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p><p className="mt-1 text-xs text-muted">{item.file_name ?? "Payslip PDF"}</p></div><a className="rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background" href={`/api/staff/payslips/${item.id}`}>Open PDF</a></div>)}</div>;
}
