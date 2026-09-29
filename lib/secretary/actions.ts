"use server";

import { revalidatePath } from "next/cache";

import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { buildSecretaryContext, detectReplyLanguage, ownerFirstName, secretarySystemPrompt } from "@/lib/secretary/context";
import { runChatWithTools, speakAsTia, transcribeVoiceNote, type GeminiContent } from "@/lib/secretary/gemini";
import { createTiaExecutor, isTiaActionUndone, tiaTools, type TiaAction } from "@/lib/secretary/tools";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getIndiaToday } from "@/lib/tasks/dates";

export type SecretaryChatState = {
  ok: boolean;
  message: string;
  /** Set when the owner spoke: the client asks for this reply as audio. */
  speakChatId?: string;
  transcript?: string;
};

const maxPromptLength = 1000;
const maxContextLength = 16000;
const historyMessages = 24;
// A pause this long starts a new conversation, so Tia greets again.
const newConversationGapMs = 3 * 60 * 60 * 1000;
const maxAudioBytes = 120 * 1024;
const audioTypes = new Set(["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-m4a"]);

type ChatMetadata = { source?: string; error?: boolean; spoken?: boolean; model?: string; actions?: TiaAction[] };

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function readVoiceNote(formData: FormData) {
  const file = formData.get("audio");
  if (!(file instanceof Blob) || file.size === 0) return null;
  const mimeType = file.type.split(";")[0].toLowerCase();
  if (!audioTypes.has(mimeType)) throw new Error("That recording format is not supported.");
  if (file.size > maxAudioBytes) throw new Error("That voice note is too long. Keep it under 45 seconds.");
  return { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mimeType };
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
  const supabase = await createClient();
  const stores = await getAccessibleStores(profile);
  let prompt = readString(formData, "prompt").slice(0, maxPromptLength);
  let spoken = false;

  try {
    const voiceNote = await readVoiceNote(formData);
    if (voiceNote) {
      prompt = (await transcribeVoiceNote(voiceNote, stores.map((store) => store.name).join(", "))).slice(0, maxPromptLength);
      spoken = true;
      if (!prompt) return { ok: false, message: "I couldn't hear anything. Try again a little closer to the phone." };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not read the voice note." };
  }

  if (!prompt) {
    return { ok: false, message: "Type or say something for Tia." };
  }

  // Earlier conversation, oldest first; failed replies are left out so Tia
  // does not repeat old error text.
  const { data: recent } = await supabase
    .from("ai_chats")
    .select("role,content,created_at,metadata")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(historyMessages);
  const earlier = [...(recent ?? [])].reverse();
  const lastAt = earlier.at(-1)?.created_at;
  const greet = !lastAt || Date.now() - Date.parse(lastAt) > newConversationGapMs;
  const history: GeminiContent[] = [];
  for (const chat of earlier) {
    if (!chat.content || (chat.metadata as ChatMetadata | null)?.error) continue;
    const role = chat.role === "user" ? "user" : "model";
    // Gemini needs alternating turns; merge any repeats.
    if (history.at(-1)?.role === role) history.at(-1)!.parts[0].text += `\n${chat.content}`;
    else history.push({ role, parts: [{ text: chat.content }] });
  }
  if (history[0]?.role === "model") history.shift();
  if (history.at(-1)?.role === "user") history.pop();

  await supabase.from("ai_chats").insert({
    user_id: profile.id,
    role: "user",
    content: prompt,
    metadata: { source: "secretary", spoken } satisfies Json,
  });

  const executor = createTiaExecutor({ profile, stores });
  try {
    const context = await buildSecretaryContext(profile, prompt);
    const system = [
      secretarySystemPrompt({
        greet,
        language: detectReplyLanguage(prompt),
        ownerName: ownerFirstName(profile),
        spoken,
        today: getIndiaToday(),
      }),
      "",
      "Current GPBM Retail snapshot:",
      context.slice(0, maxContextLength),
    ].join("\n");
    // Repeated on the message itself: a long Hinglish history otherwise
    // outweighs the system instruction. Only the owner's words are stored.
    const languageNote = { devanagari: "[हिंदी में जवाब दें]", english: "[Reply in English]", hinglish: "[Reply in Hinglish]" }[
      detectReplyLanguage(prompt)
    ];
    const { model, text } = await runChatWithTools({
      execute: executor.execute,
      history,
      message: `${prompt}\n\n${languageNote}`,
      system,
      tools: tiaTools,
    });

    const { data: saved } = await supabase
      .from("ai_chats")
      .insert({
        user_id: profile.id,
        role: "assistant",
        content: text,
        metadata: { source: "secretary", model, spoken, actions: executor.actions } as unknown as Json,
      })
      .select("id")
      .single();

    revalidatePath("/app/secretary");
    if (executor.actions.length) {
      revalidatePath("/app/today");
      revalidatePath("/app/tasks");
    }
    return { ok: true, message: "Tia replied.", speakChatId: spoken ? saved?.id : undefined, transcript: spoken ? prompt : undefined };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unexpected error contacting Gemini.";
    const userMessage = errorMessage.includes("unavailable") ? errorMessage : `I could not reach Gemini just now. ${errorMessage}`;
    await supabase.from("ai_chats").insert({
      user_id: profile.id,
      role: "assistant",
      content: `${userMessage}\n\nWant to try again in a minute?`,
      metadata: { source: "secretary", error: true, actions: executor.actions } as unknown as Json,
    });
    revalidatePath("/app/secretary");
    return { ok: false, message: userMessage };
  }
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
