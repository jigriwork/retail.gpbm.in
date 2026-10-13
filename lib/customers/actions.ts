"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { canAccessStore, requireOwner, requireProfile } from "@/lib/auth/session";
import { customerMessage, type MessageKind, messageKinds, whatsAppUrl } from "@/lib/customers/messages";
import { retryDroppedMessages, sendCustomerTemplate, type ApiMessageKind } from "@/lib/msg91/customer-send";
import { syncWhatsAppStatuses } from "@/lib/msg91/log-sync";
import { resolveCustomerRef } from "@/lib/customers/ref";
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
  const mobile = resolveCustomerRef(text(formData, "mobile", 120)) ?? "";
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
export async function prepareCustomerMessage(ref: string, storeId: string, kind: MessageKind) {
  const profile = await staffProfile();
  // Opening WhatsApp on the phone shows the number, so only the owner uses these buttons.
  if (profile?.role !== "owner") return { ok: false as const, message: "Use “Send via API” instead." };
  const mobile = resolveCustomerRef(ref) ?? "";
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

export async function refreshWhatsAppStatus(): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner can check WhatsApp delivery." };
  const result = await syncWhatsAppStatuses({ force: true });
  if (!result.ok) return { ok: false, message: "MSG91's logs could not be read just now. Please retry in a minute." };
  const retry = await retryDroppedMessages();
  revalidatePath("/app/customers/whatsapp");
  return { ok: true, message: `Checked ${result.checked} messages against MSG91: ${result.updated} updated${retry.sent ? `, ${retry.sent} dropped message${retry.sent === 1 ? "" : "s"} sent again` : ""}.` };
}

/** "Send via WhatsApp API": sends the approved template to one customer through MSG91. */
export async function sendCustomerViaApi(ref: string, storeId: string, kind: ApiMessageKind) {
  const profile = await staffProfile();
  const mobile = resolveCustomerRef(ref) ?? "";
  if (!profile || !isMobile(mobile) || !["thank_you", "lapsed_offer"].includes(kind) || !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You cannot message this customer." };
  }
  const result = await sendCustomerTemplate({ initiatedBy: profile.id, kind, mobile, storeId });
  if (result.ok) {
    revalidatePath("/app/customers");
    revalidatePath(`/app/customers/${mobile}`);
  }
  return result;
}

/** Starts an upload of customer numbers for one store (owner, or that store's manager). */
export async function startCustomerImport(storeId: string, fileName: string, consent: boolean) {
  const profile = await staffProfile();
  if (!profile || !(await canAccessStore(storeId, profile))) return { ok: false as const, message: "You cannot add customers for this store." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_customer_import", { p_consent: consent === true, p_file: String(fileName).slice(0, 200), p_store: storeId });
  if (error || !data) return { ok: false as const, message: error?.code === "P0001" ? error.message : "The upload could not start. Please retry." };
  return { ok: true as const, batchId: data };
}

/** Adds one part (at most 1,000 rows) of an upload; numbers are cleaned and checked in the database. */
export async function importCustomerRows(batchId: string, rows: Array<{ m: string; n: string }>) {
  const profile = await staffProfile();
  if (!profile || typeof batchId !== "string" || !Array.isArray(rows) || rows.length > 1000) return { ok: false as const, message: "Invalid upload." };
  const clean = rows.map((row) => ({ m: String(row?.m ?? "").slice(0, 30), n: String(row?.n ?? "").slice(0, 100) }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_customer_contacts", { p_batch: batchId, p_rows: clean });
  if (error || !data) return { ok: false as const, message: error?.code === "P0001" ? error.message : "This part could not be saved. Please retry." };
  revalidatePath("/app/customers");
  const result = data as { new: number; received: number; valid: number };
  return { ok: true as const, ...result };
}

/** Owner: send the sample purchase receipt to their own WhatsApp again. */
export async function resendReceiptTest(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner." };
  const brand = text(formData, "brand", 2) === "BM" ? "BM" : "GP";
  const { sendReceiptTest } = await import("@/lib/msg91/receipt-backfill");
  const result = await sendReceiptTest(brand);
  revalidatePath("/app/customers/whatsapp");
  return result;
}

/** Owner checked the test (the button opened the Google review page): start using the receipt. */
export async function confirmReceipt(_state: State, formData: FormData): Promise<State> {
  const owner = await requireOwner();
  if (!owner) return { ok: false, message: "Only the owner." };
  const brand = text(formData, "brand", 2) === "BM" ? "BM" : "GP";
  const { getMsg91Config } = await import("@/lib/msg91/config");
  const { receiptStage } = await import("@/lib/msg91/receipt-status");
  const config = getMsg91Config(brand);
  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("id").eq("code", brand).maybeSingle();
  if (!config || !store) return { ok: false, message: "Store not configured." };
  const stage = await receiptStage(config, store.id);
  if (!stage.approved || !stage.testSent) return { ok: false, message: "Wait for the test receipt first." };
  const { createAdminClient } = await import("@/lib/supabase/server");
  await createAdminClient()?.from("audit_logs").insert({
    action: "receipt_confirmed", actor_id: owner.profile.id, actor_role: "owner", entity_id: null, entity_type: "whatsapp_deliveries",
    metadata: { template: stage.template }, store_id: store.id,
  });
  revalidatePath("/app/customers/whatsapp");
  return { ok: true, message: "Started. Receipts go with the next sales upload; failed thank-yous are resent within 30 minutes (9 AM–9 PM)." };
}
