import "server-only";

// Gemini REST calls for Tia: chat with tool use, voice-note transcription and
// text-to-speech. Kept free of Supabase so the retry/fallback rules live in one place.

const apiBase = "https://generativelanguage.googleapis.com/v1beta/models";
const defaultChatModel = "gemini-2.5-flash";
// gemini-2.5-flash-lite and gemini-2.0-flash were retired by Google (404).
const chatFallbackModels = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.5-flash"];
// 3.8 Flash TTS is the fastest natural voice; the Lite TTS model reads style
// instructions aloud, so it is deliberately not used.
const speechModels = ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts"];
const maxToolRounds = 5;
// A hung model call moves on to the next model instead of using up the whole
// request time; long enough for a full answer or a spoken reply.
const requestTimeoutMs = 25_000;

export type GeminiPart = {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters?: {
    type: "OBJECT";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
};

type Candidate = { content?: { role?: string; parts?: GeminiPart[] }; finishReason?: string };

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key is not configured.");
  return key;
}

function isRetryableStatus(status: number) {
  // Try the next model when this one is missing (404), rate limited (429),
  // overloaded (5xx) or returned nothing usable (0). 400/401/403 would fail
  // the same way on every model.
  return status === 0 || status === 404 || status === 429 || status >= 500;
}

async function post(model: string, body: object) {
  const key = apiKey();
  let response: Response;
  let data: { candidates?: Candidate[] };
  try {
    response = await fetch(`${apiBase}/${model}:generateContent?key=${key}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) return { ok: false as const, status: response.status };
    data = (await response.json()) as { candidates?: Candidate[] };
  } catch {
    // Timeout or network failure: treat like an empty reply so the next model is tried.
    return { ok: false as const, status: 0 };
  }
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.length) return { ok: false as const, status: 0 };
  return { ok: true as const, candidate, model };
}

async function postWithFallback(models: string[], body: object) {
  let lastStatus = 0;
  for (const model of [...new Set(models)]) {
    const result = await post(model, body);
    if (result.ok) return result;
    lastStatus = result.status;
    if (!isRetryableStatus(lastStatus)) break;
  }

  if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) {
    throw new Error(`Gemini request failed (${lastStatus}). Check API key and account permissions.`);
  }
  if (lastStatus === 429 || lastStatus >= 500) throw new Error(`Gemini is busy right now (${lastStatus}).`);
  throw new Error(lastStatus === 0 ? "Gemini returned an empty response." : "Gemini model is unavailable.");
}

function visibleText(parts: GeminiPart[]) {
  return parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

/**
 * Runs one Tia turn: the model may call tools (up to a few rounds) before it
 * answers in text. `execute` performs each call and returns what the model sees.
 */
export async function runChatWithTools({
  execute,
  history,
  message,
  system,
  tools,
}: {
  execute: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  history: GeminiContent[];
  message: string;
  system: string;
  tools: FunctionDeclaration[];
}) {
  const primary = process.env.GEMINI_MODEL || defaultChatModel;
  const contents: GeminiContent[] = [...history, { role: "user", parts: [{ text: message }] }];

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const { candidate, model } = await postWithFallback([primary, ...chatFallbackModels], {
      contents,
      systemInstruction: { parts: [{ text: system }] },
      tools: [{ functionDeclarations: tools }],
      // Gemini 2.5+ spends hidden "thinking" tokens from maxOutputTokens; with a
      // small budget replies came back cut or empty. Tia works from prepared
      // context and tools, so thinking is off and the budget is all answer.
      generationConfig: { maxOutputTokens: 1500, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
    });
    const parts = candidate.content?.parts ?? [];
    const calls = parts.filter((part) => part.functionCall);

    if (!calls.length || round === maxToolRounds) {
      const text = visibleText(parts);
      if (!text) throw new Error("Gemini returned an empty response.");
      return {
        model,
        text: candidate.finishReason === "MAX_TOKENS" ? `${text}…\n\n(Answer was cut short — ask a narrower question for more detail.)` : text,
      };
    }

    // Echo the model turn unchanged (it carries thought signatures newer models require).
    contents.push({ role: "model", parts });
    const responses = await Promise.all(
      calls.map(async ({ functionCall }) => {
        const { id, name } = functionCall!;
        let response: Record<string, unknown>;
        try {
          response = await execute(name, functionCall!.args ?? {});
        } catch (error) {
          response = { ok: false, error: error instanceof Error ? error.message : "Tool failed." };
        }
        // Newer models tag each call with an id and expect it echoed back.
        return { functionResponse: { ...(id ? { id } : {}), name, response } };
      }),
    );
    contents.push({ role: "user", parts: responses });
  }

  throw new Error("Gemini returned an empty response.");
}

export async function transcribeVoiceNote(audio: { data: string; mimeType: string }, hints: string) {
  const { candidate } = await postWithFallback([process.env.GEMINI_MODEL || defaultChatModel, ...chatFallbackModels], {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: audio },
          {
            text: [
              "Transcribe this voice note from an Indian retail business owner talking to their assistant Tia.",
              "They may speak English, Hindi or a mix. Write English words in English and Hindi words in Roman script (Hinglish).",
              `Names that may come up: Tia, ${hints}.`,
              "Reply with only the transcript. If there is no clear speech, reply with nothing.",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 600, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  }).catch((error: Error) => {
    if (error.message.includes("empty response")) return { candidate: { content: { parts: [] } } as Candidate };
    throw error;
  });
  return visibleText(candidate.content?.parts ?? []);
}

function wavFromPcm(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Speaks `text` in Tia's voice and returns a WAV file. */
export async function speakAsTia(text: string) {
  const voice = process.env.TIA_VOICE || "Kore";
  const { candidate } = await postWithFallback(speechModels, {
    contents: [
      {
        parts: [
          {
            text: [
              "Speak as Tia, a warm, friendly young Indian woman from Odisha working as a personal secretary.",
              "Use a natural Indian English accent, and natural Hindi pronunciation for Hindi words, like a real Indian speaker — not American or British. Calm, pleasant pace:",
              text,
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });
  const audio = candidate.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (!audio) throw new Error("Gemini returned no audio.");

  const bytes = Buffer.from(audio.data, "base64");
  if (/wav/i.test(audio.mimeType)) return bytes;
  // Older TTS models return raw 16-bit PCM ("audio/L16;codec=pcm;rate=24000").
  const rate = Number(audio.mimeType.match(/rate=(\d+)/i)?.[1] ?? 24000);
  return wavFromPcm(bytes, rate);
}
