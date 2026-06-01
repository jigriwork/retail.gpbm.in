import { Bot, Brain, MessageCircle } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { SecretaryChat } from "@/components/secretary/secretary-chat";
import { deactivateMemory, sendSecretaryMessage, sendSecretaryPrompt } from "@/lib/secretary/actions";
import { getActiveAiMemories } from "@/lib/secretary/context";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function SecretaryPage() {
  const session = await requireOwner();

  if (!session?.profile) {
    return <AccessDenied message="AI Secretary is owner-only in this version." />;
  }

  const supabase = await createClient();
  const [{ data: chats }, memories] = await Promise.all([
    supabase
      .from("ai_chats")
      .select("id,role,content,created_at")
      .eq("user_id", session.profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
    getActiveAiMemories(session.profile.id),
  ]);
  const orderedChats = [...(chats ?? [])].reverse();

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">AI Secretary</p>
            <h1 className="mt-2 text-3xl font-semibold">Calm business context</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Ask only when useful. It uses compact summaries from GPBM Retail data.
            </p>
          </div>
          <Bot className="size-5 text-muted" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <form action={sendSecretaryPrompt}>
          <input name="prompt" type="hidden" value="What needs attention today?" />
          <button className="h-full w-full rounded-[1.35rem] border border-border bg-card p-4 text-left shadow-sm transition hover:border-foreground">
            <MessageCircle className="mb-5 size-5 text-muted" />
            <p className="font-semibold">Today attention</p>
            <p className="mt-2 text-sm leading-6 text-muted">Ask what needs attention today.</p>
          </button>
        </form>
        <form action={sendSecretaryPrompt}>
          <input name="prompt" type="hidden" value="How are Go Planet and Brand Mark today?" />
          <button className="h-full w-full rounded-[1.35rem] border border-border bg-card p-4 text-left shadow-sm transition hover:border-foreground">
            <MessageCircle className="mb-5 size-5 text-muted" />
            <p className="font-semibold">Store status</p>
            <p className="mt-2 text-sm leading-6 text-muted">Compare the two active stores.</p>
          </button>
        </form>
        <form action={sendSecretaryPrompt}>
          <input name="prompt" type="hidden" value="Give me Monday audit summary" />
          <button className="h-full w-full rounded-[1.35rem] border border-border bg-card p-4 text-left shadow-sm transition hover:border-foreground">
            <MessageCircle className="mb-5 size-5 text-muted" />
            <p className="font-semibold">Weekly audit</p>
            <p className="mt-2 text-sm leading-6 text-muted">Review last completed week.</p>
          </button>
        </form>
      </section>

      <SecretaryChat action={sendSecretaryMessage} />

      <section className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Chat history</h2>
            <MessageCircle className="size-5 text-muted" />
          </div>
          {orderedChats.length ? (
            <div className="space-y-3">
              {orderedChats.map((chat) => (
                <article
                  className={
                    chat.role === "user"
                      ? "ml-auto max-w-2xl rounded-[1.35rem] border border-border bg-foreground p-4 text-background"
                      : "max-w-2xl rounded-[1.35rem] border border-border bg-background p-4"
                  }
                  key={chat.id}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {chat.role === "user" ? "You" : "AI Secretary"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{chat.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">No chat history yet.</p>
          )}
        </div>

        <aside className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Memories</h2>
            <Brain className="size-5 text-muted" />
          </div>
          {memories.length ? (
            <div className="space-y-3">
              {memories.map((memory) => (
                <div className="rounded-2xl border border-border p-3" key={memory.id}>
                  <p className="font-semibold">{memory.title ?? "Memory"}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{memory.content}</p>
                  <form action={deactivateMemory} className="mt-3">
                    <input name="memoryId" type="hidden" value={memory.id} />
                    <button className="text-xs font-semibold text-muted" type="submit">
                      Hide memory
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">
              No active memories yet. Say &quot;remember&quot; or &quot;note this&quot; in chat to save a simple note.
            </p>
          )}
        </aside>
      </section>
    </div>
  );
}
