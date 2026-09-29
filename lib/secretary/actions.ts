"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { buildSecretaryContext, secretarySystemPrompt } from "@/lib/secretary/context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type SecretaryChatState = {
  ok: boolean;
  message: string;
};

const defaultModel = "gemini-2.5-flash";
// gemini-2.5-flash-lite and gemini-2.0-flash were retired by Google (404).
const fallbackModels = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.5-flash"];
const maxPromptLength = 600;
const maxContextLength = 14000;

function getConfiguredModel() {
  return process.env.GEMINI_MODEL || defaultModel;
}

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isMemoryPrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  return lower.includes("remember") || lower.includes("save this") || lower.includes("note this");
}

function memoryTitle(prompt: string) {
  return prompt.replace(/^(remember|save this|note this)[:\s-]*/i, "").slice(0, 60) || "Secretary note";
}

function isRetryableModelError(status: number) {
  // Try the next model when this one is missing (404), rate limited (429),
  // overloaded (5xx) or returned no text (0). Do NOT retry on 400 (bad request)
  // or 401/403 (auth/permission): another model will fail the same way.
  return status === 0 || status === 404 || status === 429 || status >= 500;
}

async function tryGenerateContent(model: string, apiKey: string, requestBody: object) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      body: JSON.stringify(requestBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    return { ok: false as const, status: response.status, model };
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    return { ok: false as const, status: 0, model };
  }

  return {
    ok: true as const,
    text: candidate?.finishReason === "MAX_TOKENS" ? `${text}…\n\n(Answer was cut short — ask a narrower question for more detail.)` : text,
    model,
  };
}

async function callGemini(prompt: string, context: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              secretarySystemPrompt(),
              "",
              "Compact GPBM Retail context:",
              context.slice(0, maxContextLength),
              "",
              "Owner question:",
              prompt,
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      // Gemini 2.5+ "thinks" by default and those hidden tokens count against
      // maxOutputTokens: with a 700 budget ~670 went to thinking, so replies
      // arrived cut after one sentence or empty. The Secretary summarises
      // prepared context, so thinking is off and the whole budget is the answer.
      maxOutputTokens: 1500,
      temperature: 0.35,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  // Try configured model first
  const primaryModel = getConfiguredModel();
  const primaryResult = await tryGenerateContent(primaryModel, apiKey, requestBody);

  if (primaryResult.ok) {
    return { text: primaryResult.text, model: primaryResult.model };
  }

  let lastStatus = primaryResult.status;

  // Try fallback models (skip if same as primary) unless the error is auth/request-related.
  for (const fallbackModel of fallbackModels) {
    if (!isRetryableModelError(lastStatus)) break;
    if (fallbackModel === primaryModel) continue;

    const fallbackResult = await tryGenerateContent(fallbackModel, apiKey, requestBody);

    if (fallbackResult.ok) {
      return { text: fallbackResult.text, model: fallbackResult.model };
    }

    lastStatus = fallbackResult.status;
  }

  if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) {
    throw new Error(`Gemini request failed (${lastStatus}). Check API key and account permissions.`);
  }

  if (lastStatus === 429 || lastStatus >= 500) {
    throw new Error(`Gemini is busy right now (${lastStatus}).`);
  }

  throw new Error(
    lastStatus === 0
      ? "Gemini returned an empty response."
      : "Gemini model is unavailable. Run npm run check:gemini and verify GEMINI_MODEL.",
  );
}

export async function sendSecretaryMessage(
  _previous: SecretaryChatState,
  formData: FormData,
): Promise<SecretaryChatState> {
  const session = await requireOwner();

  if (!session?.profile) {
    return { ok: false, message: "AI Secretary is owner-only in this version." };
  }

  const prompt = readString(formData, "prompt").slice(0, maxPromptLength);

  if (!prompt) {
    return { ok: false, message: "Type a question for the AI Secretary." };
  }

  const supabase = await createClient();
  await supabase.from("ai_chats").insert({
    user_id: session.profile.id,
    role: "user",
    content: prompt,
    metadata: { source: "secretary" } satisfies Json,
  });

  if (isMemoryPrompt(prompt)) {
    await supabase.from("ai_memories").insert({
      user_id: session.profile.id,
      title: memoryTitle(prompt),
      content: prompt,
      memory_type: "owner_note",
      importance: 3,
      is_active: true,
    });
  }

  try {
    const context = await buildSecretaryContext(session.profile, prompt);
    const { text: answer, model: usedModel } = await callGemini(prompt, context);

    await supabase.from("ai_chats").insert({
      user_id: session.profile.id,
      role: "assistant",
      content: answer,
      metadata: { source: "secretary", model: usedModel } satisfies Json,
    });

    revalidatePath("/app/secretary");
    return { ok: true, message: "Secretary replied." };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unexpected error contacting Gemini.";
    const userMessage = errorMessage.includes("unavailable")
      ? errorMessage
      : `I could not reach Gemini just now. ${errorMessage}`;
    await supabase.from("ai_chats").insert({
      user_id: session.profile.id,
      role: "assistant",
      content: `${userMessage}\n\nWant to try again in a minute?`,
      metadata: { source: "secretary", error: true } satisfies Json,
    });
    revalidatePath("/app/secretary");
    return { ok: false, message: userMessage };
  }
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
