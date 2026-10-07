import Link from "next/link";

import { MarkRead } from "@/components/notifications/mark-read";
import { createClient } from "@/lib/supabase/server";

type Item = { body: string | null; created_at: string; id: string; read_at: string | null; sender: string | null; title: string; url: string | null };

function when(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

/** The 🔔 inbox: newest first, new ones highlighted, all marked read on opening. */
export async function NotificationInbox() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_notifications", { p_limit: 100 });
  const inbox = (data ?? { items: [], unread: 0 }) as unknown as { items: Item[]; unread: number };
  return (
    <div className="space-y-3">
      {inbox.unread ? <MarkRead /> : null}
      {inbox.items.length ? inbox.items.map((item) => {
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-semibold">{item.title}</p>
              {!item.read_at ? <span className="mt-1 size-2.5 shrink-0 rounded-full bg-danger" /> : null}
            </div>
            {item.body ? <p className="mt-1 whitespace-pre-line text-sm leading-6">{item.body}</p> : null}
            <p className="mt-1 text-xs text-muted">{when(item.created_at)}{item.sender ? ` · from ${item.sender}` : ""}</p>
          </>
        );
        const box = `block rounded-2xl border p-4 shadow-sm ${item.read_at ? "border-border bg-card" : "border-primary/40 bg-primary-soft"}`;
        return item.url ? <Link className={box} href={item.url} key={item.id}>{content}</Link> : <div className={box} key={item.id}>{content}</div>;
      }) : <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No notifications yet.</p>}
    </div>
  );
}
