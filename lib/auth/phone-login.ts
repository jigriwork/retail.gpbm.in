import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { sendMsg91Template } from "@/lib/msg91/client";
import { getMsg91Config } from "@/lib/msg91/config";
import { createAdminClient } from "@/lib/supabase/server";

// Mobile-number login: a 6-digit WhatsApp code (first login and "Forgot PIN"),
// then the person's own 6-digit PIN. Codes are stored only as HMACs, expire
// in 10 minutes and allow 5 tries; sends and PIN tries are rate limited.

export const loginCodeTemplate = process.env.MSG91_LOGIN_CODE_TEMPLATE?.trim() || "gpbm_login_code_v1";
const codeTtlMs = 10 * 60 * 1000;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type LoginTarget =
  | { kind: "profile"; id: string; name: string; pinSet: boolean }
  | { kind: "staff"; employeeId: string; name: string }
  | { kind: "duplicate" }
  | { kind: "none" };

export function tenDigitMobile(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^(?:91|0)(?=[6-9]\d{9}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function admin(): Admin {
  const client = createAdminClient();
  if (!client) throw new Error("Login service is not configured.");
  return client;
}

function codeHash(phone: string, code: string) {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHmac("sha256", pepper).update(`${phone}:${code}`).digest("hex");
}

async function countEvents(db: Admin, phone: string, kind: string, sinceMs: number) {
  const { count } = await db.from("login_events").select("id", { count: "exact", head: true })
    .eq("phone", phone).eq("kind", kind).gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  return count ?? 0;
}

async function logEvent(db: Admin, phone: string, kind: "code_sent" | "code_failed" | "code_ok" | "pin_failed" | "pin_ok") {
  await db.from("login_events").insert({ kind, phone });
}

/** Who this number belongs to: an existing login, or an active staff-list entry without one. */
export async function findLoginTarget(phone: string): Promise<LoginTarget> {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("id,full_name,is_active,pin_set_at").eq("login_phone", phone).maybeSingle();
  if (profile) return profile.is_active ? { id: profile.id, kind: "profile", name: profile.full_name ?? "", pinSet: Boolean(profile.pin_set_at) } : { kind: "none" };

  const { data: candidates } = await db.from("employee_contacts").select("id,staff_name,phone,whatsapp_phone,normalized_phone")
    .eq("is_active", true).or(`phone.ilike.%${phone},whatsapp_phone.ilike.%${phone},normalized_phone.ilike.%${phone}`).limit(10);
  const matches = (candidates ?? []).filter((row) => [row.whatsapp_phone, row.phone, row.normalized_phone].some((value) => tenDigitMobile(value ?? "") === phone));
  if (matches.length > 1) return { kind: "duplicate" };
  if (!matches.length) return { kind: "none" };
  const employee = matches[0];
  // A staff login that exists but was never given this number: use it.
  const { data: link } = await db.from("employee_auth_links").select("auth_user_id,status").eq("employee_contact_id", employee.id).maybeSingle();
  if (link) {
    if (link.status !== "active") return { kind: "none" };
    const { data: linked } = await db.from("profiles").select("id,full_name,is_active,pin_set_at,login_phone").eq("id", link.auth_user_id).maybeSingle();
    if (!linked?.is_active) return { kind: "none" };
    if (!linked.login_phone) await db.from("profiles").update({ login_phone: phone }).eq("id", linked.id);
    return { id: linked.id, kind: "profile", name: linked.full_name ?? employee.staff_name, pinSet: Boolean(linked.pin_set_at) };
  }
  return { employeeId: employee.id, kind: "staff", name: employee.staff_name };
}

/** The store whose WhatsApp number sends this person's code: their own store, else Go Planet. */
async function senderBrand(db: Admin, phone: string): Promise<"GP" | "BM"> {
  const target = await findLoginTarget(phone);
  let storeId: string | null = null;
  if (target.kind === "staff") {
    storeId = (await db.from("employee_contacts").select("store_id").eq("id", target.employeeId).maybeSingle()).data?.store_id ?? null;
  } else if (target.kind === "profile") {
    storeId = (await db.from("employee_auth_links").select("store_id").eq("auth_user_id", target.id).maybeSingle()).data?.store_id
      ?? (await db.from("store_users").select("store_id").eq("user_id", target.id).limit(1).maybeSingle()).data?.store_id
      ?? null;
  }
  if (!storeId) return "GP";
  const { data: store } = await db.from("stores").select("code").eq("id", storeId).maybeSingle();
  return store?.code?.toUpperCase() === "BM" ? "BM" : "GP";
}

export async function sendLoginCode(phone: string): Promise<{ ok: boolean; message: string }> {
  const db = admin();
  if ((await countEvents(db, phone, "code_sent", 15 * 60 * 1000)) >= 3 || (await countEvents(db, phone, "code_sent", 24 * 60 * 60 * 1000)) >= 10) {
    return { ok: false, message: "Too many codes for this number. Wait 15 minutes and try again." };
  }
  const brand = await senderBrand(db, phone);
  const config = getMsg91Config(brand) ?? getMsg91Config(brand === "BM" ? "GP" : "BM");
  if (!config) return { ok: false, message: "WhatsApp sending is not configured." };
  const code = String(randomInt(100000, 1000000));
  await db.from("login_codes").update({ consumed_at: new Date().toISOString() }).eq("phone", phone).is("consumed_at", null);
  const { error } = await db.from("login_codes").insert({ code_hash: codeHash(phone, code), expires_at: new Date(Date.now() + codeTtlMs).toISOString(), phone });
  if (error) return { ok: false, message: "The code could not be prepared. Please retry." };
  // Local testing only: never send WhatsApp from a development server with this flag.
  const dryRun = process.env.NODE_ENV !== "production" && process.env.LOGIN_CODE_DRY_RUN === "1";
  const sent = dryRun ? { ok: true } : await sendMsg91Template(config, loginCodeTemplate, [{
    components: { body_1: { type: "text", value: code }, button_1: { subtype: "url", type: "text", value: code } },
    to: `91${phone}`,
  }]);
  if (!sent.ok) return { ok: false, message: "WhatsApp did not accept the code. Please retry in a minute." };
  await logEvent(db, phone, "code_sent");
  return { ok: true, message: "Code sent on WhatsApp." };
}

/** Checks the code; on success returns the login's user id, creating a staff login when needed. */
export async function verifyLoginCode(phone: string, code: string): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const db = admin();
  if (!/^\d{6}$/.test(code)) return { message: "Enter the 6-digit code.", ok: false };
  const { data: row } = await db.from("login_codes").select("id,code_hash,expires_at,attempts")
    .eq("phone", phone).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) return { message: "This code has expired. Ask for a new one.", ok: false };
  if (row.attempts >= 5) return { message: "Too many wrong tries. Ask for a new code.", ok: false };
  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(codeHash(phone, code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await db.from("login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    await logEvent(db, phone, "code_failed");
    return { message: "Wrong code. Check WhatsApp and try again.", ok: false };
  }
  await db.from("login_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  await logEvent(db, phone, "code_ok");

  const target = await findLoginTarget(phone);
  let userId: string;
  if (target.kind === "profile") {
    userId = target.id;
  } else if (target.kind === "staff") {
    const email = `${phone}@staff.gpbm.in`;
    const { data: created, error } = await db.auth.admin.createUser({
      email, email_confirm: true, password: `${randomInt(100000000, 999999999)}x${Date.now()}`, user_metadata: { full_name: target.name },
    });
    if (error || !created.user) return { message: "Your login could not be created. Ask the owner.", ok: false };
    const { error: linkError } = await db.rpc("link_staff_login_by_phone", { p_auth_user: created.user.id, p_email: email, p_employee: target.employeeId, p_phone: phone });
    if (linkError) {
      await db.auth.admin.deleteUser(created.user.id);
      return { message: "Your login could not be linked to the staff list. Ask the owner.", ok: false };
    }
    userId = created.user.id;
  } else {
    return { message: target.kind === "duplicate" ? "Two staff share this number. Ask the owner to fix it." : "This number is not registered. Ask the owner.", ok: false };
  }
  // A code login always ends with choosing a (new) PIN.
  await db.from("profiles").update({ phone_verified_at: new Date().toISOString(), pin_set_at: null }).eq("id", userId);
  await db.from("employee_auth_links").update({ must_change_password: true }).eq("auth_user_id", userId);
  return { ok: true, userId };
}

/** Email of the auth user behind a login (never shown to the person). */
export async function loginEmail(userId: string) {
  const { data } = await admin().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

/** One-time sign-in token for a user who just proved their number. */
export async function sessionTokenFor(userId: string) {
  const email = await loginEmail(userId);
  if (!email) return null;
  const { data } = await admin().auth.admin.generateLink({ email, type: "magiclink" });
  return data?.properties?.hashed_token ?? null;
}

export async function pinLockedOut(phone: string) {
  return (await countEvents(admin(), phone, "pin_failed", 15 * 60 * 1000)) >= 5;
}

export async function recordPinResult(phone: string, ok: boolean) {
  await logEvent(admin(), phone, ok ? "pin_ok" : "pin_failed");
}
