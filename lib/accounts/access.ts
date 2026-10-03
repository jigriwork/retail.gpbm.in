import "server-only";

import { cache } from "react";

import { requireProfile, type Profile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { indiaToday } from "@/lib/accounts/format";

export type FinanceAction = "view" | "post" | "masters" | "approve" | "close";

export type FinanceGrant = {
  id: string;
  firm_id: string | null;
  store_id: string | null;
  can_view: boolean;
  can_post: boolean;
  can_manage_masters: boolean;
  can_approve: boolean;
  can_close_period: boolean;
  valid_from: string;
  valid_to: string | null;
};

export type FinanceSession = {
  profile: Profile;
  isOwner: boolean;
  grants: FinanceGrant[];
  /** True when the person holds the ability for at least one scope. */
  can: Record<FinanceAction, boolean>;
  /** Managers may submit purchase documents and return evidence for their stores. */
  canSubmitDocuments: boolean;
};

function allows(grant: FinanceGrant, action: FinanceAction) {
  if (action === "view") return grant.can_view || grant.can_post || grant.can_manage_masters || grant.can_approve || grant.can_close_period;
  if (action === "post") return grant.can_post;
  if (action === "masters") return grant.can_manage_masters;
  if (action === "approve") return grant.can_approve;
  return grant.can_close_period;
}

/**
 * The signed-in person's accounts abilities. The database enforces the same
 * rules (finance_can); this only decides what the screens offer.
 */
export const getFinanceSession = cache(async (): Promise<FinanceSession> => {
  const { profile } = await requireProfile();
  const isOwner = profile.role === "owner" && profile.is_active === true;
  let grants: FinanceGrant[] = [];
  if (!isOwner && (profile.role === "accountant" || profile.role === "manager")) {
    const supabase = await createClient();
    const today = indiaToday();
    const { data } = await supabase
      .from("finance_grants")
      .select("id,firm_id,store_id,can_view,can_post,can_manage_masters,can_approve,can_close_period,valid_from,valid_to")
      .eq("user_id", profile.id)
      .is("revoked_at", null);
    grants = (data ?? []).filter((grant) => grant.valid_from <= today && (!grant.valid_to || grant.valid_to >= today));
  }
  const can = Object.fromEntries(
    (["view", "post", "masters", "approve", "close"] as FinanceAction[]).map((action) => [
      action,
      isOwner || grants.some((grant) => allows(grant, action)),
    ]),
  ) as Record<FinanceAction, boolean>;
  return { profile, isOwner, grants, can, canSubmitDocuments: can.post || profile.role === "manager" };
});

/** Null when the person may not use this part of Accounts. */
export async function requireFinance(action: FinanceAction) {
  const session = await getFinanceSession();
  return session.can[action] ? session : null;
}
