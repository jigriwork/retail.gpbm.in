import Link from "next/link";
import { Bot, Brain, MessageCircle } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { SecretaryChat } from "@/components/secretary/secretary-chat";
import { deactivateMemory, sendSecretaryMessage } from "@/lib/secretary/actions";
import { getActiveAiMemories } from "@/lib/secretary/context";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Gemini answers in light markdown; render bold and bullets instead of raw "**" and "*".
function FormattedAnswer({ text }: { text: string }) {
  return (
    <div className="mt-2 space-y-1 text-sm leading-6">
      {text.split("\n").map((line, index) => {
        if (!line.trim()) return <div className="h-1" key={index} />;
        const bullet = line.match(/^(\s*)[*-]\s+(.*)$/);
        const body = bullet ? bullet[2] : line.trim();
        const parts = body.split(/\*\*(.+?)\*\*/g).map((part, partIndex) =>
          partIndex % 2 ? <strong key={partIndex}>{part}</strong> : part,
        );
        return bullet ? (
          <p className={bullet[1].length >= 2 ? "flex gap-2 pl-5" : "flex gap-2 pl-1"} key={index}>
            <span aria-hidden className="text-muted">•</span>
            <span className="min-w-0">{parts}</span>
          </p>
        ) : (
          <p key={index}>{parts}</p>
        );
      })}
    </div>
  );
}

export default async function SecretaryPage() {
  const session = await requireOwner();

  if (!session?.profile) {
    return <AccessDenied message="AI Secretary is owner-only in this version." />;
  }

  const supabase = await createClient();
  const [{ data: chats }, memories] = await Promise.all([
    supabase
      .from("ai_chats")
      .select("id,role,content,created_at,metadata")
      .eq("user_id", session.profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
    getActiveAiMemories(session.profile.id),
  ]);
  // Newest conversation first, each question kept directly above its answer,
  // so a fresh reply appears right under the ask box on a phone.
  const turns: Array<NonNullable<typeof chats>> = [];
  for (const chat of [...(chats ?? [])].reverse()) {
    if (chat.role === "user" || !turns.length) turns.push([chat]);
    else turns[turns.length - 1].push(chat);
  }
  const orderedChats = turns.reverse().flat();

  return (
    <div className="space-y-5">
      <section className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">AI Secretary</h1>
          <p className="mt-1 text-sm leading-6 text-muted">
            Answers from your latest GPBM Retail data. Private to your account.
          </p>
        </div>
        <Bot className="mt-1 size-5 shrink-0 text-muted" />
      </section>

      <SecretaryChat action={sendSecretaryMessage} />

      <section className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent conversations</h2>
            <MessageCircle className="size-5 text-muted" />
          </div>
          {orderedChats.length ? (
            <div className="space-y-3">
              {orderedChats.map((chat) => (
                <article
                  className={
                    chat.role === "user"
                      ? "ml-auto w-fit max-w-[90%] rounded-[1.1rem] border border-border bg-foreground px-4 py-2.5 text-background sm:max-w-2xl"
                      : "max-w-2xl rounded-[1.1rem] border border-border bg-background p-4"
                  }
                  key={chat.id}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {chat.role === "user" ? "You" : "AI Secretary"}
                  </p>
                  {chat.role === "user" ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{chat.content}</p>
                  ) : (
                    <FormattedAnswer text={chat.content ?? ""} />
                  )}
                  {chat.role === "assistant" && !(chat.metadata as { error?: boolean } | null)?.error ? (
                    <Link
                      className="mt-3 inline-flex text-xs font-semibold underline"
                      href={`/app/owner/follow-ups/new?chat=${chat.id}`}
                    >
                      Follow up this recommendation
                    </Link>
                  ) : null}
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
