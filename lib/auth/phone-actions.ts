"use server";

import { revalidatePath } from "next/cache";

import { findLoginTarget, loginEmail, pinLockedOut, recordPinResult, sendLoginCode, sessionTokenFor, tenDigitMobile, verifyLoginCode } from "@/lib/auth/phone-login";
import { passwordProblem } from "@/lib/auth/password-rules";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Result = { ok: boolean; message: string; next?: "pin" | "code" | "done" };

const notRegistered = "This number is not registered. Ask the owner to add it.";

/** Step 1: a number with a password asks for it; otherwise a WhatsApp code is sent. */
export async function startPhoneLogin(input: string): Promise<Result> {
  const phone = tenDigitMobile(input);
  if (!phone) return { message: "Enter your 10-digit mobile number.", ok: false };
  const target = await findLoginTarget(phone);
  if (target.kind === "none") return { message: notRegistered, ok: false };
  if (target.kind === "duplicate") return { message: "Two staff share this number. Ask the owner to fix it.", ok: false };
  if (target.kind === "profile" && target.pinSet) return { message: "", next: "pin", ok: true };
  const sent = await sendLoginCode(phone);
  return sent.ok ? { message: "We sent a 6-digit code to your WhatsApp.", next: "code", ok: true } : { message: sent.message, ok: false };
}

/** "Forgot password": a new WhatsApp code. */
export async function resendLoginCode(input: string): Promise<Result> {
  const phone = tenDigitMobile(input);
  if (!phone) return { message: "Enter your 10-digit mobile number.", ok: false };
  const target = await findLoginTarget(phone);
  if (target.kind !== "profile" && target.kind !== "staff") return { message: target.kind === "duplicate" ? "Two staff share this number. Ask the owner to fix it." : notRegistered, ok: false };
  const sent = await sendLoginCode(phone);
  return sent.ok ? { message: "We sent a 6-digit code to your WhatsApp.", next: "code", ok: true } : { message: sent.message, ok: false };
}

export async function loginWithCode(input: string, code: string): Promise<Result> {
  const phone = tenDigitMobile(input);
  if (!phone) return { message: "Enter your 10-digit mobile number.", ok: false };
  const verified = await verifyLoginCode(phone, String(code ?? "").trim());
  if (!verified.ok) return { message: verified.message, ok: false };
  const tokenHash = await sessionTokenFor(verified.userId);
  if (!tokenHash) return { message: "Login could not be completed. Please retry.", ok: false };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) return { message: "Login could not be completed. Please retry.", ok: false };
  return { message: "", next: "done", ok: true };
}

export async function loginWithPin(input: string, pin: string): Promise<Result> {
  const phone = tenDigitMobile(input);
  if (!phone) return { message: "Enter your 10-digit mobile number.", ok: false };
  if (await pinLockedOut(phone)) return { message: "Too many wrong passwords. Wait 15 minutes, or use “Forgot password”.", ok: false };
  const target = await findLoginTarget(phone);
  if (target.kind !== "profile" || !target.pinSet) return { message: "Log in with a WhatsApp code first.", ok: false };
  const email = await loginEmail(target.id);
  if (!email) return { message: "Login could not be completed. Please retry.", ok: false };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: String(pin ?? "") });
  await recordPinResult(phone, !error);
  if (error) return { message: "Wrong password. Try again or use “Forgot password”.", ok: false };
  return { message: "", next: "done", ok: true };
}

/** After a WhatsApp code login: the person's own password (letters and/or numbers) for next time. */
export async function setOwnPin(_state: Result, formData: FormData): Promise<Result> {
  const { user } = await requireProfile();
  const pin = String(formData.get("pin") ?? "");
  const problem = passwordProblem(pin);
  if (problem) return { message: problem, ok: false };
  if (pin !== String(formData.get("confirm") ?? "")) return { message: "The two passwords do not match.", ok: false };
  const admin = createAdminClient();
  if (!admin) return { message: "Login service is not configured.", ok: false };
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: pin });
  if (error) return { message: "The password could not be saved. Please retry.", ok: false };
  const now = new Date().toISOString();
  await admin.from("profiles").update({ pin_set_at: now }).eq("id", user.id);
  await admin.from("employee_auth_links").update({ last_password_changed_at: now, must_change_password: false }).eq("auth_user_id", user.id);
  revalidatePath("/", "layout");
  return { message: "Password saved.", next: "done", ok: true };
}
