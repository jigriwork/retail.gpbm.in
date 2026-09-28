// Pure rules that turn a week's gathered facts into a short owner review.
// Every statement carries its evidence; comparisons are withheld when data
// coverage does not support them.

import { addDays } from "@/lib/tasks/dates";
import { causationNote, decisionResults, formatPercent, formatRupees, labelFor, shortDate, weekLabel } from "@/lib/owner/phase2-shared";

export type WeekSales = {
  bills: number;
  daysLoaded: number;
  missingDates: string[];
  mittyNetSale: number | null;
  netSale: number;
};

export type StoreWeekFacts = {
  code: string;
  id: string;
  latestSalesDate: string | null;
  name: string;
  previous: WeekSales | null;
  routines: {
    cleaningDays: number;
    previousCleaningDays: number;
    previousRackDays: number;
    rackDays: number;
    updateDays: number;
  };
  sales: WeekSales | null;
  salesError?: string;
  unmatchedStaffNames: number;
  urgent: { openedThisWeek: number; openOlderThanTwoDays: number; resolvedThisWeek: number };
};

export type ReviewTask = { days?: number; due_date?: string | null; id: string; store?: string | null; title: string };
export type ReviewDecision = {
  change_ratio?: number | null;
  id: string;
  result?: string | null;
  review_date: string;
  start_date: string;
  status: string;
  store?: string | null;
  title: string;
  verdict?: string | null;
  evidence_basis?: string | null;
};
export type ReviewFollowup = { id: string; status: string; title: string; created_at: string; note: string; task_id?: string | null };

export type WeeklyFacts = {
  decisions: {
    dueNextWeek: ReviewDecision[];
    reviewedThisWeek: ReviewDecision[];
    tried: ReviewDecision[];
  };
  followups: { acceptedUnlinked: ReviewFollowup[]; thisWeek: ReviewFollowup[] };
  generatedAt: string;
  inProgress: boolean;
  stores: StoreWeekFacts[];
  tasks: {
    completed: ReviewTask[];
    completedCount: number;
    createdCount: number;
    previousCompletedCount: number;
    stuck: ReviewTask[];
    stuckCount: number;
  };
  weekEnd: string;
  weekStart: string;
};

export type Finding = { evidence: string; text: string };

export type WeeklyEvidence = WeeklyFacts & {
  dataLimits: string[];
  decisionsNeeded: Finding[];
  improved: Finding[];
  slipped: Finding[];
  version: 1;
};

export const weeklyThresholds = {
  // A week-on-week sales move smaller than this is treated as normal variation.
  salesChange: 0.05,
  routineDayChange: 2,
  routineMinimumDays: 5,
  stuckDays: 7,
};

export function salesComparable(facts: StoreWeekFacts, inProgress: boolean) {
  return Boolean(
    !inProgress && facts.sales && facts.previous && facts.sales.daysLoaded === 7 && facts.previous.daysLoaded === 7,
  );
}

function ratio(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : null;
}

export function deriveWeeklyReview(facts: WeeklyFacts): WeeklyEvidence {
  const improved: Finding[] = [];
  const slipped: Finding[] = [];
  const dataLimits: string[] = [];
  const decisionsNeeded: Finding[] = [];
  const period = weekLabel(facts.weekStart);
  const previousPeriod = weekLabel(addDays(facts.weekStart, -7));

  if (facts.inProgress) {
    dataLimits.push("This week is still in progress. Sales comparisons are withheld until the week closes.");
  }

  for (const store of facts.stores) {
    if (store.salesError) {
      dataLimits.push(`${store.name}: sales summary could not be loaded (${store.salesError}). No sales conclusion is drawn.`);
    } else if (store.sales && store.previous) {
      if (salesComparable(store, facts.inProgress)) {
        const change = ratio(store.sales.netSale, store.previous.netSale);
        const billChange = ratio(store.sales.bills, store.previous.bills);
        const evidence = `${formatRupees(store.sales.netSale)} and ${store.sales.bills} bills (${period}) vs ${formatRupees(store.previous.netSale)} and ${store.previous.bills} bills (${previousPeriod}); all 7 days loaded in both weeks.`;
        if (change !== null && change >= weeklyThresholds.salesChange) {
          improved.push({ text: `${store.name} net sales up ${formatPercent(change)} (bills ${formatPercent(billChange)})`, evidence });
        } else if (change !== null && change <= -weeklyThresholds.salesChange) {
          slipped.push({ text: `${store.name} net sales down ${formatPercent(change)} (bills ${formatPercent(billChange)})`, evidence });
        }
      } else if (!facts.inProgress) {
        const gaps = [
          store.sales.daysLoaded < 7 ? `${store.sales.daysLoaded}/7 days this week${store.sales.missingDates.length ? ` (missing ${store.sales.missingDates.map(shortDate).join(", ")})` : ""}` : null,
          store.previous.daysLoaded < 7 ? `${store.previous.daysLoaded}/7 days the week before` : null,
        ].filter(Boolean);
        dataLimits.push(`${store.name}: sales not compared — ${gaps.join("; ")}.`);
      }
    }

    const routineDays = Math.min(store.routines.rackDays, store.routines.cleaningDays);
    const previousRoutineDays = Math.min(store.routines.previousRackDays, store.routines.previousCleaningDays);
    const routineEvidence = `Rack check on ${store.routines.rackDays}/7 days and cleaning check on ${store.routines.cleaningDays}/7 days (previous week ${store.routines.previousRackDays}/7 and ${store.routines.previousCleaningDays}/7).`;
    if (!facts.inProgress && routineDays < weeklyThresholds.routineMinimumDays) {
      slipped.push({ text: `${store.name} daily floor checks were missed on some days`, evidence: routineEvidence });
    } else if (routineDays - previousRoutineDays >= weeklyThresholds.routineDayChange) {
      improved.push({ text: `${store.name} completed daily floor checks more consistently`, evidence: routineEvidence });
    } else if (!facts.inProgress && previousRoutineDays - routineDays >= weeklyThresholds.routineDayChange) {
      slipped.push({ text: `${store.name} daily floor checks dropped`, evidence: routineEvidence });
    }

    if (store.urgent.openOlderThanTwoDays > 0) {
      slipped.push({
        text: `${store.name} has urgent store issues open for more than two days`,
        evidence: `${store.urgent.openOlderThanTwoDays} urgent update(s) still open; ${store.urgent.openedThisWeek} opened and ${store.urgent.resolvedThisWeek} resolved this week.`,
      });
    }

    if (store.unmatchedStaffNames > 0) {
      dataLimits.push(`${store.name}: ${store.unmatchedStaffNames} unmatched staff name(s) in the latest upload, so staff rankings are not reliable.`);
    }
  }

  if (facts.tasks.stuckCount > 0) {
    slipped.push({
      text: `${facts.tasks.stuckCount} task(s) overdue by more than a week at the end of the week`,
      evidence: facts.tasks.stuck.slice(0, 3).map((task) => `${task.title} (due ${shortDate(task.due_date)})`).join("; "),
    });
  }

  // Only measured sales movement is reported as improved/slipped. The owner's
  // judgement is shown with it, never as proof that the decision caused it.
  for (const decision of facts.decisions.reviewedThisWeek) {
    if (decision.evidence_basis !== "data" || !["improved", "declined"].includes(decision.verdict ?? "")) continue;
    const finding = {
      evidence: `Measured ${formatPercent(decision.change_ratio)} against the same number of days before it started. Owner judged it: ${labelFor(decisionResults, decision.result)}. ${causationNote}`,
      text: `Sales ${decision.verdict === "improved" ? "improved" : "declined"} during “${decision.title}”`,
    };
    if (decision.verdict === "improved") improved.push(finding);
    else slipped.push(finding);
  }

  for (const decision of facts.decisions.dueNextWeek) {
    decisionsNeeded.push({
      text: `Review decision “${decision.title}”`,
      evidence: decision.review_date < addDays(facts.weekEnd, 1) ? `Review was due ${shortDate(decision.review_date)}.` : `Review date ${shortDate(decision.review_date)}.`,
    });
  }
  const longStuck = facts.tasks.stuck.filter((task) => (task.days ?? 0) > 14);
  if (longStuck.length) {
    decisionsNeeded.push({
      text: `Keep, reassign or cancel ${longStuck.length} task(s) stuck for over two weeks`,
      evidence: longStuck.slice(0, 3).map((task) => task.title).join("; "),
    });
  }
  if (facts.followups.acceptedUnlinked.length) {
    decisionsNeeded.push({
      text: "Link or drop accepted recommendations that have no task or decision",
      evidence: facts.followups.acceptedUnlinked.slice(0, 3).map((item) => item.title).join("; "),
    });
  }
  const gapStores = facts.stores.filter((store) => !facts.inProgress && store.sales && store.sales.daysLoaded < 7);
  if (gapStores.length) {
    decisionsNeeded.push({
      text: `Ask for the missing ${gapStores.map((store) => store.name).join(" and ")} sales files if they exist`,
      evidence: "Complete weeks are needed before week-on-week sales can be compared.",
    });
  }

  return {
    ...facts,
    dataLimits,
    decisionsNeeded: decisionsNeeded.slice(0, 5),
    improved,
    slipped,
    version: 1,
  };
}

export function readWeeklyEvidence(value: unknown): WeeklyEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<WeeklyEvidence>;
  return record.version === 1 && Array.isArray(record.stores) ? (record as WeeklyEvidence) : null;
}
