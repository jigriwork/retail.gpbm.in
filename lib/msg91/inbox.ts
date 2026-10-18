import "server-only";

import { getMsg91Config, type Msg91BrandCode } from "@/lib/msg91/config";
import { notifyUsers, ownerIds, storePeople } from "@/lib/notifications/send";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

// Customers' replies to the stores' WhatsApp numbers come from MSG91's log
// report (direction 0), read by the same sync that updates delivery statuses.

export type InboundLogRow = {
  content?: string | null;
  customerNumber?: string;
  direction?: number | string;
  integratedNumber?: string | null;
  messageType?: string | null;
  requestedAt?: string | null;
  templateName?: string | null;
  uuid?: string | null;
};

const mediaLabels: Record<string, string> = {
  audio: "🎤 Voice message",
  document: "📄 Document",
  image: "📷 Photo",
  location: "📍 Location",
  sticker: "Sticker",
  video: "🎬 Video",
};

export function brandForNumber(integratedNumber: string | null | undefined): Msg91BrandCode | null {
  const digits = (integratedNumber ?? "").replace(/\D/g, "");
  if (!digits) return null;
  for (const code of ["GP", "BM"] as const) {
    if (getMsg91Config(code)?.integratedNumber === digits) return code;
  }
  return null;
}

/** The text a customer sent: typed text, a tapped button, or a label for media. */
export function inboundBody(row: InboundLogRow) {
  const parsed = parseContent(row);
  // MSG91 escapes line breaks inside the text twice.
  return { ...parsed, body: parsed.body.replace(/\\n/g, "\n").replace(/\\t/g, " ").slice(0, 4096) };
}

function parseContent(row: InboundLogRow) {
  const type = (row.messageType ?? "text").toLowerCase();
  if (type === "unsupported") return { body: "Message WhatsApp could not show (open WhatsApp on the phone)", type };
  let content: unknown = row.content ?? "";
  if (typeof content === "string" && /^\s*[{[]/.test(content)) {
    try {
      content = JSON.parse(content);
    } catch {
      // Keep the raw string.
    }
  }
  if (typeof content === "string") return { body: content.slice(0, 4096), type };
  const record = (content ?? {}) as Record<string, unknown>;
  const pick = (value: unknown) => (value && typeof value === "object" ? value as Record<string, unknown> : {});
  if (typeof record.text === "string") return { body: record.text.slice(0, 4096), type };
  if (typeof record.reaction === "string") return { body: `Reacted ${record.reaction}`, type: "reaction" };
  const button = pick(record.button);
  if (typeof button.text === "string") return { body: button.text.slice(0, 4096), type: "button" };
  for (const [key, label] of Object.entries(mediaLabels)) {
    if (record[key] !== undefined) {
      const caption = pick(record[key]).caption;
      return { body: typeof caption === "string" && caption ? `${label}: ${caption}`.slice(0, 4096) : label, type: key };
    }
  }
  return { body: mediaLabels[type] ?? "Message", type };
}

function indiaTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(`${value.trim().replace(" ", "T")}+05:30`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** Saves customers' replies found in MSG91's logs; already saved ones are skipped. */
export async function saveInboundMessages(rows: InboundLogRow[]) {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data: stores } = await admin.from("stores").select("id,code").in("code", ["GP", "BM"]);
  const storeByBrand = new Map((stores ?? []).map((store) => [store.code, store.id]));
  const inserts: TablesInsert<"whatsapp_messages">[] = [];
  for (const row of rows) {
    if (String(row.direction ?? "") !== "0" || !row.uuid) continue;
    const brand = brandForNumber(row.integratedNumber);
    const digits = (row.customerNumber ?? "").replace(/\D/g, "");
    const mobile = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : "";
    if (!brand || !/^[6-9]\d{9}$/.test(mobile)) continue;
    const { body, type } = inboundBody(row);
    inserts.push({
      body,
      brand_code: brand,
      direction: "in",
      message_type: type,
      mobile,
      provider_id: row.uuid,
      sent_at: indiaTime(row.requestedAt) ?? new Date().toISOString(),
      store_id: storeByBrand.get(brand) ?? null,
      template_name: row.templateName || null,
    });
  }
  if (!inserts.length) return 0;
  const { data, error } = await admin.from("whatsapp_messages")
    .upsert(inserts, { ignoreDuplicates: true, onConflict: "provider_id" })
    .select("id,body,brand_code,store_id,sent_at");
  if (error) {
    console.error("whatsapp_inbox_save_failed", error.message);
    return 0;
  }
  // Ring the owner and the store's managers for replies from the last 2 hours
  // (older ones found in the logs are saved quietly). No number in the notice.
  const fresh = (data ?? []).filter((row) => Date.now() - Date.parse(row.sent_at) < 2 * 60 * 60 * 1000);
  const owners = fresh.length ? await ownerIds() : [];
  for (const brand of ["GP", "BM"] as const) {
    const rowsForBrand = fresh.filter((row) => row.brand_code === brand);
    if (!rowsForBrand.length) continue;
    const storeId = storeByBrand.get(brand);
    const managers = storeId ? await storePeople([storeId], ["manager"]) : [];
    const storeName = brand === "GP" ? "Go Planet" : "Brand Mark";
    await notifyUsers([...owners, ...managers], {
      body: rowsForBrand.length === 1 ? `“${rowsForBrand[0].body.slice(0, 100)}”` : `${rowsForBrand.length} new messages`,
      kind: "chat",
      tag: `whatsapp-${brand}`,
      title: `💬 WhatsApp reply · ${storeName}`,
      url: "/app/reports/whatsapp",
    });
  }
  return data?.length ?? 0;
}
