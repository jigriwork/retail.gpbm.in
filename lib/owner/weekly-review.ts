import "server-only";

import { getAccessibleStores, requireOwner, type Store } from "@/lib/auth/session";
import { phase1AnalyticsRpc } from "@/lib/analytics/phase1";
import { getDecisions } from "@/lib/owner/decisions";
import { getRecommendationFollowups } from "@/lib/owner/followups";
import { datesInRange, daysBetween } from "@/lib/owner/phase2-shared";
import {
  deriveWeeklyReview,
  type ReviewDecision,
  type StoreWeekFacts,
  type WeekSales,
  type WeeklyEvidence,
} from "@/lib/owner/weekly-review-rules";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { completeQuery } from "@/lib/supabase/complete-query";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";
import { getTasksForProfile } from "@/lib/tasks/queries";

export type WeeklyReviewRow = Tables<"weekly_reviews"> & {
  completed_profile: { full_name: string | null; email: string | null } | null;
  updated_profile: { full_name: string | null; email: string | null } | null;
};

function missingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("weekly_reviews")),
  );
}

function indiaStart(date: string) {
  return `${date}T00:00:00+05:30`;
}

function inWeek(timestamp: string | null | undefined, start: string, end: string) {
  if (!timestamp) return false;
  const value = Date.parse(timestamp);
  return value >= Date.parse(indiaStart(start)) && value < Date.parse(indiaStart(addDays(end, 1)));
}

async function loadWeekSales(store: Store, start: string, end: string): Promise<WeekSales> {
  const payload = (await phase1AnalyticsRpc("sales_analytics_summary_v2", {
    p_end: end,
    p_start: start,
    p_store_ids: [store.id],
    p_top_limit: 25,
  })) as Record<string, unknown>;
  const summary = (payload.summary ?? {}) as Record<string, unknown>;
  const loaded = new Set(
    (Array.isArray(payload.daily_trend) ? payload.daily_trend : [])
      .map((row) => (row && typeof row === "object" ? String((row as Record<string, unknown>).date ?? "") : ""))
      .filter(Boolean),
  );
  const brands = Array.isArray(payload.top_brands) ? (payload.top_brands as Array<Record<string, unknown>>) : [];
  const mitty = brands.find((brand) => /\bmitty\b/i.test(String(brand.name ?? "")));
  const dates = datesInRange(start, end);
  return {
    bills: Number(summary.bill_count ?? 0),
    daysLoaded: dates.filter((date) => loaded.has(date)).length,
    missingDates: dates.filter((date) => !loaded.has(date)),
    mittyNetSale: mitty ? Number(mitty.total_sale ?? 0) : null,
    netSale: Number(summary.total_net_sale ?? 0),
  };
}

export async function buildWeeklyEvidence(weekStart: string): Promise<WeeklyEvidence | null> {
  const owner = await requireOwner();
  if (!owner) return null;

  const today = getIndiaToday();
  const weekEnd = addDays(weekStart, 6);
  const previousStart = addDays(weekStart, -7);
  const previousEnd = addDays(weekStart, -1);
  const inProgress = weekEnd >= today;
  const salesEnd = inProgress ? addDays(today, -1) : weekEnd;
  const stores = await getAccessibleStores(owner.profile);
  const storeIds = stores.map((store) => store.id);
  const supabase = await createClient();

  const [salesStatuses, rack, cleaning, updates, openUrgent, tasks, decisions, followups] = await Promise.all([
    getStoreSalesStatuses(stores),
    completeQuery(
      supabase
        .from("rack_reviews")
        .select("store_id,review_date", { count: "exact" })
        .in("store_id", storeIds)
        .gte("review_date", previousStart)
        .lte("review_date", weekEnd)
        .order("review_date"),
    ),
    completeQuery(
      supabase
        .from("cleaning_reviews")
        .select("store_id,review_date", { count: "exact" })
        .in("store_id", storeIds)
        .gte("review_date", previousStart)
        .lte("review_date", weekEnd)
        .order("review_date"),
    ),
    completeQuery(
      supabase
        .from("manager_updates")
        .select("id,store_id,urgency,status,created_at,updated_at", { count: "exact" })
        .in("store_id", storeIds)
        .gte("created_at", indiaStart(weekStart))
        .lt("created_at", indiaStart(addDays(weekEnd, 1)))
        .order("created_at"),
    ),
    completeQuery(
      supabase
        .from("manager_updates")
        .select("id,store_id,created_at", { count: "exact" })
        .in("store_id", storeIds)
        .eq("urgency", "urgent")
        .or("status.is.null,status.eq.open,status.eq.in_progress")
        .order("created_at"),
    ),
    getTasksForProfile(),
    getDecisions(),
    getRecommendationFollowups({ limit: 300 }),
  ]);

  const storeFacts: StoreWeekFacts[] = await Promise.all(
    stores.map(async (store) => {
      const status = salesStatuses.find((item) => item.store.id === store.id);
      const facts: StoreWeekFacts = {
        code: store.code,
        id: store.id,
        latestSalesDate: status?.latestReport?.report_date ?? null,
        name: store.name,
        previous: null,
        routines: {
          cleaningDays: new Set(cleaning.data?.filter((row) => row.store_id === store.id && row.review_date && row.review_date >= weekStart).map((row) => row.review_date)).size,
          previousCleaningDays: new Set(cleaning.data?.filter((row) => row.store_id === store.id && row.review_date && row.review_date <= previousEnd).map((row) => row.review_date)).size,
          previousRackDays: new Set(rack.data?.filter((row) => row.store_id === store.id && row.review_date && row.review_date <= previousEnd).map((row) => row.review_date)).size,
          rackDays: new Set(rack.data?.filter((row) => row.store_id === store.id && row.review_date && row.review_date >= weekStart).map((row) => row.review_date)).size,
          updateDays: new Set(
            (updates.data ?? [])
              .filter((row) => row.store_id === store.id && row.created_at)
              .map((row) => new Date(row.created_at as string).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })),
          ).size,
        },
        sales: null,
        unmatchedStaffNames: Number(status?.latestReport?.summary?.unmatchedStaffCount ?? 0),
        urgent: {
          openedThisWeek: (updates.data ?? []).filter((row) => row.store_id === store.id && row.urgency === "urgent").length,
          openOlderThanTwoDays: (openUrgent.data ?? []).filter(
            (row) => row.store_id === store.id && row.created_at && daysBetween(row.created_at.slice(0, 10), today) > 2,
          ).length,
          resolvedThisWeek: (updates.data ?? []).filter(
            (row) => row.store_id === store.id && row.urgency === "urgent" && row.status === "resolved",
          ).length,
        },
      };
      if (salesEnd < weekStart) return facts;
      try {
        const [sales, previous] = await Promise.all([
          loadWeekSales(store, weekStart, salesEnd),
          loadWeekSales(store, previousStart, previousEnd),
        ]);
        facts.sales = sales;
        facts.previous = previous;
      } catch (error) {
        facts.salesError = error instanceof Error ? error.message : "unavailable";
      }
      return facts;
    }),
  );

  const weekEndCutoff = Date.parse(indiaStart(addDays(weekEnd, 1)));
  const stuckCutoff = addDays(weekEnd, -7);
  const stuck = tasks
    .filter(
      (task) =>
        task.status !== "cancelled" &&
        task.due_date &&
        task.due_date <= stuckCutoff &&
        (task.status !== "done" || (task.completed_at && Date.parse(task.completed_at) >= weekEndCutoff)) &&
        (!task.created_at || Date.parse(task.created_at) < weekEndCutoff),
    )
    .map((task) => ({
      days: daysBetween(task.due_date as string, weekEnd),
      due_date: task.due_date,
      id: task.id,
      store: task.stores?.name ?? null,
      title: task.title,
    }))
    .sort((left, right) => (right.days ?? 0) - (left.days ?? 0));
  const completed = tasks
    .filter((task) => task.status === "done" && inWeek(task.completed_at, weekStart, weekEnd))
    .sort((left, right) => String(right.completed_at).localeCompare(String(left.completed_at)));

  const decisionRows = decisions.decisions;
  const toReviewDecision = (decision: (typeof decisionRows)[number]): ReviewDecision => ({
    change_ratio:
      decision.evidence && typeof decision.evidence === "object" && !Array.isArray(decision.evidence)
        ? Number((decision.evidence as Record<string, unknown>).change_ratio ?? NaN)
        : null,
    evidence_basis: decision.evidence_basis,
    id: decision.id,
    result: decision.result,
    review_date: decision.review_date,
    start_date: decision.start_date,
    status: decision.status,
    store: decision.store?.name ?? "Both stores",
    title: decision.title,
    verdict:
      decision.evidence && typeof decision.evidence === "object" && !Array.isArray(decision.evidence)
        ? String((decision.evidence as Record<string, unknown>).verdict ?? "")
        : null,
  });

  const followupRecords = followups.records;
  const facts = {
    decisions: {
      dueNextWeek: decisionRows
        .filter((decision) => ["planned", "active"].includes(decision.status) && decision.review_date <= addDays(weekEnd, 7))
        .map(toReviewDecision)
        .slice(0, 8),
      reviewedThisWeek: decisionRows.filter((decision) => inWeek(decision.reviewed_at, weekStart, weekEnd)).map(toReviewDecision),
      tried: decisionRows
        .filter(
          (decision) =>
            decision.status !== "cancelled" &&
            decision.start_date <= weekEnd &&
            (!decision.reviewed_at || Date.parse(decision.reviewed_at) >= Date.parse(indiaStart(weekStart))),
        )
        .map(toReviewDecision)
        .slice(0, 10),
    },
    followups: {
      acceptedUnlinked: followupRecords
        .filter(
          (record, index, all) =>
            record.status === "accepted" &&
            !record.decision &&
            all.findIndex((item) => item.recommendation_key === record.recommendation_key) === index &&
            daysBetween(record.created_at.slice(0, 10), today) > 7,
        )
        .map((record) => ({ created_at: record.created_at, id: record.id, note: "", status: record.status, title: record.title })),
      thisWeek: followupRecords
        .filter((record) => inWeek(record.created_at, weekStart, weekEnd))
        .map((record) => ({
          created_at: record.created_at,
          id: record.id,
          note: record.reason || record.outcome || "",
          status: record.status,
          task_id: record.task_id,
          title: record.title,
        }))
        .slice(0, 12),
    },
    generatedAt: new Date().toISOString(),
    inProgress,
    stores: storeFacts,
    tasks: {
      completed: completed.slice(0, 6).map((task) => ({ id: task.id, store: task.stores?.name ?? null, title: task.title })),
      completedCount: completed.length,
      createdCount: tasks.filter((task) => inWeek(task.created_at, weekStart, weekEnd)).length,
      previousCompletedCount: tasks.filter((task) => task.status === "done" && inWeek(task.completed_at, previousStart, previousEnd)).length,
      stuck: stuck.slice(0, 8),
      stuckCount: stuck.length,
    },
    weekEnd,
    weekStart,
  };

  return deriveWeeklyReview(facts);
}

export async function getWeeklyReview(weekStart: string) {
  if (!(await requireOwner())) return { available: false, review: null as WeeklyReviewRow | null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select(
      "*, completed_profile:profiles!weekly_reviews_completed_by_fkey(full_name,email), updated_profile:profiles!weekly_reviews_updated_by_fkey(full_name,email)",
    )
    .eq("week_start", weekStart)
    .maybeSingle();
  if (missingTable(error)) return { available: false, review: null };
  if (error) throw new Error(`Could not load the weekly review: ${error.message}`);
  return { available: true, review: (data as unknown as WeeklyReviewRow | null) ?? null };
}

export async function getWeeklyReviewHistory(limit = 16) {
  if (!(await requireOwner())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select("id,week_start,week_end,status,conclusion,next_week_decisions,completed_at,updated_at")
    .order("week_start", { ascending: false })
    .limit(limit);
  if (missingTable(error)) return [];
  if (error) throw new Error(`Could not load past weekly reviews: ${error.message}`);
  return data ?? [];
}
