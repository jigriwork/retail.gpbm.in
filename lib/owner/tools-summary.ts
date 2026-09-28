import "server-only";

import { requireOwner } from "@/lib/auth/session";
import { lastCompletedWeekStart } from "@/lib/owner/phase2-shared";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday } from "@/lib/tasks/dates";

export type OwnerToolsSummary = {
  available: boolean;
  decisionsDue: number;
  decisionsRunning: number;
  lastWeekStart: string;
  lastWeekStatus: "completed" | "draft" | "missing";
  sopCount: number;
};

// Small counts for the Today strip; the full tools live on their own pages.
export async function getOwnerToolsSummary(): Promise<OwnerToolsSummary> {
  const today = getIndiaToday();
  const lastWeekStart = lastCompletedWeekStart(today);
  const empty: OwnerToolsSummary = {
    available: false,
    decisionsDue: 0,
    decisionsRunning: 0,
    lastWeekStart,
    lastWeekStatus: "missing",
    sopCount: 0,
  };
  if (!(await requireOwner())) return empty;

  const supabase = await createClient();
  const [review, decisions, sops] = await Promise.all([
    supabase.from("weekly_reviews").select("status").eq("week_start", lastWeekStart).maybeSingle(),
    supabase.from("business_decisions").select("id,review_date").in("status", ["planned", "active"]).limit(500),
    supabase.from("sops").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  if (review.error || decisions.error || sops.error) return empty;

  return {
    available: true,
    decisionsDue: (decisions.data ?? []).filter((decision) => decision.review_date <= today).length,
    decisionsRunning: (decisions.data ?? []).filter((decision) => decision.review_date > today).length,
    lastWeekStart,
    lastWeekStatus: review.data?.status === "completed" ? "completed" : review.data ? "draft" : "missing",
    sopCount: sops.count ?? 0,
  };
}
