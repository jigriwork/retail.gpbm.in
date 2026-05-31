"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createManager(formData: FormData) {
  const owner = await requireOwner();

  if (!owner) {
    return { ok: false, message: "Only owners can create manager accounts." };
  }

  const admin = createAdminClient();

  if (!admin) {
    return {
      ok: false,
      message: "Manager creation requires service role key in server environment.",
    };
  }

  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const fullName = readString(formData, "fullName");
  const phone = readString(formData, "phone");

  if (!email || !password || !fullName) {
    return { ok: false, message: "Email, password, and full name are required." };
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
    role: "manager",
    is_active: true,
  });

  revalidatePath("/app/users");
  return { ok: true, message: "Manager account created." };
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

  revalidatePath("/app/users");
  return { ok: true, message: "Store assignment updated." };
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

  revalidatePath("/app/users");
  return {
    ok: true,
    message: isActive ? "Profile activated." : "Profile deactivated.",
  };
}
