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
const fallbackModels = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];
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

function isModelNotFoundError(status: number) {
  return status === 404;
}

function isRetryableModelError(status: number) {
  // Only retry on 404 (model not found). Do NOT retry on:
  // 400 (bad request), 401/403 (auth/permission), 429 (rate limit), 500+ (server errors)
  return status === 404;
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
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();

  if (!text) {
    return { ok: false as const, status: 0, model };
  }

  return { ok: true as const, text, model };
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
      maxOutputTokens: 700,
      temperature: 0.35,
    },
  };

  // Try configured model first
  const primaryModel = getConfiguredModel();
  const primaryResult = await tryGenerateContent(primaryModel, apiKey, requestBody);

  if (primaryResult.ok) {
    return { text: primaryResult.text, model: primaryResult.model };
  }

  // Only fallback on model-not-found (404), not on auth/safety/other errors
  if (!isRetryableModelError(primaryResult.status)) {
    if (primaryResult.status === 0) {
      throw new Error("Gemini returned an empty response.");
    }
    throw new Error(
      `Gemini request failed (${primaryResult.status}). Check API key and account permissions.`,
    );
  }

  // Try fallback models (skip if same as primary)
  for (const fallbackModel of fallbackModels) {
    if (fallbackModel === primaryModel) continue;

    const fallbackResult = await tryGenerateContent(fallbackModel, apiKey, requestBody);

    if (fallbackResult.ok) {
      return { text: fallbackResult.text, model: fallbackResult.model };
    }

    // Stop fallback chain if error is NOT model-related
    if (!isModelNotFoundError(fallbackResult.status)) {
      throw new Error(
        `Gemini request failed (${fallbackResult.status}). Check API key and account permissions.`,
      );
    }
  }

  throw new Error(
    "Gemini model is unavailable. Run npm run check:gemini and verify GEMINI_MODEL.",
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

  revalidatePath("/app/secretary");
  return { ok: true, message: "Secretary replied." };
}

export async function sendSecretaryPrompt(formData: FormData) {
  await sendSecretaryMessage({ ok: false, message: "" }, formData);
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
