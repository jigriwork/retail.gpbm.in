import "server-only";

import type { Profile, Store } from "@/lib/auth/session";
import { buildSecretaryContext, detectReplyLanguage, ownerFirstName, secretarySystemPrompt } from "@/lib/secretary/context";
import { runChatWithTools, streamChatWithTools, transcribeVoiceNote, type GeminiContent } from "@/lib/secretary/gemini";
import { createTiaExecutor, tiaTools, type TiaAction } from "@/lib/secretary/tools";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getIndiaToday } from "@/lib/tasks/dates";

// One question to Tia and her answer: read the question (typed or a voice
// note), load the conversation, call Gemini with tools, save both messages.
// Shared by the streaming endpoint and the form action.

const maxPromptLength = 1000;
const maxContextLength = 16000;
const historyMessages = 24;
// A pause this long starts a new conversation, so Tia greets again.
const newConversationGapMs = 3 * 60 * 60 * 1000;
const maxAudioBytes = 120 * 1024;
const audioTypes = new Set(["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-m4a"]);

type ChatMetadata = { source?: string; error?: boolean; spoken?: boolean; model?: string; actions?: TiaAction[] };

export type TiaQuestion = { ok: true; prompt: string; spoken: boolean } | { ok: false; message: string };

export type TiaTurnResult =
  | { ok: true; chatId: string | null; text: string; actions: TiaAction[] }
  | { ok: false; message: string; actions: TiaAction[] };

async function readVoiceNote(formData: FormData) {
  const file = formData.get("audio");
  if (!(file instanceof Blob) || file.size === 0) return null;
  const mimeType = file.type.split(";")[0].toLowerCase();
  if (!audioTypes.has(mimeType)) throw new Error("That recording format is not supported.");
  if (file.size > maxAudioBytes) throw new Error("That voice note is too long. Keep it under 45 seconds.");
  return { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mimeType };
}

export async function readTiaQuestion(formData: FormData, stores: Store[]): Promise<TiaQuestion> {
  const typed = formData.get("prompt");
  let prompt = typeof typed === "string" ? typed.trim().slice(0, maxPromptLength) : "";
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

  if (!prompt) return { ok: false, message: "Type or say something for Tia." };
  return { ok: true, prompt, spoken };
}

export async function runTiaTurn({
  onText,
  onTool,
  profile,
  prompt,
  signal,
  spoken,
  stores,
}: {
  /** When set, the answer is streamed through this as Gemini writes it. */
  onText?: (text: string) => void;
  /** Called as Tia starts using a tool, so the chat can say what she is doing. */
  onTool?: (name: string) => void;
  profile: Profile;
  prompt: string;
  signal?: AbortSignal;
  spoken: boolean;
  stores: Store[];
}): Promise<TiaTurnResult> {
  const supabase = await createClient();

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

  const executor = createTiaExecutor({ profile, stores });
  // Saved while the context loads (.then starts the query); awaited before
  // the answer is saved so the question always comes first.
  const savingQuestion = supabase
    .from("ai_chats")
    .insert({ user_id: profile.id, role: "user", content: prompt, metadata: { source: "secretary", spoken } satisfies Json })
    .then((result) => result);

  let streamed = "";
  try {
    const context = await buildSecretaryContext(profile, prompt);
    const language = detectReplyLanguage(prompt);
    const system = [
      secretarySystemPrompt({ greet, language, ownerName: ownerFirstName(profile), spoken, today: getIndiaToday() }),
      "",
      "Current GPBM Retail snapshot:",
      context.slice(0, maxContextLength),
    ].join("\n");
    // Repeated on the message itself: a long Hinglish history otherwise
    // outweighs the system instruction. Only the owner's words are stored.
    const languageNote = { devanagari: "[हिंदी में जवाब दें]", english: "[Reply in English]", hinglish: "[Reply in Hinglish]" }[language];
    const execute = (name: string, args: Record<string, unknown>) => {
      onTool?.(name);
      return executor.execute(name, args);
    };
    const request = { execute, history, message: `${prompt}\n\n${languageNote}`, system, tools: tiaTools };

    let reply: { model: string; text: string };
    if (onText) {
      try {
        reply = await streamChatWithTools({
          ...request,
          onText: (text) => {
            streamed += text;
            onText(text);
          },
          signal,
        });
      } catch (error) {
        // Nothing shown yet: fall back to the plain request once.
        if (streamed || signal?.aborted) throw error;
        reply = await runChatWithTools(request);
        onText(reply.text);
        streamed = reply.text;
      }
    } else {
      reply = await runChatWithTools(request);
    }

    await savingQuestion;
    const { data: saved } = await supabase
      .from("ai_chats")
      .insert({
        user_id: profile.id,
        role: "assistant",
        content: reply.text,
        metadata: { source: "secretary", model: reply.model, spoken, actions: executor.actions } as unknown as Json,
      })
      .select("id")
      .single();
    return { ok: true, chatId: saved?.id ?? null, text: reply.text, actions: executor.actions };
  } catch (error) {
    // Stopped by the owner part-way: keep what was already written.
    if (signal?.aborted && streamed.trim()) {
      await savingQuestion;
      const { data: saved } = await supabase
        .from("ai_chats")
        .insert({
          user_id: profile.id,
          role: "assistant",
          content: streamed.trim(),
          metadata: { source: "secretary", spoken, actions: executor.actions } as unknown as Json,
        })
        .select("id")
        .single();
      return { ok: true, chatId: saved?.id ?? null, text: streamed.trim(), actions: executor.actions };
    }
    const errorMessage = error instanceof Error ? error.message : "Unexpected error contacting Gemini.";
    const userMessage = errorMessage.includes("unavailable") ? errorMessage : `I could not reach Gemini just now. ${errorMessage}`;
    await savingQuestion;
    await supabase.from("ai_chats").insert({
      user_id: profile.id,
      role: "assistant",
      content: `${userMessage}\n\nWant to try again in a minute?`,
      metadata: { source: "secretary", error: true, actions: executor.actions } as unknown as Json,
    });
    return { ok: false, message: userMessage, actions: executor.actions };
  }
}
