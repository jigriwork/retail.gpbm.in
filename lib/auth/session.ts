import { redirect } from "next/navigation";
import { cache } from "react";

import { completeQuery } from "@/lib/supabase/complete-query";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Profile = Tables<"profiles">;
export type Store = Tables<"stores">;
export type StoreAssignment = Tables<"store_users"> & {
  stores: Store | null;
};

/** Thrown when the login could not be checked (network, server busy); the person is still signed in. */
export class SessionCheckError extends Error {
  constructor() {
    super("Your login could not be checked because of a connection problem. You are still logged in; please try again.");
    this.name = "SessionCheckError";
  }
}

// A brief network or server problem must never look like being logged out:
// only a missing or rejected session (401/403) counts as "not signed in".
function isTemporaryFailure(error: { name?: string; status?: number } | null) {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || !error.status || error.status >= 500 || error.status === 429;
}

/** The signed-in person as the login token states it (verified with the project's signing key). */
export type SessionUser = { email: string | null; id: string };

export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;

  if (typeof id !== "string") {
    if (error && error.name !== "AuthSessionMissingError" && isTemporaryFailure(error)) throw new SessionCheckError();
    return null;
  }
  return { email: typeof data?.claims?.email === "string" ? data.claims.email : null, id };
});

export const getCurrentProfile = cache(async function getCurrentProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new SessionCheckError();
  return data;
});

export const requireProfile = cache(async function requireProfile() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // A failed read is a connection problem, not an inactive account.
  if (error) throw new SessionCheckError();
  if (!profile || profile.is_active !== true) redirect("/login?error=inactive");
  return { user, profile };
});

export async function getAccessibleStores(profile?: Profile | null) {
  const currentProfile = profile ?? (await getCurrentProfile());

  if (!currentProfile || currentProfile.is_active !== true) {
    return [];
  }

  const supabase = await createClient();

  if (currentProfile.role === "owner") {
    const { data } = await completeQuery(supabase
      .from("stores")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("name"));

    return data ?? [];
  }

  const { data } = await completeQuery(supabase
    .from("store_users")
    .select("stores(*)", { count: "exact" })
    .eq("user_id", currentProfile.id));

  return ((data ?? []) as StoreAssignment[])
    .map((assignment) => assignment.stores)
    .filter((store): store is Store => Boolean(store?.is_active))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function requireOwner() {
  const { user, profile } = await requireProfile();

  if (!profile || profile.role !== "owner" || profile.is_active !== true) {
    return null;
  }

  return { user, profile };
}

export async function canAccessStore(storeId: string, profile?: Profile | null) {
  const currentProfile = profile ?? (await getCurrentProfile());

  if (!currentProfile || currentProfile.is_active !== true) {
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
