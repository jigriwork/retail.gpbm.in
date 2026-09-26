"use server";

import { createHash, randomBytes } from "node:crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth/session";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type StaffActionState = { ok: boolean; message: string };

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function validTemporaryPassword(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

async function verifyCurrentPassword(email: string, password: string) {
  if (!password) return false;
  const verifier = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  await verifier.auth.signOut();
  return !error;
}

async function securityEvent(input: {
  actorId: string;
  actorRole: string;
  authUserId?: string | null;
  employeeId: string;
  eventType: string;
  outcome?: string;
  safeMetadata?: Json;
  storeId: string;
}) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("staff_security_events").insert({
    actor_id: input.actorId,
    actor_role: input.actorRole,
    auth_user_id: input.authUserId ?? null,
    employee_contact_id: input.employeeId,
    event_type: input.eventType,
    outcome: input.outcome ?? "success",
    safe_metadata: input.safeMetadata ?? {},
    store_id: input.storeId,
  });
}

export async function requestStaffAccount(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) {
    return { ok: false, message: "Staff account access denied." };
  }
  const employeeId = value(formData, "employeeId");
  const email = value(formData, "email").toLowerCase();
  if (!employeeId || !validEmail(email)) return { ok: false, message: "Enter a valid personal email." };
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_manage_staff_employee", { p_employee_id: employeeId });
  if (!allowed) return { ok: false, message: "You can request accounts only for active employees in assigned stores." };
  const { data: employee } = await supabase.from("employee_contacts").select("id,store_id,staff_name").eq("id", employeeId).maybeSingle();
  if (!employee?.store_id) return { ok: false, message: "Employee store is missing." };
  const status = profile.role === "owner" ? "approved" : "pending";
  const { data: request, error } = await supabase.from("staff_account_requests").insert({
    decision_at: profile.role === "owner" ? new Date().toISOString() : null,
    decision_by: profile.role === "owner" ? profile.id : null,
    employee_contact_id: employee.id,
    requested_by: profile.id,
    requested_email: email,
    status,
    store_id: employee.store_id,
  }).select("id").single();
  if (error) return { ok: false, message: error.code === "23505" ? "This employee or email already has an open request." : error.message };
  await securityEvent({ actorId: profile.id, actorRole: profile.role, employeeId, eventType: "request_created", safeMetadata: { request_id: request.id, status }, storeId: employee.store_id });
  revalidatePath("/app/staff-accounts");
  return { ok: true, message: profile.role === "owner" ? "Request approved. You can now create the account." : "Request sent for owner approval." };
}

export async function decideStaffRequest(formData: FormData): Promise<void> {
  const { profile } = await requireProfile();
  if (profile?.role !== "owner") return;
  const requestId = value(formData, "requestId");
  const decision = value(formData, "decision");
  if (!requestId || !["approved", "rejected"].includes(decision)) return;
  const supabase = await createClient();
  const { data: request } = await supabase.from("staff_account_requests").select("*").eq("id", requestId).eq("status", "pending").maybeSingle();
  if (!request) return;
  await supabase.from("staff_account_requests").update({ decision_at: new Date().toISOString(), decision_by: profile.id, decision_reason: value(formData, "reason") || null, status: decision }).eq("id", request.id).eq("status", "pending");
  await securityEvent({ actorId: profile.id, actorRole: profile.role, employeeId: request.employee_contact_id, eventType: decision === "approved" ? "request_approved" : "request_rejected", safeMetadata: { request_id: request.id }, storeId: request.store_id });
  revalidatePath("/app/staff-accounts");
}

export async function createStaffAccount(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const { user, profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role) || !profile.email) return { ok: false, message: "Account creation denied." };
  const employeeId = value(formData, "employeeId");
  const requestId = value(formData, "requestId") || undefined;
  const email = value(formData, "email").toLowerCase();
  const temporaryPassword = value(formData, "temporaryPassword");
  const currentPassword = value(formData, "currentPassword");
  if (!validEmail(email)) return { ok: false, message: "Enter a valid personal email." };
  if (!validTemporaryPassword(temporaryPassword)) return { ok: false, message: "Temporary password must be 10+ characters with a letter, number and symbol." };
  if (!(await verifyCurrentPassword(profile.email, currentPassword))) return { ok: false, message: "Confirm your own current password to continue." };
  const supabase = await createClient();
  const [{ data: allowed }, { data: withinLimit }, { data: employee }] = await Promise.all([
    supabase.rpc("can_manage_staff_employee", { p_employee_id: employeeId }),
    supabase.rpc("consume_credential_action_limit", { p_employee_id: employeeId }),
    supabase.from("employee_contacts").select("id,staff_name,store_id").eq("id", employeeId).maybeSingle(),
  ]);
  if (!allowed || !withinLimit || !employee?.store_id) return { ok: false, message: withinLimit === false ? "Reset limit reached. Try again after one hour." : "Employee access denied." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Server Auth administration is not configured." };
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { full_name: employee.staff_name } });
  if (createError || !created.user) return { ok: false, message: createError?.message ?? "Unable to create staff Auth user." };
  const { error: finalizeError } = await supabase.rpc("finalize_staff_account", { p_auth_user_id: created.user.id, p_email: email, p_employee_id: employeeId, p_request_id: requestId });
  if (finalizeError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: finalizeError.message };
  }
  await securityEvent({ actorId: user.id, actorRole: profile.role, authUserId: created.user.id, employeeId, eventType: "temporary_password_issued", storeId: employee.store_id });
  revalidatePath("/app/staff-accounts");
  return { ok: true, message: "Staff account created. Share the temporary password privately; it will not be shown again." };
}

export async function resetStaffTemporaryPassword(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role) || !profile.email) return { ok: false, message: "Password reset denied." };
  const employeeId = value(formData, "employeeId");
  const temporaryPassword = value(formData, "temporaryPassword");
  if (!validTemporaryPassword(temporaryPassword)) return { ok: false, message: "Temporary password must be 10+ characters with a letter, number and symbol." };
  if (!(await verifyCurrentPassword(profile.email, value(formData, "currentPassword")))) return { ok: false, message: "Confirm your own current password to continue." };
  const supabase = await createClient();
  const [{ data: allowed }, { data: withinLimit }, { data: link }] = await Promise.all([
    supabase.rpc("can_manage_staff_employee", { p_employee_id: employeeId }),
    supabase.rpc("consume_credential_action_limit", { p_employee_id: employeeId }),
    supabase.from("employee_auth_links").select("auth_user_id,status").eq("employee_contact_id", employeeId).maybeSingle(),
  ]);
  if (!allowed || !withinLimit || !link || link.status !== "active") return { ok: false, message: withinLimit === false ? "Reset limit reached. Try again after one hour." : "Active staff account not found." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Server Auth administration is not configured." };
  const { error: gateError } = await admin.from("employee_auth_links").update({ must_change_password: true }).eq("employee_contact_id", employeeId).eq("auth_user_id", link.auth_user_id);
  if (gateError) return { ok: false, message: "Unable to secure the account for password reset." };
  const { error } = await admin.auth.admin.updateUserById(link.auth_user_id, { password: temporaryPassword });
  if (error) {
    const { data: employee } = await admin.from("employee_contacts").select("store_id").eq("id", employeeId).maybeSingle();
    if (employee?.store_id) await securityEvent({ actorId: profile.id, actorRole: profile.role, authUserId: link.auth_user_id, employeeId, eventType: "credential_action_denied", outcome: "failed", safeMetadata: { operation: "temporary_password_reset" }, storeId: employee.store_id });
    return { ok: false, message: error.message };
  }
  await supabase.rpc("record_staff_password_issued", { p_employee_id: employeeId, p_event_type: "temporary_password_reset" });
  revalidatePath("/app/staff-accounts");
  return { ok: true, message: "Temporary password reset. The staff member must change it at next login." };
}

export async function setStaffAccountActive(formData: FormData) {
  const { profile } = await requireProfile();
  if (profile?.role !== "owner" || !profile.email) return;
  const employeeId = value(formData, "employeeId");
  const active = value(formData, "active") === "true";
  if (!(await verifyCurrentPassword(profile.email, value(formData, "currentPassword")))) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { data: link } = await admin.from("employee_auth_links").select("*").eq("employee_contact_id", employeeId).maybeSingle();
  if (!link) return;
  await admin.from("employee_auth_links").update({ status: active ? "active" : "inactive", activated_at: active ? new Date().toISOString() : link.activated_at, activated_by: active ? profile.id : link.activated_by, deactivated_at: active ? null : new Date().toISOString(), deactivated_by: active ? null : profile.id, deactivation_reason: active ? null : value(formData, "reason") || "Owner deactivated" }).eq("id", link.id);
  await admin.from("profiles").update({ is_active: active }).eq("id", link.auth_user_id).eq("role", "staff");
  await admin.auth.admin.updateUserById(link.auth_user_id, { ban_duration: active ? "none" : "876000h" });
  await securityEvent({ actorId: profile.id, actorRole: profile.role, authUserId: link.auth_user_id, employeeId, eventType: active ? "account_reactivated" : "account_deactivated", safeMetadata: { reason: active ? null : value(formData, "reason") || "Owner deactivated" }, storeId: link.store_id });
  revalidatePath("/app/staff-accounts");
}

export async function changeStaffPassword(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const { profile } = await requireProfile();
  if (profile?.role !== "staff" || !profile.email) return { ok: false, message: "Staff password change denied." };
  const currentPassword = value(formData, "currentPassword");
  const newPassword = value(formData, "newPassword");
  if (!validTemporaryPassword(newPassword)) return { ok: false, message: "New password must be 10+ characters with a letter, number and symbol." };
  if (newPassword !== value(formData, "confirmPassword")) return { ok: false, message: "New passwords do not match." };
  if (!(await verifyCurrentPassword(profile.email, currentPassword))) return { ok: false, message: "Current password is incorrect." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: error.message };
  const { error: finishError } = await supabase.rpc("finish_own_staff_password_change");
  if (finishError) return { ok: false, message: "Password changed, but account finalization failed. Contact the owner." };
  revalidatePath("/staff");
  return { ok: true, message: "Private password saved. Your dashboard is now available." };
}

export async function verifySalaryPassword(
  _state: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const { user, profile } = await requireProfile();
  if (profile?.role !== "staff" || !profile.email) return { ok: false, message: "Salary access denied." };
  if (!(await verifyCurrentPassword(profile.email, value(formData, "currentPassword")))) return { ok: false, message: "Password is incorrect." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Secure salary access is unavailable." };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await admin.from("sensitive_access_grants").update({ revoked_at: new Date().toISOString() }).eq("auth_user_id", user.id).eq("purpose", "salary").is("revoked_at", null);
  const { error } = await admin.from("sensitive_access_grants").insert({ auth_user_id: user.id, expires_at: expiresAt.toISOString(), purpose: "salary", token_hash: tokenHash });
  if (error) return { ok: false, message: "Unable to create secure salary session." };
  const cookieStore = await cookies();
  cookieStore.set("gpbm_staff_salary_grant", token, { httpOnly: true, maxAge: 600, path: "/", sameSite: "strict", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/staff/salary");
  revalidatePath("/staff/payslips");
  return { ok: true, message: "Salary access unlocked for 10 minutes." };
}

export async function completeStaffTask(formData: FormData) {
  const taskId = value(formData, "taskId");
  const supabase = await createClient();
  await supabase.rpc("complete_my_task", { p_completion_note: value(formData, "completionNote") || undefined, p_task_id: taskId });
  revalidatePath("/staff/tasks");
  revalidatePath("/staff");
}

export async function verifySalesAlias(formData: FormData) {
  const { profile } = await requireProfile();
  if (profile?.role !== "owner") return;
  const aliasId = value(formData, "aliasId");
  const employeeId = value(formData, "employeeId");
  const supabase = await createClient();
  const { data: employee } = await supabase.from("employee_contacts").select("id,store_id").eq("id", employeeId).maybeSingle();
  if (!employee?.store_id) return;
  await supabase.from("staff_name_aliases").update({ employee_contact_id: employee.id, verification_status: "verified", verified_at: new Date().toISOString(), verified_by: profile.id }).eq("id", aliasId).eq("store_id", employee.store_id);
  revalidatePath("/app/staff-accounts");
}

export async function linkPayrollRow(formData: FormData) {
  const { profile } = await requireProfile();
  if (profile?.role !== "owner") return;
  const employeeId = value(formData, "employeeId");
  const payslipRowId = value(formData, "payslipRowId");
  const supabase = await createClient();
  const { data: employee } = await supabase.from("employee_contacts").select("id,store_id").eq("id", employeeId).maybeSingle();
  const { data: row } = await supabase.from("payslip_rows").select("id,store_id").eq("id", payslipRowId).maybeSingle();
  if (!employee || !row || employee.store_id !== row.store_id) return;
  await supabase.from("payslip_rows").update({ employee_contact_id: employee.id }).eq("id", row.id);
  await supabase.from("generated_payslips").update({ employee_contact_id: employee.id }).eq("payslip_row_id", row.id);
  revalidatePath("/app/staff-accounts");
}
