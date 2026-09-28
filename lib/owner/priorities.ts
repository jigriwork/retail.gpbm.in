import "server-only";

import { requireOwner, type Store } from "@/lib/auth/session";
import type { StoreSalesStatus } from "@/lib/reports/sales-queries";
import { createClient } from "@/lib/supabase/server";
import type { TaskWithRelations } from "@/lib/tasks/queries";
import { addDays, getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";
import { daysBetween, type PrioritySignal } from "@/lib/owner/phase2-shared";

export type DailyPriority = {
  action: string;
  confidence: "High" | "Medium";
  evidence: string;
  evidenceDate: string;
  href: string;
  id: string;
  owner: "Owner" | "Manager";
  review: string;
  // Comparable snapshot used by recommendation follow-up to decide whether the
  // evidence has changed materially since an owner last acted on it.
  signal: PrioritySignal;
  title: string;
  uncertain?: boolean;
};

export type SalesCoverage = {
  available: boolean;
  currentMonthDays: number;
  previousMonthDays: number;
  storeId: string;
};

function monthBefore(monthStart: string) {
  return addDays(monthStart, -1).slice(0, 7);
}

export async function getSalesCoverage(stores: Array<Pick<Store, "id">>) {
  if (!stores.length) return [] as SalesCoverage[];
  if (!(await requireOwner())) return [] as SalesCoverage[];

  const today = getIndiaToday();
  const currentMonth = getIndiaMonthStart(today).slice(0, 7);
  const previousMonth = monthBefore(getIndiaMonthStart(today));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("store_id,report_date")
    .eq("report_type", "sales")
    .eq("is_current", true)
    .eq("status", "processed")
    .in("store_id", stores.map((store) => store.id))
    .gte("report_date", `${previousMonth}-01`)
    .lte("report_date", today);

  if (error) {
    return stores.map((store) => ({
      available: false,
      currentMonthDays: 0,
      previousMonthDays: 0,
      storeId: store.id,
    }));
  }

  return stores.map((store) => {
    const dates = new Set((data ?? []).filter((row) => row.store_id === store.id).map((row) => row.report_date));
    return {
      available: true,
      currentMonthDays: [...dates].filter((date) => date?.startsWith(currentMonth)).length,
      previousMonthDays: [...dates].filter((date) => date?.startsWith(previousMonth)).length,
      storeId: store.id,
    };
  });
}

function dateLabel(value?: string | null) {
  if (!value) return "No upload found";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

function codeList(items: Array<{ code?: string | null; name?: string | null }>) {
  return items.map((item) => item.code ?? item.name ?? "?").sort().join(",");
}

export function buildDailyPriorities({
  coverage,
  limit = 5,
  overdueTasks,
  salesStatuses,
  stores,
  urgentUpdates,
}: {
  coverage: SalesCoverage[];
  limit?: number;
  overdueTasks: TaskWithRelations[];
  salesStatuses: StoreSalesStatus[];
  stores: Store[];
  urgentUpdates: number;
}) {
  const priorities: DailyPriority[] = [];
  const today = getIndiaToday();
  const expectedDate = addDays(today, -1);
  const stale = salesStatuses.filter((status) => (status.latestReport?.report_date ?? "") < expectedDate);

  if (stale.length) {
    priorities.push({
      action: `Ask the ${stale.map((item) => item.store.name).join(" and ")} manager to upload the latest closed-day sales file. Continue daily uploads; older gaps do not need to block today's work.`,
      confidence: "High",
      evidence: stale.map((item) => `${item.store.name}: latest ${dateLabel(item.latestReport?.report_date)}`).join("; "),
      evidenceDate: dateLabel(expectedDate),
      href: "/app/reports/sales",
      id: "sales-freshness",
      owner: "Manager",
      review: "Check again after closing today.",
      signal: {
        key: codeList(stale.map((item) => item.store)),
        label: stale.map((item) => item.store.name).join(" and "),
        metric: Math.max(
          ...stale.map((item) =>
            item.latestReport?.report_date ? daysBetween(item.latestReport.report_date, expectedDate) : 30,
          ),
        ),
        unit: "days behind",
      },
      title: "One or more sales uploads are behind",
    });
  }

  const unreliableStores = stores.filter((store) => {
    const item = coverage.find((entry) => entry.storeId === store.id);
    return !item?.available || item.currentMonthDays < 7 || item.previousMonthDays < 20;
  });
  if (unreliableStores.length) {
    priorities.push({
      action: "Use the latest daily figures for store control, but avoid month-on-month performance conclusions until daily coverage becomes consistent.",
      confidence: "Medium",
      evidence: unreliableStores
        .map((store) => {
          const item = coverage.find((entry) => entry.storeId === store.id);
          if (!item?.available) return `${store.name}: coverage check unavailable`;
          return `${store.name}: ${item?.currentMonthDays ?? 0} current-month and ${item?.previousMonthDays ?? 0} previous-month dates loaded`;
        })
        .join("; "),
      evidenceDate: dateLabel(today),
      href: "/app/reports",
      id: "comparison-coverage",
      owner: "Owner",
      review: "Review reliability after seven more days of regular uploads.",
      signal: {
        key: codeList(unreliableStores),
        label: unreliableStores.map((store) => store.name).join(" and "),
        metric: 0,
        unit: "",
      },
      title: "Longer-period comparisons are uncertain",
      uncertain: true,
    });
  }

  if (overdueTasks.length) {
    priorities.push({
      action: "Review the oldest items, keep valid work assigned, and cancel only tasks that are genuinely obsolete. Nothing will be changed automatically.",
      confidence: "High",
      evidence: `${overdueTasks.length} active task${overdueTasks.length === 1 ? " is" : "s are"} overdue; oldest due ${dateLabel(overdueTasks[0]?.due_date)}.`,
      evidenceDate: dateLabel(today),
      href: "/app/tasks?tab=pending",
      id: "overdue-tasks",
      owner: "Owner",
      review: "Check the overdue count at the end of this week.",
      signal: { key: "overdue", label: "Overdue tasks", metric: overdueTasks.length, unit: "overdue tasks" },
      title: "Clear the task backlog without deleting useful work",
    });
  }

  const unmatched = salesStatuses.reduce(
    (total, status) => total + Number(status.latestReport?.summary?.unmatchedStaffCount ?? 0),
    0,
  );
  if (unmatched) {
    priorities.push({
      action: "Have managers identify the names, then verify the mappings before using staff rankings for recognition or coaching.",
      confidence: "High",
      evidence: `${unmatched} unmatched staff name${unmatched === 1 ? "" : "s"} in the latest uploaded report summaries.`,
      evidenceDate: dateLabel(
        salesStatuses.map((status) => status.latestReport?.report_date ?? "").sort().at(-1),
      ),
      href: "/app/reports/staff-aliases",
      id: "staff-aliases",
      owner: "Manager",
      review: "Check the next upload for zero unmatched names.",
      signal: { key: "unmatched", label: "Unmatched staff names", metric: unmatched, unit: "unmatched names" },
      title: "Fix staff names before judging performance",
    });
  }

  const brandMark = stores.find((store) => store.code === "BM");
  if (brandMark && brandMark.firm_name?.trim().toLowerCase() !== "gp fashion") {
    priorities.push({
      action: "Confirm the exact legal name, then handle the firm mapping as a separate owner task. Do not rewrite old billing or payroll records.",
      confidence: "High",
      evidence: `Brand Mark is currently mapped to “${brandMark.firm_name ?? "not set"}”; owner records say billing moved to GP Fashion on 31 July 2026.`,
      evidenceDate: "31 Jul 2026",
      href: "/app/settings",
      id: "brand-mark-firm",
      owner: "Owner",
      review: "Verify the setting before the next firm-sensitive document is prepared.",
      signal: {
        key: brandMark.firm_name?.trim() || "not set",
        label: brandMark.firm_name?.trim() || "not set",
        metric: 0,
        unit: "",
      },
      title: "Keep the GP Fashion correction separate",
    });
  }

  if (urgentUpdates && priorities.length < limit) {
    priorities.push({
      action: "Ask the responsible manager for the next concrete step and close the update only after the issue is resolved.",
      confidence: "High",
      evidence: `${urgentUpdates} urgent manager update${urgentUpdates === 1 ? " remains" : "s remain"} open.`,
      evidenceDate: dateLabel(today),
      href: "/app/updates?status=open&urgency=urgent",
      id: "urgent-updates",
      owner: "Manager",
      review: "Review before store closing today.",
      signal: { key: "urgent", label: "Open urgent updates", metric: urgentUpdates, unit: "urgent updates" },
      title: "Resolve the open urgent store issue",
    });
  }

  return priorities.slice(0, limit);
}
