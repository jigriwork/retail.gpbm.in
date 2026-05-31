import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Profile = Tables<"profiles">;
export type Store = Tables<"stores">;
export type StoreAssignment = Tables<"store_users"> & {
  stores: Pick<Store, "id" | "name" | "code"> | null;
};

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}

export async function requireProfile() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
}

export async function getAccessibleStores(profile?: Profile | null) {
  const currentProfile = profile ?? (await getCurrentProfile());

  if (!currentProfile || currentProfile.is_active === false) {
    return [];
  }

  const supabase = await createClient();

  if (currentProfile.role === "owner") {
    const { data } = await supabase
      .from("stores")
      .select("*")
      .eq("is_active", true)
      .order("name");

    return data ?? [];
  }

  const { data } = await supabase
    .from("stores")
    .select("*")
    .eq("is_active", true)
    .order("name");

  return data ?? [];
}

export async function requireOwner() {
  const { user, profile } = await requireProfile();

  if (!profile || profile.role !== "owner" || profile.is_active === false) {
    return null;
  }

  return { user, profile };
}

export async function canAccessStore(storeId: string, profile?: Profile | null) {
  const currentProfile = profile ?? (await getCurrentProfile());

  if (!currentProfile || currentProfile.is_active === false) {
    return false;
  }

  if (currentProfile.role === "owner") {
    return true;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("store_users")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", currentProfile.id)
    .maybeSingle();

  return Boolean(data);
}
