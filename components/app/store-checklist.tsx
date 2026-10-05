import Link from "next/link";

import { getStoreChecklist, type StoreChecklist } from "@/lib/cash-book/queries";

type Day = StoreChecklist["days"][number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "28 Sep" (always three letters). */
function shortDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** A day counts when the sales report came by noon (bill-wise) and the cash book was closed. */
function dayDone(day: Day, cashStart: string | null) {
  const cashDone = day.cash === "closed" || day.cash === "reviewed" || !cashStart || day.day < cashStart;
  return day.report === "on_time" && cashDone;
}

export function checklistStatus(checklist: StoreChecklist) {
  const [yesterday] = checklist.days;
  let streak = 0;
  for (const day of checklist.days) {
    if (!dayDone(day, checklist.cash_start)) break;
    streak += 1;
  }
  const pending: string[] = [];
  const notes: string[] = [];
  if (yesterday) {
    const label = shortDay(yesterday.day);
    if (yesterday.report === "missing") pending.push(`Sales report for ${label} is not uploaded`);
    if (yesterday.report === "summary_only") pending.push(`Sales report for ${label} has no bill details: upload the BILL WISE SALES REPORT`);
    if (yesterday.report === "late") notes.push(`Sales report for ${label} came after 12 noon`);
    const cashDue = checklist.cash_start && yesterday.day >= checklist.cash_start;
    if (cashDue && (yesterday.cash === "not_done" || yesterday.cash === "open")) pending.push(`Cash book for ${label} is not closed`);
    if (!checklist.cash_start) notes.push("Cash book not started yet");
  }
  if (checklist.tasks_due) pending.push(`${checklist.tasks_due} task${checklist.tasks_due === 1 ? "" : "s"} due`);
  return { allDone: pending.length === 0 && Boolean(yesterday && dayDone(yesterday, checklist.cash_start)), notes, pending, streak };
}

/** Daily checklist with a cheer when everything is done; statuses only, no figures. */
export async function StoreChecklistCard({ firstName, storeId, storeName }: { firstName?: string | null; storeId: string; storeName: string }) {
  const checklist = await getStoreChecklist(storeId);
  if (!checklist?.days?.length) return null;
  const { allDone, notes, pending, streak } = checklistStatus(checklist);
  const week = checklist.days.slice(0, 7).reverse();
  return (
    <section className={`rounded-[1.35rem] border p-5 shadow-sm ${allDone ? "border-success/40 bg-success/10" : "border-accent/40 bg-accent-soft"}`}>
      <p className="text-sm font-medium text-muted">{storeName} · daily checklist</p>
      {allDone ? (
        <p className="mt-2 text-lg font-semibold">
          🎉 All done for {shortDay(checklist.days[0].day)}!{streak >= 2 ? ` ${streak} days in a row on time.` : ""} Great work{firstName ? `, ${firstName}` : ""}!
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          <p className="text-lg font-semibold">⏳ Pending</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {pending.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {notes.length ? <p className="mt-2 text-xs text-muted">{notes.join(" · ")}</p> : null}
      <div aria-label="Last 7 days" className="mt-3 flex flex-wrap gap-1.5">
        {week.map((day) => (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${dayDone(day, checklist.cash_start) ? "bg-success text-white" : "bg-card text-muted"}`}
            key={day.day}
            title={`${shortDay(day.day)}: report ${day.report.replace("_", " ")}, cash ${day.cash.replace("_", " ")}`}
          >
            {shortDay(day.day)} {dayDone(day, checklist.cash_start) ? "✓" : "·"}
          </span>
        ))}
      </div>
      {!allDone ? <Link className="mt-3 inline-block text-sm font-semibold text-primary underline" href={`/app/money?store=${storeId}`}>Open the cash book</Link> : null}
    </section>
  );
}
