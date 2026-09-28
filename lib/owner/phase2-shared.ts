// Pure Phase 2 rules shared by server code, components and tests.
// Nothing here reads data or touches the network.

import { addDays } from "@/lib/tasks/dates";

export const decisionKinds = [
  { value: "staff_placement", label: "Staff placement" },
  { value: "display", label: "Display / visual merchandising" },
  { value: "customer_follow_up", label: "Customer follow-up" },
  { value: "assortment", label: "Assortment / buying" },
  { value: "pricing_offer", label: "Pricing / offer" },
  { value: "operations", label: "Store routine / operations" },
  { value: "other", label: "Other" },
] as const;

export const measureTypes = [
  { value: "store_net_sales", label: "Store net sales per day", data: true },
  { value: "store_bills", label: "Bills per day", data: true },
  { value: "store_average_bill", label: "Average bill value", data: true },
  { value: "brand_net_sales", label: "One brand's net sales per day", data: true },
  { value: "category_net_sales", label: "One category's net sales per day", data: true },
  { value: "observation", label: "Owner observation (not sales data)", data: false },
] as const;

export const decisionStatuses = ["planned", "active", "reviewed", "cancelled"] as const;
export const decisionResults = [
  { value: "worked", label: "Worked" },
  { value: "did_not_work", label: "Did not work" },
  { value: "mixed", label: "Mixed" },
  { value: "inconclusive", label: "Inconclusive" },
] as const;

export type DecisionKind = (typeof decisionKinds)[number]["value"];
export type MeasureType = (typeof measureTypes)[number]["value"];
export type DecisionStatus = (typeof decisionStatuses)[number];
export type DecisionResult = (typeof decisionResults)[number]["value"];

export function labelFor<T extends { value: string; label: string }>(list: readonly T[], value?: string | null) {
  return list.find((item) => item.value === value)?.label ?? value ?? "";
}

// Labels for MEASURED sales movement. They describe what sales did, never
// whether the decision caused it; the owner's judgement is recorded separately.
export const verdictLabels: Record<string, string> = {
  improved: "Sales improved",
  declined: "Sales declined",
  no_clear_change: "No clear sales change",
  insufficient_data: "Not enough sales data",
  too_short: "Too early to measure",
  not_started: "Not started yet",
  not_measured: "Not measured — owner observation",
};

export const causationNote = "Measured sales show what happened to sales, not that this decision caused it.";

// ---------------------------------------------------------------------------
// Dates and weeks (Asia/Kolkata calendar dates as YYYY-MM-DD strings)
// ---------------------------------------------------------------------------

export function isoDate(value: string | null | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function dayOfWeek(date: string) {
  // 0 = Sunday … 6 = Saturday, evaluated as an India calendar date.
  return new Date(`${date}T12:00:00+05:30`).getUTCDay();
}

export function weekStartFor(date: string) {
  const day = dayOfWeek(date);
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function lastCompletedWeekStart(today: string) {
  return addDays(weekStartFor(today), -7);
}

export function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function datesInRange(start: string, end: string) {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function shortDate(date?: string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(`${date.slice(0, 10)}T00:00:00+05:30`),
  );
}

export function weekLabel(weekStart: string) {
  return `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;
}

export function formatRupees(value: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0, style: "currency", currency: "INR" }).format(
    Number(value ?? 0),
  );
}

export function formatPercent(ratio: number | null | undefined) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  const value = Math.round(ratio * 1000) / 10;
  return `${value > 0 ? "+" : ""}${value}%`;
}

// ---------------------------------------------------------------------------
// Recommendation follow-up
// ---------------------------------------------------------------------------

export type PrioritySignal = {
  key: string;
  label: string;
  metric: number;
  unit: string;
};

export type FollowupStatus = "accepted" | "converted" | "dismissed" | "reviewed";

export type FollowupRecord = {
  created_at: string;
  created_by: string;
  decision?: { id: string; status: string; title: string; result: string | null; reviewed_at: string | null } | null;
  evidence_text: string;
  id: string;
  outcome: string;
  reason: string;
  recommendation_key: string;
  signal: unknown;
  source: string;
  status: FollowupStatus | string;
  task?: { id: string; status: string | null; title: string; completed_at: string | null } | null;
  task_id: string | null;
  title: string;
};

export type FollowupAssessment =
  | { kind: "new" }
  | { kind: "handled"; explanation: string; previous: FollowupRecord }
  | { kind: "raised_again"; explanation: string; previous: FollowupRecord };

export const followupRules = {
  acceptedWithoutLinkDays: 7,
  dismissedReviewDays: 14,
  minimumWorsening: 2,
  worseningRatio: 0.5,
};

function readSignal(value: unknown): PrioritySignal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.key !== "string") return null;
  return {
    key: record.key,
    label: typeof record.label === "string" ? record.label : record.key,
    metric: Number.isFinite(Number(record.metric)) ? Number(record.metric) : 0,
    unit: typeof record.unit === "string" ? record.unit : "",
  };
}

export function describeMaterialChange(previousValue: unknown, current: PrioritySignal) {
  const previous = readSignal(previousValue);
  if (!previous) return null;
  if (previous.key !== current.key) {
    return `What it covers has changed (${previous.label || "none"} → ${current.label || "none"}).`;
  }
  const threshold = Math.max(followupRules.minimumWorsening, Math.ceil(previous.metric * followupRules.worseningRatio));
  if (current.metric - previous.metric >= threshold) {
    return `It has worsened from ${previous.metric} to ${current.metric}${current.unit ? ` ${current.unit}` : ""}.`;
  }
  return null;
}

function statusVerb(record: FollowupRecord) {
  if (record.status === "dismissed") return `Dismissed on ${shortDate(record.created_at)} (“${record.reason}”)`;
  if (record.status === "reviewed") return `Reviewed on ${shortDate(record.created_at)} (“${record.outcome}”)`;
  if (record.status === "converted") return `Linked to a task on ${shortDate(record.created_at)}`;
  return `Accepted on ${shortDate(record.created_at)}`;
}

export function assessFollowup(
  current: PrioritySignal,
  latest: FollowupRecord | null | undefined,
  today: string,
): FollowupAssessment {
  if (!latest) return { kind: "new" };

  const age = daysBetween(latest.created_at.slice(0, 10), today);
  const change = describeMaterialChange(latest.signal, current);
  const raised = (explanation: string): FollowupAssessment => ({ kind: "raised_again", explanation, previous: latest });
  const handled = (explanation: string): FollowupAssessment => ({ kind: "handled", explanation, previous: latest });

  if (latest.status === "dismissed" || latest.status === "reviewed") {
    if (change) return raised(`${statusVerb(latest)}. Raised again: ${change}`);
    if (age > followupRules.dismissedReviewDays) {
      return raised(`${statusVerb(latest)}. Still present ${age} days later, so it is shown again for a fresh look.`);
    }
    return handled(`${statusVerb(latest)}. Hidden until the evidence changes materially or ${followupRules.dismissedReviewDays} days pass.`);
  }

  if (latest.status === "converted") {
    const task = latest.task;
    if (!task) return raised(`${statusVerb(latest)}, but that task no longer exists.`);
    const taskStatus = task.status ?? "pending";
    if (taskStatus === "done" || taskStatus === "cancelled") {
      const when = task.completed_at ? ` on ${shortDate(task.completed_at)}` : "";
      return raised(`Linked task “${task.title}” was ${taskStatus === "done" ? "completed" : "cancelled"}${when}, but the issue is still present.`);
    }
    if (change) return raised(`Task “${task.title}” is still open. Raised again: ${change}`);
    return handled(`Being handled in task “${task.title}”.`);
  }

  // accepted
  const decision = latest.decision;
  if (decision) {
    if (decision.status === "reviewed" || decision.status === "cancelled") {
      return raised(`Decision “${decision.title}” was ${decision.status === "reviewed" ? "reviewed" : "cancelled"}, but the issue is still present.`);
    }
    if (change) return raised(`Decision “${decision.title}” is running. Raised again: ${change}`);
    return handled(`Being tested as decision “${decision.title}”.`);
  }
  if (change) return raised(`${statusVerb(latest)}. Raised again: ${change}`);
  if (age > followupRules.acceptedWithoutLinkDays) {
    return raised(`${statusVerb(latest)}, but no task or decision was linked after ${age} days.`);
  }
  return handled(`${statusVerb(latest)}. No task or decision linked yet.`);
}

export function latestFollowupByKey<T extends Pick<FollowupRecord, "recommendation_key" | "created_at">>(records: T[]) {
  const latest = new Map<string, T>();
  for (const record of records) {
    const existing = latest.get(record.recommendation_key);
    if (!existing || existing.created_at < record.created_at) latest.set(record.recommendation_key, record);
  }
  return latest;
}

export const followupStatusLabels: Record<string, string> = {
  accepted: "Accepted",
  converted: "Linked to task",
  dismissed: "Dismissed",
  reviewed: "Reviewed",
};

// ---------------------------------------------------------------------------
// SOP steps
// ---------------------------------------------------------------------------

export type SopStep = { text: string; href?: string | null };

const sopHrefPattern = /^\/app\/[a-z0-9/_-]{1,80}$/;

export function parseSopSteps(input: string): { steps: SopStep[]; error?: string } {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { steps: [], error: "Add at least one step." };
  if (lines.length > 12) return { steps: [], error: "Keep an SOP to 12 steps or fewer." };

  const steps: SopStep[] = [];
  for (const line of lines) {
    const [rawText, rawHref] = line.split(/\s+\|\s+/);
    const text = (rawText ?? "").trim();
    const href = rawHref?.trim();
    if (!text || text.length > 300) return { steps: [], error: "Each step must be 1–300 characters." };
    if (href && !sopHrefPattern.test(href)) {
      return { steps: [], error: `Links must be app paths such as /app/reviews/rack (found “${href}”).` };
    }
    steps.push(href ? { text, href } : { text });
  }
  return { steps };
}

export function formatSopSteps(value: unknown) {
  return readSopSteps(value)
    .map((step) => (step.href ? `${step.text} | ${step.href}` : step.text))
    .join("\n");
}

export function readSopSteps(value: unknown): SopStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object")
    .map((step) => ({
      text: typeof step.text === "string" ? step.text : "",
      href: typeof step.href === "string" && sopHrefPattern.test(step.href) ? step.href : null,
    }))
    .filter((step) => step.text);
}

export function withStore(href: string, storeId?: string | null) {
  if (!storeId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}storeId=${encodeURIComponent(storeId)}`;
}
