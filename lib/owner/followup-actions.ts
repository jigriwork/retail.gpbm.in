"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { getCurrentDailyPriorities, getRecommendationFollowups } from "@/lib/owner/followups";
import type { PrioritySignal } from "@/lib/owner/phase2-shared";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type FollowupActionState = {
  ok: boolean;
  message: string;
  taskId?: string;
};

const denied: FollowupActionState = { ok: false, message: "Only an active owner can record follow-ups." };
const intents = ["accept", "create_task", "decision", "dismiss", "link_task", "review"] as const;
type Intent = (typeof intents)[number];

type FollowupInput = {
  chatId: string | null;
  evidence: string;
  key: string;
  signal: PrioritySignal | Record<string, never>;
  source: "daily_priority" | "secretary";
  title: string;
};

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function refresh() {
  revalidatePath("/app/today");
  revalidatePath("/app/owner/follow-ups");
  revalidatePath("/app/owner/review");
  revalidatePath("/app/tasks");
}

async function recordFollowup(input: FollowupInput, intent: Intent, formData: FormData, ownerId: string) {
  const supabase = await createClient();
  const base = {
    created_by: ownerId,
    evidence_text: input.evidence.slice(0, 1500),
    recommendation_key: input.key,
    signal: input.signal as Json,
    source: input.source,
    source_chat_id: input.chatId,
    title: input.title.slice(0, 160),
  };

  if (intent === "create_task") {
    const { data, error } = await supabase.rpc("create_followup_task", {
      p_evidence: input.evidence.slice(0, 1500),
      p_key: input.key,
      p_signal: input.signal as Json,
      p_source: input.source,
      p_source_chat_id: input.chatId ?? undefined,
      p_title: input.title.slice(0, 160),
    });
    if (error) return { ok: false, message: error.message };
    refresh();
    return {
      ok: true,
      message: "Linked to one private owner task. Repeating this never creates a second open task.",
      taskId: data ?? undefined,
    };
  }

  if (intent === "link_task") {
    const taskId = value(formData, "taskId");
    if (!taskId) return { ok: false, message: "Choose an existing task to link." };
    const { data: task, error: taskError } = await supabase.from("tasks").select("id,status").eq("id", taskId).maybeSingle();
    if (taskError || !task) return { ok: false, message: "That task was not found." };
    const { error } = await supabase.from("recommendation_followups").insert({ ...base, status: "converted", task_id: task.id });
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, message: "Linked to the existing task. No new task was created.", taskId: task.id };
  }

  if (intent === "dismiss") {
    const reason = value(formData, "reason").slice(0, 600);
    if (!reason) return { ok: false, message: "Add a short reason for dismissing it." };
    const { error } = await supabase.from("recommendation_followups").insert({ ...base, reason, status: "dismissed" });
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, message: "Dismissed. It returns only if the evidence changes materially or after 14 days." };
  }

  if (intent === "review") {
    const outcome = value(formData, "outcome").slice(0, 600);
    if (!outcome) return { ok: false, message: "Write what happened before marking it reviewed." };
    const { error } = await supabase.from("recommendation_followups").insert({ ...base, outcome, status: "reviewed" });
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, message: "Outcome recorded. It will appear in the weekly review." };
  }

  // accept or decision
  const existing = await getRecommendationFollowups({ keys: [input.key], limit: 5 });
  const latest = existing.records[0];
  if (intent === "decision" && latest?.decision && ["planned", "active"].includes(latest.decision.status)) {
    return { ok: false, message: `Already being tested as decision “${latest.decision.title}”.` };
  }
  const { data, error } = await supabase
    .from("recommendation_followups")
    .insert({ ...base, status: "accepted" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "Could not record the follow-up." };
  refresh();
  if (intent === "decision") redirect(`/app/owner/decisions/new?followup=${data.id}`);
  return { ok: true, message: "Accepted. Link a task or decision within 7 days, or it will be raised again." };
}

function readIntent(formData: FormData): Intent | null {
  const intent = value(formData, "intent");
  return (intents as readonly string[]).includes(intent) ? (intent as Intent) : null;
}

export async function recordPriorityFollowup(
  _state: FollowupActionState,
  formData: FormData,
): Promise<FollowupActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;
  const intent = readIntent(formData);
  if (!intent) return { ok: false, message: "Choose what to do with this priority." };

  const priorityId = value(formData, "priorityId");
  const { priorities } = await getCurrentDailyPriorities();
  const priority = priorities.find((item) => item.id === priorityId);
  if (!priority) {
    return { ok: false, message: "This priority is no longer present today, so nothing was recorded." };
  }

  return recordFollowup(
    {
      chatId: null,
      evidence: `${priority.evidence} (evidence date: ${priority.evidenceDate})`,
      key: `priority:${priority.id}`,
      signal: priority.signal,
      source: "daily_priority",
      title: priority.title,
    },
    intent,
    formData,
    owner.profile.id,
  );
}

export async function recordSecretaryFollowup(
  _state: FollowupActionState,
  formData: FormData,
): Promise<FollowupActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;
  const intent = readIntent(formData);
  if (!intent) return { ok: false, message: "Choose what to do with this recommendation." };

  const chatId = value(formData, "chatId");
  const title = value(formData, "title").slice(0, 160);
  const excerpt = value(formData, "excerpt").slice(0, 1500);
  if (!chatId || !title) return { ok: false, message: "Add a short title for this recommendation." };

  const supabase = await createClient();
  // Secretary history is private: only the owner who received the answer can follow it up.
  const { data: chat } = await supabase
    .from("ai_chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", owner.profile.id)
    .eq("role", "assistant")
    .maybeSingle();
  if (!chat) return { ok: false, message: "That Secretary answer was not found in your own history." };

  return recordFollowup(
    { chatId, evidence: excerpt, key: `secretary:${chatId}`, signal: {}, source: "secretary", title },
    intent,
    formData,
    owner.profile.id,
  );
}
