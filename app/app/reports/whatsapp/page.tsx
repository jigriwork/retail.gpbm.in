import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Notice } from "@/components/accounts/fields";
import { requireProfile } from "@/lib/auth/session";
import { customerRef, maskMobile, resolveCustomerRef } from "@/lib/customers/ref";
import type { Msg91BrandCode } from "@/lib/msg91/config";
import { replyToChat } from "@/lib/msg91/inbox-actions";
import { chatEntries, inboxBrands, listChats, markChatRead, withinReplyWindow, type ChatFilter, type ChatSummary, type ChatTag } from "@/lib/msg91/inbox-queries";
import { syncWhatsAppStatuses } from "@/lib/msg91/log-sync";

const storeNames: Record<Msg91BrandCode, string> = { BM: "Brand Mark", GP: "Go Planet" };
const tagLabels: Record<ChatTag, string> = { new: "New", offer_reply: "Replied to offer", stopped: "Tapped Stop" };
const tagTones: Record<ChatTag, "good" | "warn" | "bad"> = { new: "good", offer_reply: "warn", stopped: "bad" };
const filters: Array<{ id: ChatFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "offer_reply", label: "Replied to offer" },
  { id: "stopped", label: "Tapped Stop" },
];
const statusLabels: Record<string, string> = { accepted: "Sent", delivered: "Delivered", failed: "Not delivered", processing: "Sending", read: "Read" };

function when(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function chipClass(current: boolean) {
  return current
    ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
    : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted";
}

export default async function WhatsAppInboxPage({ searchParams }: { searchParams: Promise<{ b?: string; chat?: string; filter?: string; store?: string }> }) {
  const { profile } = await requireProfile();
  const brands = await inboxBrands(profile);
  if (!brands.length) return <AccessDenied message="WhatsApp messages are visible to the owner and store managers." />;
  // New replies arrive with MSG91's logs (read at most every 5 minutes here, and every 30 minutes in the background).
  const [params] = await Promise.all([searchParams, syncWhatsAppStatuses().catch(() => null)]);
  const isOwner = profile?.role === "owner";
  const storeFilter = brands.find((brand) => brand === params.store) ?? null;
  const filter = filters.some((item) => item.id === params.filter) ? params.filter as ChatFilter : "all";
  const chatBrand = brands.find((brand) => brand === params.b) ?? null;
  const chatMobile = params.chat ? resolveCustomerRef(params.chat) : null;
  if (chatBrand && chatMobile) await markChatRead(chatBrand, chatMobile);

  const chats = await listChats(storeFilter ? [storeFilter] : brands);
  const shown = filter === "all" ? chats : chats.filter((chat) => chat.tags.includes(filter));
  const counts = Object.fromEntries(filters.map((item) => [item.id, item.id === "all" ? chats.length : chats.filter((chat) => chat.tags.includes(item.id as ChatTag)).length]));
  const selected = chatBrand && chatMobile ? chats.find((chat) => chat.brand === chatBrand && chat.mobile === chatMobile) ?? null : null;
  const entries = selected ? await chatEntries(selected.brand, selected.mobile) : [];
  const lastIn = [...entries].reverse().find((entry) => entry.direction === "in");
  const canReply = Boolean(lastIn && withinReplyWindow(lastIn.at));

  const query = (next: Record<string, string | null>) => {
    const values: Record<string, string | null> = { filter: filter === "all" ? null : filter, store: storeFilter, ...next };
    const search = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/app/reports/whatsapp${search.size ? `?${search}` : ""}`;
  };
  const display = (chat: ChatSummary) => chat.name || (isOwner ? chat.mobile : maskMobile(chat.mobile));

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href="/app/reports">← Reports</Link>
        <h1 className="mt-2 text-3xl font-semibold">WhatsApp messages</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Customers&apos; replies to the stores&apos; WhatsApp numbers. Reply here within 24 hours of their last message.</p>
        {isOwner ? <Link className="mt-3 inline-block text-sm font-semibold text-primary" href="/app/customers/whatsapp">Delivery of sent messages →</Link> : null}
      </section>

      <div className="space-y-2">
        {brands.length > 1 ? (
          <nav aria-label="Store" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {[null, ...brands].map((brand) => (
              <Link aria-current={brand === storeFilter ? "page" : undefined} className={chipClass(brand === storeFilter)} href={query({ b: null, chat: null, store: brand })} key={brand ?? "all"}>
                {brand ? storeNames[brand] : "All stores"}
              </Link>
            ))}
          </nav>
        ) : null}
        <nav aria-label="Filter" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {filters.map((item) => (
            <Link aria-current={item.id === filter ? "page" : undefined} className={chipClass(item.id === filter)} href={query({ b: null, chat: null, filter: item.id === "all" ? null : item.id })} key={item.id}>
              {item.label} · {counts[item.id]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label="Chats" className={`${selected ? "hidden lg:block" : ""} overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-sm`}>
          {shown.length ? (
            <ul className="divide-y divide-border">
              {shown.map((chat) => {
                const current = selected?.brand === chat.brand && selected.mobile === chat.mobile;
                return (
                  <li key={`${chat.brand}:${chat.mobile}`}>
                    <Link className={`block p-4 transition hover:bg-background ${current ? "bg-primary-soft" : ""}`} href={query({ b: chat.brand, chat: customerRef(chat.mobile) })}>
                      <div className="flex items-start justify-between gap-3">
                        <p className={`min-w-0 truncate ${chat.unread ? "font-bold" : "font-semibold"}`}>{display(chat)}</p>
                        <span className="shrink-0 text-xs text-muted">{when(chat.lastAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">{chat.lastFromCustomer ? "" : "You: "}{chat.lastBody}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge>{chat.brand}</Badge>
                        {chat.tags.map((tag) => <Badge key={tag} tone={tagTones[tag]}>{tag === "new" && chat.unread > 1 ? `${chat.unread} new` : tagLabels[tag]}</Badge>)}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-5"><Empty>{chats.length ? "No chats with this tag." : "No customer replies in the last 30 days yet. They appear here within 30 minutes of arriving."}</Empty></div>
          )}
        </section>

        <section aria-label="Conversation" className={`${selected ? "" : "hidden lg:flex"} flex min-h-[24rem] flex-col rounded-[1.35rem] border border-border bg-card shadow-sm`}>
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div className="min-w-0">
                  <Link className="text-xs font-semibold text-primary lg:hidden" href={query({ b: null, chat: null })}>← All chats</Link>
                  <p className="truncate text-lg font-semibold">{display(selected)}</p>
                  <p className="text-xs text-muted">{storeNames[selected.brand]}{isOwner && selected.name ? ` · ${selected.mobile}` : ""}</p>
                </div>
                {isOwner ? <a className="rounded-xl border border-border px-3 py-2 text-sm font-semibold" href={`tel:+91${selected.mobile}`}>📞 Call</a> : null}
              </div>

              <ol className="flex-1 space-y-3 overflow-y-auto bg-background p-4">
                {entries.map((entry, index) => (
                  <li className={`flex ${entry.direction === "in" ? "justify-start" : "justify-end"}`} key={`${entry.at}-${index}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${entry.direction === "in" ? "rounded-bl-sm border border-border bg-card" : "rounded-br-sm bg-primary-soft"}`}>
                      {entry.label ? <p className="text-xs font-semibold text-muted">{entry.label}</p> : null}
                      {entry.body ? <p className="whitespace-pre-wrap break-words">{entry.body}</p> : null}
                      <p className="mt-1 text-right text-[11px] text-muted">
                        {when(entry.at)}{entry.status ? ` · ${statusLabels[entry.status] ?? entry.status}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="border-t border-border p-4">
                {canReply ? (
                  <ActionForm action={replyToChat} className="space-y-3" submitLabel="Send">
                    <input name="brand" type="hidden" value={selected.brand} />
                    <input name="chat" type="hidden" value={customerRef(selected.mobile)} />
                    <textarea
                      aria-label="Reply"
                      className="min-h-20 w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
                      maxLength={1000}
                      name="text"
                      placeholder={`Reply as ${storeNames[selected.brand]}…`}
                      required
                    />
                  </ActionForm>
                ) : (
                  <Notice>More than 24 hours since the customer&apos;s last message, so WhatsApp no longer allows a typed reply.{isOwner ? " Use 📞 Call above." : " Ask the owner to call them."}</Notice>
                )}
              </div>
            </>
          ) : (
            <div className="m-auto p-6 text-center text-sm text-muted">Pick a chat to read it and reply.</div>
          )}
        </section>
      </div>
    </div>
  );
}
