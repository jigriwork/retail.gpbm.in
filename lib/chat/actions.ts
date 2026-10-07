"use server";

import { requireProfile } from "@/lib/auth/session";
import { notifyUsers } from "@/lib/notifications/send";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type ChatMember = { id: string; name: string; role: string };
export type ChatMessage = { body: string; created_at: string; deleted: boolean; id: string; kept: boolean; mentions: string[]; sender: string; sender_id: string };
export type ChatRoomData = {
  announcements_only: boolean; id: string; kind: string; me: string; members: ChatMember[]; messages: ChatMessage[];
  my_role: string; reads: Array<{ at: string; user_id: string }>; title: string;
};

const fail = (error: { code?: string; message: string } | null) => (error?.code === "P0001" ? error.message : "Connection problem. Please retry.");

export async function loadChat(roomId: string): Promise<{ data?: ChatRoomData; error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_room", { p_limit: 120, p_room: roomId });
  if (error || !data) return { error: fail(error) };
  return { data: data as unknown as ChatRoomData };
}

export async function markChatRead(roomId: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("mark_chat_read", { p_room: roomId });
}

/** Sends a message; the other members' phones ring, and anyone @mentioned also gets it in the 🔔 inbox. */
export async function sendChat(roomId: string, body: string, mentions: string[], basePath: { app: string; staff: string }) {
  const { profile } = await requireProfile();
  const text = body.trim().slice(0, 2000);
  if (!text) return { error: "Write a message." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_chat_message", { p_body: text, p_mentions: mentions, p_room: roomId });
  if (error || !data) return { error: fail(error) };
  const sent = data as unknown as { kind: string; members: string[]; mentions: string[]; sender: string; title: string };
  const preview = text.length > 140 ? `${text.slice(0, 139)}…` : text;
  const where = sent.kind === "direct" ? sent.sender : `${sent.sender} in ${sent.title}`;
  // Staff open chats under /staff, everyone else under /app.
  const admin = createAdminClient();
  const { data: roles } = admin ? await admin.from("profiles").select("id,role").in("id", sent.members) : { data: [] };
  const urlFor = (id: string) => `${(roles ?? []).find((row) => row.id === id)?.role === "staff" ? basePath.staff : basePath.app}/${roomId}`;
  const mentioned = new Set(sent.mentions);
  const others = sent.members.filter((id) => !mentioned.has(id));
  await Promise.all([
    ...[...mentioned].map((id) => notifyUsers([id], { body: preview, createdBy: profile.id, kind: "mention", tag: `chat-${roomId}`, title: `💬 ${sent.sender} mentioned you${sent.kind === "direct" ? "" : ` in ${sent.title}`}`, url: urlFor(id) })),
    ...others.map((id) => notifyUsers([id], { body: preview, createdBy: profile.id, inbox: false, kind: "chat", tag: `chat-${roomId}`, title: `💬 ${where}`, url: urlFor(id) })),
  ]);
  return { ok: true };
}

export async function deleteChat(messageId: string) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_chat_message", { p_message: messageId });
  return error ? { error: fail(error) } : { ok: true };
}

export async function keepChat(messageId: string, keep: boolean) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("keep_chat_message", { p_keep: keep, p_message: messageId });
  return error ? { error: fail(error) } : { ok: true };
}

export async function setAnnouncements(roomId: string, on: boolean) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chat_announcements", { p_on: on, p_room: roomId });
  return error ? { error: fail(error) } : { ok: true };
}

export async function openDirectChat(otherId: string) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_direct_chat", { p_other: otherId });
  return error || !data ? { error: fail(error) } : { roomId: data as string };
}
