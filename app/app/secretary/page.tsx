import { Brain } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { TiaChat, type ChatMessage } from "@/components/secretary/tia-chat";
import { deactivateMemory } from "@/lib/secretary/actions";
import { getActiveAiMemories, ownerFirstName } from "@/lib/secretary/context";
import { isTiaActionUndone, type TiaAction } from "@/lib/secretary/tools";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Tia may transcribe, look things up, act and then speak in one visit.
export const maxDuration = 120;

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

  type Metadata = { spoken?: boolean; error?: boolean } | null;
  // Oldest first, like any chat; the newest answer sits just above the message box.
  const messages: ChatMessage[] = [...(chats ?? [])].reverse().map((chat) => ({
    actions: withState(chat.metadata),
    at: chat.created_at ?? undefined,
    content: chat.content ?? "",
    error: Boolean((chat.metadata as Metadata)?.error),
    id: chat.id,
    role: chat.role === "user" ? "user" : "assistant",
    spoken: Boolean((chat.metadata as Metadata)?.spoken),
  }));

  const memory = (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-xs font-semibold shadow-sm [&::-webkit-details-marker]:hidden">
        <Brain className="size-4 text-primary" />
        <span className="hidden sm:inline">Memory</span>
        <span className="rounded-full bg-primary-soft px-1.5 text-primary">{memories.length}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 max-h-[60vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl">
        <h2 className="text-base font-semibold">What Tia remembers</h2>
        {memories.length ? (
          <div className="mt-3 space-y-2">
            {memories.map((memory) => (
              <div className="rounded-xl border border-border p-3" key={memory.id}>
                <p className="text-sm font-semibold">{memory.title ?? "Memory"}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{memory.content}</p>
                <form action={deactivateMemory} className="mt-2">
                  <input name="memoryId" type="hidden" value={memory.id} />
                  <button className="text-xs font-semibold text-muted underline" type="submit">
                    Forget this
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            Nothing yet. Tell Tia about your business — staff, suppliers, plans — and she will remember it.
          </p>
        )}
      </div>
    </details>
  );

  return <TiaChat initialMessages={messages} memory={memory} ownerName={ownerFirstName(session.profile)} />;
}
