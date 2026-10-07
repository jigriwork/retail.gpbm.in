import Link from "next/link";
import { Megaphone, MessagesSquare, ShieldCheck, Store, UserRound } from "lucide-react";

import { DirectStarter } from "@/components/chat/direct-starter";
import type { Profile } from "@/lib/auth/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Room = { announcements_only: boolean; id: string; kind: string; last_at: string | null; last_body: string | null; last_sender: string | null; title: string; unread: number };

const icon = { direct: UserRound, owners: ShieldCheck, store_management: MessagesSquare, store_team: Store } as const;
const when = (value: string) => {
  const date = new Date(value);
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  return today ? date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};

/** All chats of the signed-in person, newest first, with unread counts; and starting a private chat. */
export async function ChatList({ base, profile }: { base: string; profile: Profile }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_chat_rooms");
  const rooms = (data ?? []) as unknown as Room[];
  // Private chats: the owner with anyone; everyone else with an owner.
  const admin = createAdminClient();
  let people: Array<{ id: string; label: string }> = [];
  if (admin) {
    if (profile.role === "owner") {
      const [{ data: team }, { data: staff }] = await Promise.all([
        admin.from("profiles").select("id,full_name,role").eq("is_active", true).in("role", ["owner", "manager", "cashier"]),
        admin.from("employee_auth_links").select("auth_user_id, employee_contacts(staff_name), stores(name)").eq("status", "active"),
      ]);
      people = [
        ...(team ?? []).filter((person) => person.id !== profile.id).map((person) => ({ id: person.id, label: `${person.full_name ?? "—"} (${person.role})` })),
        ...(staff ?? []).map((row) => {
          const link = row as unknown as { auth_user_id: string; employee_contacts: { staff_name: string } | null; stores: { name: string } | null };
          return { id: link.auth_user_id, label: `${link.employee_contacts?.staff_name ?? "Staff"} (staff${link.stores ? `, ${link.stores.name}` : ""})` };
        }),
      ].sort((left, right) => left.label.localeCompare(right.label));
    } else {
      const { data: owners } = await admin.from("profiles").select("id,full_name").eq("is_active", true).eq("role", "owner");
      people = (owners ?? []).map((owner) => ({ id: owner.id, label: `${owner.full_name ?? "Owner"} (owner)` }));
    }
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/60 overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-sm">
        {rooms.map((room) => {
          const Icon = icon[room.kind as keyof typeof icon] ?? MessagesSquare;
          return (
            <li key={room.id}>
              <Link className="flex items-center gap-3 p-3 active:bg-black/[0.03]" href={`${base}/${room.id}`}>
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${room.kind === "direct" ? "bg-accent-soft text-accent-ink" : "bg-primary-soft text-primary"}`}><Icon className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{room.title}{room.announcements_only ? <Megaphone className="ml-1 inline size-3.5 text-muted" /> : null}</span>
                    {room.last_at ? <span className={`shrink-0 text-xs ${room.unread ? "font-semibold text-primary" : "text-muted"}`}>{when(room.last_at)}</span> : null}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-muted">{room.last_body ? `${room.kind === "direct" ? "" : `${room.last_sender}: `}${room.last_body}` : "No messages yet"}</span>
                    {room.unread ? <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.7rem] font-bold leading-5 text-white">{room.unread > 99 ? "99+" : room.unread}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <DirectStarter base={base} people={people} />
      <p className="text-xs text-muted">Messages are kept for 90 days; owners and managers can 📌 keep important ones forever (tap a message).</p>
    </div>
  );
}
