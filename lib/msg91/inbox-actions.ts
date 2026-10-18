"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { requireProfile } from "@/lib/auth/session";
import { resolveCustomerRef } from "@/lib/customers/ref";
import { sendMsg91Text } from "@/lib/msg91/client";
import { getMsg91Config, type Msg91BrandCode } from "@/lib/msg91/config";
import { inboxBrands, lastCustomerMessageAt, withinReplyWindow } from "@/lib/msg91/inbox-queries";
import { createAdminClient } from "@/lib/supabase/server";

export async function replyToChat(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const { profile } = await requireProfile();
  const brand = String(formData.get("brand") ?? "") as Msg91BrandCode;
  const mobile = resolveCustomerRef(String(formData.get("chat") ?? "")) ?? "";
  const text = String(formData.get("text") ?? "").trim();
  if (!profile || !(await inboxBrands(profile)).includes(brand) || !mobile) return { ok: false, message: "You cannot reply to this chat." };
  if (!text) return { ok: false, message: "Type a message first." };
  if (text.length > 1000) return { ok: false, message: "Keep the reply under 1,000 characters." };

  const last = await lastCustomerMessageAt(brand, mobile);
  if (!last || !withinReplyWindow(last)) {
    return { ok: false, message: "More than 24 hours since the customer's last message: WhatsApp no longer allows a typed reply. Please call them." };
  }
  const config = getMsg91Config(brand);
  const admin = createAdminClient();
  if (!config || !admin) return { ok: false, message: "WhatsApp is not set up for this store." };

  const sent = await sendMsg91Text(config, `91${mobile}`, text);
  if (!sent.ok) return { ok: false, message: "MSG91 did not accept the reply. Please try again in a minute." };
  const { data: store } = await admin.from("stores").select("id").eq("code", brand).maybeSingle();
  const { error } = await admin.from("whatsapp_messages").insert({
    body: text, brand_code: brand, direction: "out", message_type: "text", mobile,
    provider_id: sent.requestId ?? null, sent_by: profile.id, store_id: store?.id ?? null,
  });
  if (error) console.error("whatsapp_reply_log_failed", error.message);
  revalidatePath("/app/reports/whatsapp");
  return { ok: true, message: "Sent ✓" };
}
