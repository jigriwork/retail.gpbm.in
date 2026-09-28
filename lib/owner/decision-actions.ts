"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { decisionKinds, decisionResults, isoDate, measureTypes } from "@/lib/owner/phase2-shared";
import { createClient } from "@/lib/supabase/server";

export type DecisionActionState = {
  ok: boolean;
  message: string;
};

const denied: DecisionActionState = { ok: false, message: "Only an active owner can change the decision log." };

function value(formData: FormData, key: string, max = 1000) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().slice(0, max) : "";
}

function refresh(id?: string) {
  revalidatePath("/app/owner/decisions");
  if (id) revalidatePath(`/app/owner/decisions/${id}`);
  revalidatePath("/app/owner/review");
  revalidatePath("/app/today");
}

function readDecision(formData: FormData) {
  const kind = value(formData, "kind");
  const measureType = value(formData, "measureType");
  const status = value(formData, "status") || "planned";
  const startDate = isoDate(value(formData, "startDate"));
  const reviewDate = isoDate(value(formData, "reviewDate"));
  const input = {
    brand: value(formData, "brand", 80) || null,
    hypothesis: value(formData, "hypothesis", 800),
    kind,
    measure_filter: value(formData, "measureFilter", 80) || null,
    measure_type: measureType,
    responsible_name: value(formData, "responsibleName", 80),
    responsible_profile_id: value(formData, "responsibleProfileId") || null,
    review_date: reviewDate ?? "",
    start_date: startDate ?? "",
    status,
    store_id: value(formData, "storeId") || null,
    success_measure: value(formData, "successMeasure", 400),
    task_id: value(formData, "taskId") || null,
    title: value(formData, "title", 140),
  };

  if (!input.title) return { error: "Add a short decision title." };
  if (!decisionKinds.some((item) => item.value === kind)) return { error: "Choose what kind of decision this is." };
  if (!input.hypothesis) return { error: "Write the reason or hypothesis: why should this help?" };
  if (!startDate || !reviewDate) return { error: "Choose a start date and a review date." };
  if (reviewDate < startDate) return { error: "The review date must be on or after the start date." };
  if (!measureTypes.some((item) => item.value === measureType)) return { error: "Choose how success will be measured." };
  if ((measureType === "brand_net_sales" || measureType === "category_net_sales") && !input.measure_filter) {
    return { error: "Name the brand or category that the measure should track." };
  }
  if (!input.success_measure) return { error: "Describe what success looks like." };
  if (!["planned", "active", "cancelled"].includes(status)) return { error: "Choose a valid status." };
  if (!input.responsible_profile_id && !input.responsible_name) {
    return { error: "Choose a responsible person or type a name." };
  }
  return { input };
}

export async function saveDecision(_state: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const parsed = readDecision(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? "Check the form." };

  const supabase = await createClient();
  const decisionId = value(formData, "decisionId");

  if (parsed.input.task_id) {
    const { data: task } = await supabase.from("tasks").select("id").eq("id", parsed.input.task_id).maybeSingle();
    if (!task) return { ok: false, message: "The linked task was not found." };
  }

  if (decisionId) {
    const { error } = await supabase
      .from("business_decisions")
      .update({ ...parsed.input, updated_by: owner.profile.id })
      .eq("id", decisionId)
      .in("status", ["planned", "active", "cancelled"]);
    if (error) return { ok: false, message: error.message };
    refresh(decisionId);
    return { ok: true, message: "Decision updated." };
  }

  const followupId = value(formData, "followupId") || null;
  const { data, error } = await supabase
    .from("business_decisions")
    .insert({
      ...parsed.input,
      created_by: owner.profile.id,
      followup_id: followupId,
      updated_by: owner.profile.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, message: "That recommendation already has a decision." };
    return { ok: false, message: error.message };
  }
  refresh(data.id);
  redirect(`/app/owner/decisions/${data.id}?saved=1`);
}

export async function setDecisionStatus(_state: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;
  const decisionId = value(formData, "decisionId");
  const status = value(formData, "status");
  if (!decisionId || !["active", "cancelled", "planned"].includes(status)) {
    return { ok: false, message: "Choose a valid status." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_decisions")
    .update({ status, updated_by: owner.profile.id })
    .eq("id", decisionId)
    .in("status", ["planned", "active", "cancelled"])
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "A reviewed decision keeps its result. Start a new decision instead." };
  refresh(decisionId);
  return { ok: true, message: status === "active" ? "Decision started." : status === "cancelled" ? "Decision cancelled." : "Decision moved back to planned." };
}

export async function reviewDecision(_state: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;
  const decisionId = value(formData, "decisionId");
  const result = value(formData, "result");
  if (!decisionId || !decisionResults.some((item) => item.value === result)) {
    return { ok: false, message: "Choose a result." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_business_decision", {
    p_decision_id: decisionId,
    p_learned: value(formData, "learned"),
    p_result: result,
    p_result_note: value(formData, "resultNote"),
  });
  if (error) return { ok: false, message: error.message };
  refresh(decisionId);
  return { ok: true, message: "Review recorded with the evidence as it stands today." };
}

export async function updateDecisionLearning(_state: DecisionActionState, formData: FormData): Promise<DecisionActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;
  const decisionId = value(formData, "decisionId");
  if (!decisionId) return { ok: false, message: "Decision not found." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("business_decisions")
    .update({ learned: value(formData, "learned"), updated_by: owner.profile.id })
    .eq("id", decisionId);
  if (error) return { ok: false, message: error.message };
  refresh(decisionId);
  return { ok: true, message: "Lesson updated." };
}
