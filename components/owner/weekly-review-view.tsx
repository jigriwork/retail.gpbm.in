import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleAlert } from "lucide-react";

import { decisionResults, followupStatusLabels, formatRupees, labelFor, shortDate, verdictLabels } from "@/lib/owner/phase2-shared";
import { salesComparable, type Finding, type WeeklyEvidence } from "@/lib/owner/weekly-review-rules";

function Card({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Findings({ empty, findings, tone }: { empty: string; findings: Finding[]; tone: "up" | "down" }) {
  const Icon = tone === "up" ? ArrowUpRight : ArrowDownRight;
  return findings.length ? (
    <ul className="space-y-3">
      {findings.map((finding) => (
        <li className="flex gap-2" key={finding.text}>
          <Icon className={`mt-0.5 size-4 shrink-0 ${tone === "up" ? "text-success" : "text-danger"}`} />
          <div>
            <p className="text-sm font-semibold leading-6">{finding.text}</p>
            <p className="text-xs leading-5 text-muted">{finding.evidence}</p>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted">{empty}</p>
  );
}

export function WeeklyReviewView({ evidence }: { evidence: WeeklyEvidence }) {
  return (
    <>
      <Card title="Data coverage">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Store</th>
                <th className="py-1.5 pr-3 font-semibold">Sales days loaded</th>
                <th className="py-1.5 pr-3 font-semibold">Net sales (bills)</th>
                <th className="py-1.5 pr-3 font-semibold">Floor checks</th>
                <th className="py-1.5 font-semibold">Latest sales date</th>
              </tr>
            </thead>
            <tbody>
              {evidence.stores.map((store) => {
                const comparable = salesComparable(store, evidence.inProgress);
                const complete = store.sales && store.sales.daysLoaded === 7;
                return (
                  <tr className="border-t border-border align-top" key={store.id}>
                    <td className="py-2 pr-3 font-semibold">{store.name}</td>
                    <td className="py-2 pr-3">
                      {store.sales ? `${store.sales.daysLoaded}/${store.sales.daysLoaded + store.sales.missingDates.length}` : "—"}
                      <span className="block text-xs text-muted">prev. week {store.previous ? `${store.previous.daysLoaded}/7` : "—"}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {complete && store.sales ? `${formatRupees(store.sales.netSale)} (${store.sales.bills})` : "Not shown — incomplete"}
                      <span className="block text-xs text-muted">
                        {comparable && store.previous ? `prev. ${formatRupees(store.previous.netSale)} (${store.previous.bills})` : "Not compared"}
                      </span>
                      {complete && store.sales?.mittyNetSale !== null && store.sales?.mittyNetSale !== undefined ? (
                        <span className="block text-xs text-muted">MITTY {formatRupees(store.sales.mittyNetSale)}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      Rack {store.routines.rackDays}/7 · Cleaning {store.routines.cleaningDays}/7
                      <span className="block text-xs text-muted">Update or “no issues” on {store.routines.updateDays}/7 days</span>
                    </td>
                    <td className="py-2">{shortDate(store.latestSalesDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {evidence.dataLimits.length ? (
          <ul className="mt-4 space-y-1.5 rounded-2xl border border-warning/30 bg-warning/5 p-3 text-xs leading-5">
            {evidence.dataLimits.map((limit) => (
              <li className="flex gap-2" key={limit}><CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />{limit}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-muted">
          Sales are compared only when all 7 days are loaded in both weeks, and a change under 5% is treated as normal variation.
          Comparisons do not adjust for festivals, weddings, salary week or weather. Stock quantity is closing pieces only — not profit or ageing.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What improved">
          <Findings empty="Nothing improved clearly enough to claim." findings={evidence.improved} tone="up" />
        </Card>
        <Card title="What slipped">
          <Findings empty="Nothing slipped clearly." findings={evidence.slipped} tone="down" />
        </Card>
      </div>

      <Card title="Actions tried">
        <div className="grid gap-5 lg:grid-cols-3">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Decisions</h3>
            {evidence.decisions.tried.length ? (
              <ul className="space-y-2 text-sm">
                {evidence.decisions.tried.map((decision) => (
                  <li key={decision.id}>
                    <Link className="font-semibold underline-offset-2 hover:underline" href={`/app/owner/decisions/${decision.id}`}>{decision.title}</Link>
                    <span className="block text-xs text-muted">
                      {decision.store} · {decision.result
                        ? `Owner judged: ${labelFor(decisionResults, decision.result)} · Measured: ${verdictLabels[decision.verdict ?? ""] ?? "not measured"}`
                        : decision.status === "active" ? "running" : decision.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No decision was running.</p>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Recommendation follow-ups</h3>
            {evidence.followups.thisWeek.length ? (
              <ul className="space-y-2 text-sm">
                {evidence.followups.thisWeek.map((item) => (
                  <li key={item.id}>
                    <span className="font-semibold">{item.title}</span>
                    <span className="block text-xs text-muted">{followupStatusLabels[item.status] ?? item.status}{item.note ? ` — ${item.note}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No follow-ups recorded this week.</p>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Tasks</h3>
            <p className="text-sm">
              {evidence.tasks.completedCount} completed (previous week {evidence.tasks.previousCompletedCount}); {evidence.tasks.createdCount} created.
            </p>
            {evidence.tasks.completed.length ? (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {evidence.tasks.completed.map((task) => <li key={task.id}>✓ {task.title}{task.store ? ` · ${task.store}` : ""}</li>)}
              </ul>
            ) : null}
          </div>
        </div>
      </Card>

      <Card title="Stuck">
        {evidence.tasks.stuck.length ? (
          <ul className="space-y-2 text-sm">
            {evidence.tasks.stuck.map((task) => (
              <li className="flex flex-wrap justify-between gap-2" key={task.id}>
                <Link className="font-semibold hover:underline" href={`/app/tasks/${task.id}`}>{task.title}</Link>
                <span className="text-xs text-muted">{task.store ?? "Owner"} · due {shortDate(task.due_date)} · {task.days} days late at week end</span>
              </li>
            ))}
            {evidence.tasks.stuckCount > evidence.tasks.stuck.length ? (
              <li className="text-xs text-muted">and {evidence.tasks.stuckCount - evidence.tasks.stuck.length} more in Tasks.</li>
            ) : null}
          </ul>
        ) : <p className="text-sm text-muted">No task was more than a week overdue at the end of the week.</p>}
        <p className="mt-3 text-xs text-muted">Cancelled tasks are excluded because their cancellation date is not recorded.</p>
      </Card>

      <Card title="Decisions needed next week">
        {evidence.decisionsNeeded.length ? (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {evidence.decisionsNeeded.map((item) => (
              <li key={item.text}><span className="font-semibold">{item.text}</span><span className="block text-xs text-muted">{item.evidence}</span></li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">Nothing is waiting on an owner decision.</p>}
      </Card>
    </>
  );
}
