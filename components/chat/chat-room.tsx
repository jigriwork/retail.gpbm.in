"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Megaphone, Pin, SendHorizontal, Trash2 } from "lucide-react";

import { type ChatMember, type ChatMessage, type ChatRoomData, deleteChat, keepChat, loadChat, markChatRead, sendChat, setAnnouncements } from "@/lib/chat/actions";
import { isOutdatedApp, reloadForUpdate, updateOr } from "@/lib/app-version/outdated";
import { createClient } from "@/lib/supabase/client";

const time = (value: string) => new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const day = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata", weekday: "short" });
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Message text with @names highlighted (mine in a stronger colour). */
function Body({ members, message, me, mine }: { me: string; members: ChatMember[]; message: ChatMessage; mine: boolean }) {
  const names = members.filter((member) => message.mentions.includes(member.id)).map((member) => member.name);
  if (!names.length) return <>{message.body}</>;
  const pattern = new RegExp(`(@(?:${names.map(escapeRegex).sort((a, b) => b.length - a.length).join("|")}))`, "g");
  const myName = members.find((member) => member.id === me)?.name;
  return (
    <>
      {message.body.split(pattern).map((part, index) => part.startsWith("@") && names.includes(part.slice(1))
        ? <span className={`rounded px-1 font-semibold ${part.slice(1) === myName ? "bg-accent text-black" : mine ? "bg-white/20" : "bg-primary-soft text-primary"}`} key={index}>{part}</span>
        : <Fragment key={index}>{part}</Fragment>)}
    </>
  );
}

export function ChatRoom({ basePath, initial, roomId }: { basePath: { app: string; staff: string }; initial: ChatRoomData; roomId: string }) {
  const [room, setRoom] = useState(initial);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  // The part of the screen not covered by the keyboard (iPhone and Android).
  const [view, setView] = useState<{ height: number; top: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const draftKey = `gpbm-chat-draft-${roomId}`;
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const back = room.my_role === "staff" ? basePath.staff : basePath.app;
  const isOwner = room.my_role === "owner";
  const canKeep = isOwner || room.my_role === "manager";
  const readOnly = room.announcements_only && !isOwner;

  const refresh = useCallback(async () => {
    const result = await loadChat(roomId).catch(updateOr({ error: "x" } as { data?: ChatRoomData; error?: string }));
    if (result.data) setRoom(result.data);
    if (document.visibilityState === "visible") void markChatRead(roomId).catch(() => undefined);
  }, [roomId]);

  // Live: new messages appear at once (and every 15 s as a fallback).
  useEffect(() => {
    void markChatRead(roomId).catch(() => undefined);
    const supabase = createClient();
    let timer = 0;
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 250); };
    const channel = supabase.channel(`chat-${roomId}`)
      .on("postgres_changes", { event: "*", filter: `room_id=eq.${roomId}`, schema: "public", table: "chat_messages" }, soon)
      .subscribe();
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); void supabase.removeChannel(channel); };
  }, [refresh, roomId]);

  // Full-screen chat sized to the visible area: the keyboard only shortens the
  // message list (the screen no longer jumps up). The page behind cannot scroll.
  useEffect(() => {
    const viewport = window.visualViewport;
    const apply = () => {
      setView(viewport ? { height: viewport.height, top: viewport.offsetTop } : { height: window.innerHeight, top: 0 });
      window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    };
    const frame = window.requestAnimationFrame(apply);
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      document.body.style.overflow = overflow;
    };
  }, []);

  // A message typed before an update reload is put back.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const draft = window.sessionStorage.getItem(draftKey); if (draft) { setText(draft); window.sessionStorage.removeItem(draftKey); } } catch { /* storage blocked */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftKey]);

  // Keep the newest message in view.
  const count = room.messages.length;
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [count]);

  // @mention picker: the word being typed after "@".
  const query = useMemo(() => {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(text);
    return match ? match[1].toLowerCase() : null;
  }, [text]);
  const suggestions = query === null ? [] : room.members.filter((member) => member.id !== room.me && member.name.toLowerCase().includes(query)).slice(0, 6);
  function pick(member: ChatMember) {
    setText((value) => value.replace(/@([^\s@]*)$/, `@${member.name} `));
    setMentions((list) => [...new Set([...list, member.id])]);
    boxRef.current?.focus();
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const used = mentions.filter((id) => body.includes(`@${room.members.find((member) => member.id === id)?.name ?? "\u0000"}`));
    const result = await sendChat(roomId, body, used, basePath).catch((reason: unknown) => {
      // A new version went live while this chat was open: keep the message, load the new version.
      if (isOutdatedApp(reason)) {
        try { window.sessionStorage.setItem(draftKey, body); } catch { /* storage blocked */ }
        if (reloadForUpdate()) return { error: "" };
      }
      return { error: "Connection problem. Please retry." };
    }) as { error?: string };
    setSending(false);
    if ("error" in result && result.error) { setError(result.error); return; }
    setText("");
    setMentions([]);
    void refresh();
  }

  async function act(action: Promise<{ error?: string } | { ok: boolean }>) {
    setMenu(null);
    const result = await action.catch(updateOr({ error: "Connection problem." }));
    if ("error" in result && result.error) setError(result.error);
    void refresh();
  }

  // Seen: in a private chat, whether the other person has read my last message; in a group, how many have.
  const last = [...room.messages].reverse().find((message) => !message.deleted);
  const seenBy = last && last.sender_id === room.me
    ? room.reads.filter((read) => read.user_id !== room.me && read.at >= last.created_at).length : null;

  return (
    <div className="fixed inset-x-0 top-0 z-[45] flex h-dvh flex-col bg-card" style={view ? { height: view.height, top: view.top } : undefined}>
      <header className="flex items-center gap-2 border-b border-border px-3 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <Link aria-label="All chats" className="inline-flex size-9 items-center justify-center rounded-xl text-muted" href={back}><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{room.title}</p>
          <p className="truncate text-xs text-muted">{room.kind === "direct" ? "Private chat" : `${room.members.length} people`}{room.announcements_only ? " · announcements only" : ""}</p>
        </div>
        {isOwner && room.kind !== "direct" ? (
          <button className={`inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold ${room.announcements_only ? "bg-accent text-black" : "border border-border"}`} onClick={() => act(setAnnouncements(roomId, !room.announcements_only))} type="button">
            <Megaphone className="size-4" /> {room.announcements_only ? "Owners only" : "Everyone can post"}
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-background p-3" ref={listRef}>
        {room.messages.length ? room.messages.map((message, index) => {
          const mine = message.sender_id === room.me;
          const forMe = message.mentions.includes(room.me);
          const newDay = index === 0 || day(room.messages[index - 1].created_at) !== day(message.created_at);
          return (
            <Fragment key={message.id}>
              {newDay ? <p className="py-1 text-center text-xs font-medium text-muted">{day(message.created_at)}</p> : null}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <button
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-left text-sm ${message.deleted ? "border border-dashed border-border text-muted" : mine ? "bg-primary text-white" : forMe ? "border-2 border-accent bg-accent-soft" : "bg-background"}`}
                  onClick={() => setMenu(menu === message.id ? null : message.id)}
                  type="button"
                >
                  {!mine && room.kind !== "direct" ? <span className="mb-0.5 block text-xs font-semibold opacity-80">{message.sender}</span> : null}
                  {forMe && !mine ? <span className="mb-0.5 block text-[0.7rem] font-bold uppercase text-accent-ink">mentioned you</span> : null}
                  <span className="whitespace-pre-wrap break-words">{message.deleted ? "Message deleted" : <Body me={room.me} members={room.members} message={message} mine={mine} />}</span>
                  <span className={`mt-0.5 flex items-center justify-end gap-1 text-[0.65rem] ${mine ? "text-white/70" : "text-muted"}`}>
                    {message.kept ? <><Pin className="size-3" /> kept ·</> : null} {time(message.created_at)}
                  </span>
                </button>
              </div>
              {menu === message.id && !message.deleted ? (
                <div className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {canKeep ? <button className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold" onClick={() => act(keepChat(message.id, !message.kept))} type="button"><Pin className="size-3" /> {message.kept ? "Don't keep" : "Keep forever"}</button> : null}
                  {mine || isOwner ? <button className="inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-xs font-semibold text-danger" onClick={() => act(deleteChat(message.id))} type="button"><Trash2 className="size-3" /> Delete</button> : null}
                </div>
              ) : null}
            </Fragment>
          );
        }) : <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p>}
        {seenBy !== null ? <p className="text-right text-[0.7rem] text-muted">{room.kind === "direct" ? (seenBy ? "✓✓ Seen" : "✓ Sent") : `Seen by ${seenBy}`}</p> : null}
      </div>

      <footer className="border-t border-border bg-card p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
        {error ? <p className="px-1 pb-1 text-xs font-semibold text-danger">{error}</p> : null}
        {suggestions.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((member) => <button className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary" key={member.id} onClick={() => pick(member)} type="button">@{member.name}</button>)}
          </div>
        ) : null}
        {readOnly ? <p className="p-2 text-center text-sm text-muted">Only the owners can post in this group.</p> : (
          <div className="flex items-end gap-2">
            <textarea
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && window.matchMedia("(pointer: fine)").matches) { event.preventDefault(); void send(); } }}
              placeholder="Message… type @ to mention someone"
              ref={boxRef}
              rows={1}
              value={text}
            />
            <button aria-label="Send" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50" disabled={sending || !text.trim()} onClick={send} type="button">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
