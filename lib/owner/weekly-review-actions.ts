"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { isoDate, weekStartFor } from "@/lib/owner/phase2-shared";
import { buildWeeklyEvidence } from "@/lib/owner/weekly-review";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

export type WeeklyReviewActionState = {
  ok: boolean;
  message: string;
};

const denied = { ok: false, message: "Only an active owner can save weekly reviews." };

function value(formData: FormData, key: string, max: number) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().slice(0, max) : "";
}

function refresh() {
  revalidatePath("/app/owner/review");
  revalidatePath("/app/today");
}

export async function saveWeeklyReview(
  _state: WeeklyReviewActionState,
  formData: FormData,
): Promise<WeeklyReviewActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const weekStart = isoDate(value(formData, "weekStart", 10));
  const intent = value(formData, "intent", 20);
  if (!weekStart || weekStartFor(weekStart) !== weekStart) return { ok: false, message: "Choose a Monday week start." };
  if (weekStart > weekStartFor(getIndiaToday())) return { ok: false, message: "A future week cannot be reviewed." };
  if (!["save", "complete", "reopen"].includes(intent)) return { ok: false, message: "Choose save, complete or reopen." };

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("weekly_reviews")
    .select("id,status")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (loadError) return { ok: false, message: loadError.message };

  if (intent === "reopen") {
    if (!existing || existing.status !== "completed") return { ok: false, message: "Only a completed review can be reopened." };
    const { error } = await supabase
      .from("weekly_reviews")
      .update({ completed_at: null, completed_by: null, status: "draft", updated_by: owner.profile.id })
      .eq("id", existing.id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, message: "Review reopened. The evidence will refresh on the next save." };
  }

  const conclusion = value(formData, "conclusion", 1500);
  const nextWeekDecisions = value(formData, "nextWeekDecisions", 800);
  if (intent === "complete") {
    if (weekStart >= weekStartFor(getIndiaToday())) {
      return { ok: false, message: "Complete a week's review only after the week has ended." };
    }
    if (!conclusion) return { ok: false, message: "Write a short conclusion before completing the review." };
  }

  const completed = existing?.status === "completed";
  const fields: {
    completed_at?: string | null;
    completed_by?: string | null;
    conclusion: string;
    evidence?: Json;
    evidence_generated_at?: string;
    next_week_decisions: string;
    status?: string;
    updated_by: string;
  } = {
    conclusion,
    next_week_decisions: nextWeekDecisions,
    updated_by: owner.profile.id,
  };

  // Evidence is refreshed while the review is a draft and frozen once completed.
  if (!completed) {
    const evidence = await buildWeeklyEvidence(weekStart);
    if (!evidence) return denied;
    fields.evidence = evidence as unknown as Json;
    fields.evidence_generated_at = evidence.generatedAt;
  }
  if (intent === "complete" && !completed) {
    fields.status = "completed";
    fields.completed_at = new Date().toISOString();
    fields.completed_by = owner.profile.id;
  }

  if (existing) {
    const { error } = await supabase.from("weekly_reviews").update(fields).eq("id", existing.id);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase.from("weekly_reviews").insert({
      ...fields,
      created_by: owner.profile.id,
      week_end: addDays(weekStart, 6),
      week_start: weekStart,
    });
    if (error) {
      // The other owner saved the same week at the same moment.
      if (error.code === "23505") return { ok: false, message: "The other owner just saved this week. Reload to see it." };
      return { ok: false, message: error.message };
    }
  }

  refresh();
  if (intent === "complete") return { ok: true, message: "Weekly review completed. Evidence is now frozen as shown." };
  return { ok: true, message: completed ? "Conclusion updated. The evidence stays as it was when completed." : "Draft saved with today's evidence." };
}
