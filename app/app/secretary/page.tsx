import Link from "next/link";
import { Brain, MessageCircle } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { SecretaryChat } from "@/components/secretary/secretary-chat";
import { SpeakButton, TiaActionList } from "@/components/secretary/tia-message-actions";
import { deactivateMemory, sendSecretaryMessage } from "@/lib/secretary/actions";
import { getActiveAiMemories, greetingForNow, ownerFirstName } from "@/lib/secretary/context";
import { isTiaActionUndone, type TiaAction } from "@/lib/secretary/tools";
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

// Tia may transcribe, look things up, act and then speak in one visit.
export const maxDuration = 60;

export default async function SecretaryPage() {
  const session = await requireOwner();

  if (!session?.profile) {
    return <AccessDenied message="Tia is available to owners only." />;
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

  // Show each change Tia made with its current state, so Undo only appears while it applies.
  const actionsOf = (metadata: unknown) => ((metadata as { actions?: TiaAction[] } | null)?.actions ?? []);
  const actionTaskIds = [...new Set((chats ?? []).flatMap((chat) => actionsOf(chat.metadata).map((action) => action.taskId)))];
  const { data: actionTasks } = actionTaskIds.length
    ? await supabase.from("tasks").select("id,status,due_date").in("id", actionTaskIds)
    : { data: [] };
  const withState = (metadata: unknown) =>
    actionsOf(metadata).map((action) => ({
      ...action,
      undone: isTiaActionUndone(action, actionTasks?.find((task) => task.id === action.taskId) ?? null),
    }));

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-3 px-1">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-semibold text-background">
          T
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {greetingForNow()}, {ownerFirstName(session.profile)}
          </h1>
          <p className="mt-0.5 text-sm leading-6 text-muted">I&apos;m Tia, your secretary. Ask me anything about the stores.</p>
        </div>
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
                    {chat.role === "user" ? ((chat.metadata as { spoken?: boolean } | null)?.spoken ? "You · 🎤" : "You") : "Tia"}
                  </p>
                  {chat.role === "user" ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{chat.content}</p>
                  ) : (
                    <FormattedAnswer text={chat.content ?? ""} />
                  )}
                  {chat.role === "assistant" && actionsOf(chat.metadata).length ? (
                    <TiaActionList actions={withState(chat.metadata)} chatId={chat.id} />
                  ) : null}
                  {chat.role === "assistant" && !(chat.metadata as { error?: boolean } | null)?.error ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <SpeakButton chatId={chat.id} />
                      <Link className="text-xs font-semibold underline" href={`/app/owner/follow-ups/new?chat=${chat.id}`}>
                        Follow up this recommendation
                      </Link>
                    </div>
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
            <h2 className="text-xl font-semibold">What Tia remembers</h2>
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
                      Forget this
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">
              Nothing yet. Tell Tia about your business — staff, suppliers, plans — and she will remember it.
            </p>
          )}
        </aside>
      </section>
    </div>
  );
}
