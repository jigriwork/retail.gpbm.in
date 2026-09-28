import "server-only";

import { getAccessibleStores, requireOwner, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Sop = Tables<"sops"> & { store: { id: string; name: string; code: string } | null };

function missingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("sops")));
}

// Owners see every SOP. Managers see only active SOPs for their assigned
// stores; the database policy enforces the same rule independently.
export async function getSopsForViewer(selectedStoreId?: string) {
  const { profile } = await requireProfile();
  const isOwner = profile.role === "owner";
  const stores = await getAccessibleStores(profile);
  const store = stores.find((item) => item.id === selectedStoreId) ?? (isOwner ? null : stores[0] ?? null);

  if (!isOwner && profile.role !== "manager") return { available: false, isOwner, sops: [] as Sop[], store, stores };

  const supabase = await createClient();
  let query = supabase
    .from("sops")
    .select("*, store:stores(id,name,code)")
    .order("sort_order")
    .order("title");
  if (!isOwner) query = query.eq("is_active", true);
  if (store) query = query.or(`store_id.is.null,store_id.eq.${store.id}`);

  const { data, error } = await query;
  if (missingTable(error)) return { available: false, isOwner, sops: [] as Sop[], store, stores };
  if (error) throw new Error(`Could not load SOPs: ${error.message}`);
  return { available: true, isOwner, sops: (data ?? []) as unknown as Sop[], store, stores };
}

export async function getSopForEdit(id: string) {
  if (!(await requireOwner())) return null;
  const supabase = await createClient();
  const [sop, revisions] = await Promise.all([
    supabase.from("sops").select("*, store:stores(id,name,code)").eq("id", id).maybeSingle(),
    supabase
      .from("sop_revisions")
      .select("id,version,changed_at,snapshot,changer:profiles!sop_revisions_changed_by_fkey(full_name,email)")
      .eq("sop_id", id)
      .order("version", { ascending: false })
      .limit(5),
  ]);
  if (sop.error) throw new Error(`Could not load SOP: ${sop.error.message}`);
  return sop.data ? { revisions: revisions.data ?? [], sop: sop.data as unknown as Sop } : null;
}
