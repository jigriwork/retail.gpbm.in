import "server-only";

import { getAccessibleStores, type Profile } from "@/lib/auth/session";
import type { Msg91BrandCode } from "@/lib/msg91/config";
import { createAdminClient } from "@/lib/supabase/server";

export type ChatTag = "new" | "offer_reply" | "stopped";
export type ChatFilter = "all" | ChatTag;

export type ChatSummary = {
  brand: Msg91BrandCode;
  lastAt: string;
  lastBody: string;
  lastFromCustomer: boolean;
  mobile: string;
  name: string | null;
  tags: ChatTag[];
  unread: number;
};

export type ChatEntry = {
  at: string;
  body: string;
  direction: "in" | "out";
  label: string | null;
  status: string | null;
};

const templateLabels: Record<string, string> = {
  customer_campaign: "📣 Festive offer",
  customer_follow_up: "💌 We miss you",
  customer_thank_you: "🧾 Purchase receipt / thank-you",
};

export const replyWindowMs = 24 * 60 * 60 * 1000;

/** WhatsApp allows a typed reply only within 24 hours of the customer's last message. */
export function withinReplyWindow(lastCustomerAt: string) {
  return Date.now() - Date.parse(lastCustomerAt) < replyWindowMs;
}

/** Chats with at least one customer message in the last 30 days, newest first. */
export async function listChats(brands: Msg91BrandCode[]): Promise<ChatSummary[]> {
  const admin = createAdminClient();
  if (!admin || !brands.length) return [];
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("whatsapp_messages")
    .select("brand_code,mobile,direction,body,message_type,template_name,sent_at,read_at")
    .in("brand_code", brands).gte("sent_at", since)
    .order("sent_at", { ascending: false }).limit(3000);
  if (error) throw new Error("WhatsApp chats could not be loaded.");

  const chats = new Map<string, ChatSummary & { hasCustomerMessage: boolean }>();
  for (const row of data ?? []) {
    const key = `${row.brand_code}:${row.mobile}`;
    let chat = chats.get(key);
    if (!chat) {
      // Rows come newest first, so the first one seen is the latest message.
      chat = {
        brand: row.brand_code as Msg91BrandCode, hasCustomerMessage: false, lastAt: row.sent_at, lastBody: row.body,
        lastFromCustomer: row.direction === "in", mobile: row.mobile, name: null, tags: [], unread: 0,
      };
      chats.set(key, chat);
    }
    if (row.direction !== "in") continue;
    chat.hasCustomerMessage = true;
    if (!row.read_at) chat.unread += 1;
    const stop = row.message_type === "button" && /stop/i.test(row.body);
    if (stop && !chat.tags.includes("stopped")) chat.tags.push("stopped");
    if (!stop && row.template_name && !chat.tags.includes("offer_reply")) chat.tags.push("offer_reply");
  }
  const list = [...chats.values()].filter((chat) => chat.hasCustomerMessage);
  for (const chat of list) if (chat.unread) chat.tags.unshift("new");

  const mobiles = [...new Set(list.map((chat) => chat.mobile))];
  if (mobiles.length) {
    const { data: profiles } = await admin.from("customer_profiles").select("mobile,preferred_name").in("mobile", mobiles);
    const names = new Map((profiles ?? []).map((profile) => [profile.mobile, profile.preferred_name]));
    for (const chat of list) chat.name = names.get(chat.mobile) ?? null;
  }
  return list.map((chat) => ({
    brand: chat.brand, lastAt: chat.lastAt, lastBody: chat.lastBody, lastFromCustomer: chat.lastFromCustomer,
    mobile: chat.mobile, name: chat.name, tags: chat.tags, unread: chat.unread,
  }));
}

/** One conversation, oldest first: the customer's messages, staff replies and the app's template sends. */
export async function chatEntries(brand: Msg91BrandCode, mobile: string): Promise<ChatEntry[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: messages }, { data: sends }] = await Promise.all([
    admin.from("whatsapp_messages").select("direction,body,message_type,sent_at")
      .eq("brand_code", brand).eq("mobile", mobile).gte("sent_at", since).order("sent_at", { ascending: false }).limit(200),
    admin.from("whatsapp_deliveries").select("kind,status,created_at")
      .eq("brand_code", brand).eq("recipient", `91${mobile}`).in("kind", Object.keys(templateLabels))
      .gte("created_at", since).order("created_at", { ascending: false }).limit(50),
  ]);
  const entries: ChatEntry[] = [
    ...(messages ?? []).map((row) => ({
      at: row.sent_at,
      body: row.body,
      direction: row.direction as "in" | "out",
      label: row.message_type === "button" ? "Tapped a button" : null,
      status: null,
    })),
    ...(sends ?? []).map((row) => ({
      at: row.created_at,
      body: "",
      direction: "out" as const,
      label: templateLabels[row.kind] ?? "Template",
      status: row.status,
    })),
  ];
  return entries.sort((left, right) => left.at.localeCompare(right.at));
}

export async function lastCustomerMessageAt(brand: Msg91BrandCode, mobile: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("whatsapp_messages").select("sent_at")
    .eq("brand_code", brand).eq("mobile", mobile).eq("direction", "in")
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return data?.sent_at ?? null;
}

export async function markChatRead(brand: Msg91BrandCode, mobile: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("whatsapp_messages").update({ read_at: new Date().toISOString() })
    .eq("brand_code", brand).eq("mobile", mobile).eq("direction", "in").is("read_at", null);
}

export async function unreadChatCount(brands: Msg91BrandCode[]) {
  const admin = createAdminClient();
  if (!admin || !brands.length) return 0;
  const { data } = await admin.from("whatsapp_messages").select("brand_code,mobile")
    .in("brand_code", brands).eq("direction", "in").is("read_at", null).limit(2000);
  return new Set((data ?? []).map((row) => `${row.brand_code}:${row.mobile}`)).size;
}

/** The stores' WhatsApp numbers this person may read and answer: the owner all, a manager their stores'. */
export async function inboxBrands(profile: Profile | null | undefined): Promise<Msg91BrandCode[]> {
  if (!profile || profile.is_active === false) return [];
  if (profile.role !== "owner" && profile.role !== "manager") return [];
  const stores = await getAccessibleStores(profile);
  return (["GP", "BM"] as const).filter((brand) => stores.some((store) => store.code === brand));
}
