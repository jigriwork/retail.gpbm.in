"use server";

import { revalidatePath } from "next/cache";

import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { speakAsTia } from "@/lib/secretary/gemini";
import { isTiaActionUndone, type TiaAction } from "@/lib/secretary/tools";
import { readTiaQuestion, runTiaTurn } from "@/lib/secretary/turn";
import { createClient } from "@/lib/supabase/server";

export type SecretaryChatState = {
  ok: boolean;
  message: string;
  /** Set when the owner spoke: the client asks for this reply as audio. */
  speakChatId?: string;
  transcript?: string;
};

type ChatMetadata = { actions?: TiaAction[] };

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function sendSecretaryMessage(
  _previous: SecretaryChatState,
  formData: FormData,
): Promise<SecretaryChatState> {
  const session = await requireOwner();

  if (!session?.profile) {
    return { ok: false, message: "Tia is available to owners only." };
  }

  const profile = session.profile;
  const stores = await getAccessibleStores(profile);
  const question = await readTiaQuestion(formData, stores);
  if (!question.ok) return { ok: false, message: question.message };

  const result = await runTiaTurn({ profile, prompt: question.prompt, spoken: question.spoken, stores });
  revalidatePath("/app/secretary");
  if (result.actions.length) {
    revalidatePath("/app/today");
    revalidatePath("/app/tasks");
  }
  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    message: "Tia replied.",
    speakChatId: question.spoken ? (result.chatId ?? undefined) : undefined,
    transcript: question.spoken ? question.prompt : undefined,
  };
}

function speakableText(text: string) {
  const plain = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[*-]\s+/gm, "")
    .replace(/\[id:[^\]]+\]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (plain.length <= 700) return plain;
  // Long written answers: read the opening and point to the screen.
  const cut = plain.slice(0, 700);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf("\n"));
  return `${cut.slice(0, end > 200 ? end + 1 : 700)} The rest is on your screen.`;
}

/** Returns Tia's reply as WAV audio (base64) in her voice. */
export async function speakSecretaryReply(chatId: string): Promise<{ ok: boolean; audio?: string; text?: string; message?: string }> {
  const session = await requireOwner();
  if (!session?.profile) return { ok: false, message: "Tia is available to owners only." };

  const supabase = await createClient();
  const { data: chat } = await supabase
    .from("ai_chats")
    .select("content,role")
    .eq("id", chatId)
    .eq("user_id", session.profile.id)
    .maybeSingle();
  if (!chat?.content || chat.role !== "assistant") return { ok: false, message: "Reply not found." };

  const text = speakableText(chat.content);
  try {
    return { ok: true, audio: (await speakAsTia(text)).toString("base64"), text };
  } catch (error) {
    // The client falls back to the phone's own Indian voice with this text.
    return { ok: false, text, message: error instanceof Error ? error.message : "Could not create audio." };
  }
}

/** Reverses one change Tia made (tick, add or reschedule). */
export async function undoSecretaryAction(chatId: string, index: number): Promise<{ ok: boolean; message: string }> {
  const session = await requireOwner();
  if (!session?.profile) return { ok: false, message: "Tia is available to owners only." };

  const supabase = await createClient();
  const { data: chat } = await supabase
    .from("ai_chats")
    .select("metadata")
    .eq("id", chatId)
    .eq("user_id", session.profile.id)
    .maybeSingle();
  const action = ((chat?.metadata ?? {}) as ChatMetadata).actions?.[index];
  if (!chat || !action) return { ok: false, message: "Nothing to undo." };

  const { data: task } = await supabase.from("tasks").select("status,due_date").eq("id", action.taskId).maybeSingle();
  if (isTiaActionUndone(action, task)) return { ok: true, message: "Already undone." };

  const change =
    action.kind === "added"
      ? { status: "cancelled", completed_at: null }
      : action.kind === "completed"
        ? { status: action.previous?.status ?? "pending", completed_at: action.previous?.completed_at ?? null }
        : { due_date: action.previous?.due_date ?? null };
  const { error } = await supabase.from("tasks").update(change).eq("id", action.taskId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/app/secretary");
  revalidatePath("/app/today");
  revalidatePath("/app/tasks");
  return { ok: true, message: "Undone." };
}

export async function deactivateMemory(formData: FormData) {
  const session = await requireOwner();

  if (!session?.profile) return;

  const memoryId = readString(formData, "memoryId");
  if (!memoryId) return;

  const supabase = await createClient();
  await supabase
    .from("ai_memories")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", memoryId)
    .eq("user_id", session.profile.id);
  revalidatePath("/app/secretary");
}
