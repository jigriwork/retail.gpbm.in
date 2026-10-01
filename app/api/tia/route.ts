import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { warmSecretaryContext } from "@/lib/secretary/context";
import { readTiaQuestion, runTiaTurn } from "@/lib/secretary/turn";

// Tia may transcribe, look things up, act and answer in one request.
export const maxDuration = 120;

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

// Cookies authenticate this endpoint, so only this site's own pages may call it.
function sameOrigin(request: Request) {
  // Browsers omit Origin on same-site GETs but always mark them in Sec-Fetch-Site.
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Opening Tia's page calls this so her store snapshot is ready before the first question. */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403, headers: noStore });
  const session = await requireOwner();
  if (!session?.profile) return new Response(null, { status: 403, headers: noStore });
  after(() => warmSecretaryContext(session.profile).catch(() => undefined));
  return new Response(null, { status: 204, headers: noStore });
}

/**
 * Answers one question as newline-delimited JSON events:
 * {type:"question"} (with the transcript for a voice note), {type:"text"} pieces
 * of the answer as they are written, then {type:"done"} or {type:"error"}.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403, headers: noStore });
  const session = await requireOwner();
  if (!session?.profile) return Response.json({ message: "Tia is available to owners only." }, { status: 403, headers: noStore });

  const profile = session.profile;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ message: "That message could not be read." }, { status: 400, headers: noStore });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The owner left or pressed Stop; the turn still finishes and is saved.
        }
      };
      try {
        const stores = await getAccessibleStores(profile);
        const question = await readTiaQuestion(formData, stores);
        if (!question.ok) {
          send({ type: "error", message: question.message });
          return;
        }
        send({ type: "question", prompt: question.prompt, spoken: question.spoken });

        const result = await runTiaTurn({
          onText: (text) => send({ type: "text", text }),
          onTool: (name) => send({ type: "tool", name }),
          profile,
          prompt: question.prompt,
          signal: request.signal,
          spoken: question.spoken,
          stores,
        });
        if (result.actions.length) {
          revalidatePath("/app/today");
          revalidatePath("/app/tasks");
        }
        send(
          result.ok
            ? { type: "done", chatId: result.chatId, actions: result.actions, spoken: question.spoken }
            : { type: "error", message: result.message },
        );
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Tia could not answer just now." });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });

  return new Response(body, {
    headers: { ...noStore, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" },
  });
}
