import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { OwnerToolsNav, PageHeader } from "@/components/owner/owner-tools-nav";
import { SecretaryFollowupForm } from "@/components/owner/secretary-followup-form";
import { requireOwner } from "@/lib/auth/session";
import { getOpenTaskChoices, getRecommendationFollowups } from "@/lib/owner/followups";
import { followupStatusLabels, shortDate } from "@/lib/owner/phase2-shared";
import { createClient } from "@/lib/supabase/server";

export default async function SecretaryFollowupPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const owner = await requireOwner();
  if (!owner) return <AccessDenied message="Recommendation follow-ups are shared between active owners only." />;
  const chatId = (await searchParams).chat ?? "";

  const supabase = await createClient();
  // Only the owner's own Secretary answers can be followed up.
  const { data: chat } = /^[0-9a-f-]{36}$/i.test(chatId)
    ? await supabase
        .from("ai_chats")
        .select("id,content,created_at")
        .eq("id", chatId)
        .eq("user_id", owner.profile.id)
        .eq("role", "assistant")
        .maybeSingle()
    : { data: null };

  if (!chat) {
    return (
      <div className="space-y-5">
        <OwnerToolsNav active="/app/owner/follow-ups" />
        <p className="rounded-2xl border border-border bg-card p-4 text-sm">
          That Secretary answer was not found in your own history. <Link className="underline" href="/app/secretary">Back to Secretary</Link>
        </p>
      </div>
    );
  }

  const [tasks, history] = await Promise.all([
    getOpenTaskChoices(),
    getRecommendationFollowups({ keys: [`secretary:${chat.id}`], limit: 10 }),
  ]);
  const content = chat.content ?? "";
  const firstLine = content.split(/\n+/).map((line) => line.replace(/^[#*\-\s\d.]+/, "").trim()).find(Boolean) ?? "Secretary recommendation";

  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/owner/follow-ups" />
      <PageHeader
        description="Record what you decided about this Secretary answer. Nothing is created automatically and no message is sent to anyone."
        eyebrow={`Secretary answer · ${shortDate(chat.created_at)}`}
        title="Follow up a recommendation"
      />
      {history.records.length ? (
        <section className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">Already recorded</p>
          <ul className="mt-2 space-y-1 text-muted">
            {history.records.map((record) => (
              <li key={record.id}>{shortDate(record.created_at)} · {followupStatusLabels[record.status] ?? record.status}{record.reason ? ` — ${record.reason}` : ""}{record.outcome ? ` — ${record.outcome}` : ""}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <SecretaryFollowupForm chatId={chat.id} excerpt={content.slice(0, 1500)} tasks={tasks} title={firstLine.slice(0, 120)} />
      </section>
    </div>
  );
}
