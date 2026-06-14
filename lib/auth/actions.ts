"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireOwner, requireProfile } from "@/lib/auth/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type AuthActionState = {
  ok: boolean;
  message: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function passwordResetRedirectUrl() {
  return `${process.env.NEXT_PUBLIC_SITE_URL || "https://retail.gpbm.in"}/reset-password`;
}

async function requestOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "https";

  if (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")) {
    return `http://${host}`;
  }

  return host ? `${protocol}://${host}` : "https://retail.gpbm.in";
}

async function writeAuthAuditLog({
  action,
  actorId,
  actorRole,
  entityId,
  metadata,
}: {
  action: string;
  actorId: string | null;
  actorRole: string | null;
  entityId: string | null;
  metadata: Json;
}) {
  try {
    const supabase = createAdminClient() ?? (await createClient());
    await supabase.from("audit_logs").insert({
      action,
      actor_id: actorId,
      actor_role: actorRole,
      entity_id: entityId,
      entity_type: "profile",
      metadata,
    });
  } catch {
    // Audit logging must never expose or block password operations.
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changeOwnPassword(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false || !profile.email) {
    return { ok: false, message: "Your account is not active." };
  }

  const currentPassword = readString(formData, "currentPassword");
  const newPassword = readString(formData, "newPassword");
  const confirmPassword = readString(formData, "confirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, message: "Enter your current password and the new password twice." };
  }

  if (newPassword.length < 8) {
    return { ok: false, message: "New password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, message: "New password and confirmation do not match." };
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });

  if (verifyError) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { ok: false, message: error.message };
  }

  await writeAuthAuditLog({
    action: "change_own_password",
    actorId: profile.id,
    actorRole: profile.role,
    entityId: profile.id,
    metadata: {
      changed_by_self: true,
      profile_email: profile.email,
    },
  });

  return { ok: true, message: "Password changed successfully. Please login again if asked." };
}

export async function createUserAccount(formData: FormData) {
  const owner = await requireOwner();

  if (!owner) {
    return { ok: false, message: "Only owners can create users." };
  }

  const admin = createAdminClient();

  if (!admin) {
    return {
      ok: false,
      message: "User creation requires server service key.",
    };
  }

  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const fullName = readString(formData, "fullName");
  const phone = readString(formData, "phone");
  const requestedRole = readString(formData, "role") || "manager";
  const role = requestedRole === "owner" ? "owner" : "manager";

  if (!email || !password || !fullName) {
    return { ok: false, message: "Email, password, and full name are required." };
  }

  if (!["manager", "owner"].includes(role)) {
    return { ok: false, message: "Choose Manager or Owner role." };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: phone || null,
    },
  });

  if (error || !data.user) {
    return {
      ok: false,
      message: error?.message ?? "Unable to create manager account.",
    };
  }

  await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    phone: phone || null,
    role,
    is_active: true,
  });

  await writeAuthAuditLog({
    action: "create_user",
    actorId: owner.profile.id,
    actorRole: owner.profile.role,
    entityId: data.user.id,
    metadata: {
      created_email: email,
      created_role: role,
      full_name: fullName,
    },
  });

  revalidatePath("/app/users");
  return { ok: true, message: `${role === "owner" ? "Owner" : "Manager"} account created.` };
}

export async function createManager(formData: FormData) {
  return createUserAccount(formData);
}

export async function assignManagerToStore(formData: FormData) {
  const owner = await requireOwner();

  if (!owner) {
    return { ok: false, message: "Only owners can assign stores." };
  }

  const userId = readString(formData, "userId");
  const storeId = readString(formData, "storeId");

  if (!userId || !storeId) {
    return { ok: false, message: "Choose a manager and store." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("store_users").upsert({
    user_id: userId,
    store_id: storeId,
    role: "manager",
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  await writeAuthAuditLog({
    action: "assign_user_store",
    actorId: owner.profile.id,
    actorRole: owner.profile.role,
    entityId: userId,
    metadata: {
      store_id: storeId,
      user_id: userId,
    },
  });

  revalidatePath("/app/users");
  return { ok: true, message: "Store assignment updated." };
}

export async function updateManagerStoreAssignments(formData: FormData) {
  const owner = await requireOwner();

  if (!owner) {
    return { ok: false, message: "Only owners can assign stores." };
  }

  const userId = readString(formData, "userId");
  const selectedStoreIds = formData
    .getAll("storeIds")
    .filter((value): value is string => typeof value === "string" && Boolean(value));

  if (!userId) {
    return { ok: false, message: "Missing manager profile." };
  }

  const supabase = await createClient();
  const { data: manager } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", userId)
    .eq("role", "manager")
    .maybeSingle();

  if (!manager) {
    return { ok: false, message: "Choose a valid manager." };
  }

  const { data: activeStores } = await supabase
    .from("stores")
    .select("id")
    .eq("is_active", true)
    .in("code", ["GP", "BM"]);
  const activeStoreIds = new Set((activeStores ?? []).map((store) => store.id));
  const validSelectedStoreIds = [...new Set(selectedStoreIds)].filter((storeId) =>
    activeStoreIds.has(storeId),
  );

  if (validSelectedStoreIds.length) {
    const { error: upsertError } = await supabase.from("store_users").upsert(
      validSelectedStoreIds.map((storeId) => ({
        role: "manager",
        store_id: storeId,
        user_id: userId,
      })),
      { onConflict: "store_id,user_id" },
    );

    if (upsertError) {
      return { ok: false, message: upsertError.message };
    }
  }

  const storesToRemove = [...activeStoreIds].filter(
    (storeId) => !validSelectedStoreIds.includes(storeId),
  );

  if (storesToRemove.length) {
    const { error: deleteError } = await supabase
      .from("store_users")
      .delete()
      .eq("user_id", userId)
      .in("store_id", storesToRemove);

    if (deleteError) {
      return { ok: false, message: deleteError.message };
    }
  }

  await writeAuthAuditLog({
    action: "update_user_store_assignments",
    actorId: owner.profile.id,
    actorRole: owner.profile.role,
    entityId: userId,
    metadata: {
      selected_store_ids: validSelectedStoreIds,
      removed_store_ids: storesToRemove,
      user_id: userId,
    },
  });

  revalidatePath("/app/users");
  return { ok: true, message: "Store assignments saved." };
}

export async function setProfileActive(formData: FormData) {
  const owner = await requireOwner();

  if (!owner) {
    return { ok: false, message: "Only owners can update users." };
  }

  const userId = readString(formData, "userId");
  const isActive = readString(formData, "isActive") === "true";

  if (!userId) {
    return { ok: false, message: "Missing user profile." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await writeAuthAuditLog({
    action: isActive ? "activate_user" : "deactivate_user",
    actorId: owner.profile.id,
    actorRole: owner.profile.role,
    entityId: userId,
    metadata: {
      is_active: isActive,
      user_id: userId,
    },
  });

  revalidatePath("/app/users");
  return {
    ok: true,
    message: isActive ? "Profile activated." : "Profile deactivated.",
  };
}

export async function sendPasswordResetLink(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const owner = await requireOwner();

  if (!owner) {
    return { ok: false, message: "Only owners can send password reset links." };
  }

  const userId = readString(formData, "userId");

  if (!userId) {
    return { ok: false, message: "Missing user profile." };
  }

  const supabase = await createClient();
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("id,email,role,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!userProfile?.email) {
    return { ok: false, message: "User email was not found." };
  }

  const authClient = createAdminClient() ?? supabase;
  const { error } = await authClient.auth.resetPasswordForEmail(userProfile.email, {
    redirectTo: passwordResetRedirectUrl(),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  await writeAuthAuditLog({
    action: "send_password_reset_link",
    actorId: owner.profile.id,
    actorRole: owner.profile.role,
    entityId: userProfile.id,
    metadata: {
      redirect_to: passwordResetRedirectUrl(),
      target_email: userProfile.email,
      target_role: userProfile.role,
    },
  });

  return { ok: true, message: "Password reset link sent." };
}

export async function ownerResetUserPassword(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const owner = await requireOwner();

  if (!owner) {
    return { ok: false, message: "Only owners can reset passwords." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, message: "Temporary password reset requires server service key." };
  }

  const userId = readString(formData, "userId");
  const temporaryPassword = readString(formData, "temporaryPassword");
  const confirmPassword = readString(formData, "confirmPassword");

  if (!userId || !temporaryPassword || !confirmPassword) {
    return { ok: false, message: "Enter and confirm a temporary password." };
  }

  if (temporaryPassword.length < 8) {
    return { ok: false, message: "Temporary password must be at least 8 characters." };
  }

  if (temporaryPassword !== confirmPassword) {
    return { ok: false, message: "Temporary password and confirmation do not match." };
  }

  const supabase = await createClient();
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", userId)
    .maybeSingle();

  if (!userProfile) {
    return { ok: false, message: "User profile was not found." };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  await writeAuthAuditLog({
    action: "owner_reset_user_password",
    actorId: owner.profile.id,
    actorRole: owner.profile.role,
    entityId: userId,
    metadata: {
      target_email: userProfile.email,
      target_role: userProfile.role,
    },
  });

  return {
    ok: true,
    message: "Temporary password set. Share it securely and ask the user to change it after login.",
  };
}

export async function forgotPassword(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = readString(formData, "email");

  if (!email) {
    return { ok: false, message: "Enter your email address." };
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  return {
    ok: true,
    message: "If an account exists for this email, a password reset link has been sent.",
  };
}
