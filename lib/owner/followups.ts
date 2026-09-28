import "server-only";

import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import {
  assessFollowup,
  latestFollowupByKey,
  type FollowupAssessment,
  type FollowupRecord,
} from "@/lib/owner/phase2-shared";
import { buildDailyPriorities, getSalesCoverage, type DailyPriority } from "@/lib/owner/priorities";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday } from "@/lib/tasks/dates";
import { getOwnerTaskWorkboard, type TaskWithRelations } from "@/lib/tasks/queries";
import { getTodayUpdateSummary } from "@/lib/updates/queries";

export type AssessedPriority = DailyPriority & { followup: FollowupAssessment };

export type FollowupsResult = {
  available: boolean;
  records: FollowupRecord[];
};

function missingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        error.message?.includes("recommendation_followups")),
  );
}

// Loads follow-up history with each linked task and decision so callers can
// explain why a recommendation is hidden or raised again.
export async function getRecommendationFollowups({
  keys,
  limit = 200,
}: {
  keys?: string[];
  limit?: number;
} = {}): Promise<FollowupsResult> {
  if (!(await requireOwner())) return { available: false, records: [] };

  const supabase = await createClient();
  let query = supabase
    .from("recommendation_followups")
    .select("*, task:tasks(id,status,title,completed_at)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (keys?.length) query = query.in("recommendation_key", keys);

  const { data, error } = await query;
  if (missingTable(error)) return { available: false, records: [] };
  if (error) throw new Error(`Could not load recommendation follow-ups: ${error.message}`);

  const ids = (data ?? []).map((row) => row.id);
  const decisions = ids.length
    ? await supabase
        .from("business_decisions")
        .select("id,status,title,result,reviewed_at,followup_id")
        .in("followup_id", ids)
    : { data: [], error: null };
  if (decisions.error) throw new Error(`Could not load linked decisions: ${decisions.error.message}`);
  const decisionByFollowup = new Map((decisions.data ?? []).map((decision) => [decision.followup_id, decision]));

  return {
    available: true,
    records: (data ?? []).map((row) => ({
      ...row,
      decision: decisionByFollowup.get(row.id) ?? null,
      task: (row.task as FollowupRecord["task"]) ?? null,
    })),
  };
}

// Recomputes today's priorities on the server. Used by Today and by follow-up
// actions so the recorded evidence is never supplied by the browser.
export async function getCurrentDailyPriorities(limit = 20) {
  const owner = await requireOwner();
  if (!owner) return { priorities: [] as DailyPriority[], workboard: null };

  const stores = await getAccessibleStores(owner.profile);
  const [salesStatuses, updateSummary, workboard, coverage] = await Promise.all([
    getStoreSalesStatuses(stores),
    getTodayUpdateSummary(stores),
    getOwnerTaskWorkboard(),
    getSalesCoverage(stores),
  ]);

  return {
    priorities: buildDailyPriorities({
      coverage,
      limit,
      overdueTasks: workboard.overdue,
      salesStatuses,
      stores,
      urgentUpdates: updateSummary.openUrgentCount,
    }),
    workboard,
  };
}

export function assessPriorities(priorities: DailyPriority[], records: FollowupRecord[], today = getIndiaToday()) {
  const latest = latestFollowupByKey(records);
  const assessed: AssessedPriority[] = priorities.map((priority) => ({
    ...priority,
    followup: assessFollowup(priority.signal, latest.get(`priority:${priority.id}`), today),
  }));

  return {
    handled: assessed.filter((priority) => priority.followup.kind === "handled"),
    visible: assessed.filter((priority) => priority.followup.kind !== "handled").slice(0, 5),
  };
}

export async function getOpenTaskChoices(limit = 60) {
  if (!(await requireOwner())) return [] as Array<Pick<TaskWithRelations, "id" | "title" | "due_date"> & { store: string }>;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,due_date,status,stores(name)")
    .not("status", "in", "(done,cancelled)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`Could not load open tasks: ${error.message}`);
  return (data ?? []).map((task) => ({
    due_date: task.due_date,
    id: task.id,
    store: (task.stores as { name?: string } | null)?.name ?? "Owner",
    title: task.title,
  }));
}
