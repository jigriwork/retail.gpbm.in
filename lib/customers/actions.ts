"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { canAccessStore, requireOwner, requireProfile } from "@/lib/auth/session";
import { customerMessage, type MessageKind, messageKinds, whatsAppUrl } from "@/lib/customers/messages";
import { createClient } from "@/lib/supabase/server";

type State = AccountsActionState;

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

const isMobile = (value: string) => /^[6-9]\d{9}$/.test(value);

async function staffProfile() {
  const { profile } = await requireProfile();
  return profile && profile.is_active === true && ["owner", "manager"].includes(profile.role) ? profile : null;
}

export async function saveCustomerProfile(_state: State, formData: FormData): Promise<State> {
  if (!(await staffProfile())) return { ok: false, message: "Your account cannot edit customers." };
  const mobile = text(formData, "mobile", 10);
  if (!isMobile(mobile)) return { ok: false, message: "Customer not found." };
  const consent = formData.get("consent") === "on";
  const source = text(formData, "consentSource", 20) || null;
  const date = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(text(formData, key, 10)) ? text(formData, key, 10) : null);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_customer_profile", {
    p_mobile: mobile, p_name: text(formData, "name", 80) || null, p_birthday: date("birthday"), p_anniversary: date("anniversary"),
    p_consent: consent, p_source: consent ? source : null, p_do_not_contact: formData.get("doNotContact") === "on", p_note: text(formData, "note", 300) || null,
  });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not save. Please retry." };
  revalidatePath(`/app/customers/${mobile}`);
  revalidatePath("/app/customers");
  return { ok: true, message: "Saved." };
}

/** Logs the message and returns the WhatsApp link to open; refuses offers without consent. */
export async function prepareCustomerMessage(mobile: string, storeId: string, kind: MessageKind) {
  const profile = await staffProfile();
  if (!profile || !isMobile(mobile) || !messageKinds.some((item) => item.kind === kind) || !(await canAccessStore(storeId, profile))) {
    return { ok: false as const, message: "You cannot message this customer." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_customer_message", { p_mobile: mobile, p_store: storeId, p_kind: kind });
  if (error) return { ok: false as const, message: error.code === "P0001" ? error.message : "Could not prepare the message." };
  const [{ data: store }, { data: name }] = await Promise.all([
    supabase.from("stores").select("name,google_review_url").eq("id", storeId).maybeSingle(),
    supabase.rpc("customer_list", { p_store: storeId, p_segment: "all", p_search: mobile, p_limit: 1, p_offset: 0 }),
  ]);
  const text = customerMessage(kind, { name: name?.[0]?.name ?? null, reviewUrl: store?.google_review_url ?? null, store: store?.name ?? "our store" });
  revalidatePath("/app/customers");
  return { ok: true as const, url: whatsAppUrl(mobile, text) };
}

export async function saveReviewLink(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner sets review links." };
  const url = text(formData, "url", 300);
  if (url && !/^https:\/\/\S+$/.test(url)) return { ok: false, message: "Paste the full link starting with https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("stores").update({ google_review_url: url || null }).eq("id", text(formData, "storeId", 60));
  if (error) return { ok: false, message: "Could not save the link." };
  revalidatePath("/app/customers");
  return { ok: true, message: url ? "Review link saved. Thank-you messages will include it." : "Review link removed." };
}
