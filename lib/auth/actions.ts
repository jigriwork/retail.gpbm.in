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

  revalidatePath("/app/users");
  return {
    ok: true,
    message: isActive ? "Profile activated." : "Profile deactivated.",
  };
}
