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

const geminiModel = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
const maxPromptLength = 600;
const maxContextLength = 14000;

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

async function callGemini(prompt: string, context: string) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const body = {
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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}).`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
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
    const answer = await callGemini(prompt, context);

    await supabase.from("ai_chats").insert({
      user_id: session.profile.id,
      role: "assistant",
      content: answer,
      metadata: { source: "secretary", model: geminiModel } satisfies Json,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? `I could not reach Gemini just now. ${error.message}`
        : "I could not reach Gemini just now.";
    await supabase.from("ai_chats").insert({
      user_id: session.profile.id,
      role: "assistant",
      content: `${message}\n\nWant to try again in a minute?`,
      metadata: { source: "secretary", error: true } satisfies Json,
    });
    revalidatePath("/app/secretary");
    return { ok: false, message };
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
