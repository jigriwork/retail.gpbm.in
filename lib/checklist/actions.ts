"use server";

import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday } from "@/lib/tasks/dates";

type ChecklistActionState = {
  ok: boolean;
  message: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function markNoIssuesToday(
  _previous: ChecklistActionState,
  formData: FormData,
): Promise<ChecklistActionState> {
  const storeId = readString(formData, "storeId");
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { ok: false, message: "Your account is not active." };
  }

  if (!storeId) {
    return { ok: false, message: "Missing store." };
  }

  if (profile.role !== "owner" && !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You can update only your assigned store." };
  }

  const stores = await getAccessibleStores(profile);
  const store = stores.find((item) => item.id === storeId);

  if (!store || store.is_active === false) {
    return { ok: false, message: "Store is not active." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("manager_updates")
    .select("id")
    .eq("store_id", storeId)
    .eq("category", "No issues today")
    .gte("created_at", `${getIndiaToday()}T00:00:00+05:30`)
    .maybeSingle();

  if (existing) {
    return { ok: true, message: "No issues already marked for today." };
  }

  const { error } = await supabase.from("manager_updates").insert({
    store_id: storeId,
    created_by: profile.id,
    title: "No issues today",
    details: "Store reported no special issue today.",
    category: "No issues today",
    urgency: "normal",
    status: "resolved",
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/checklist");
  revalidatePath(`/app/checklist/${storeId}`);
  revalidatePath("/app/today");
  revalidatePath(`/app/stores/${storeId}`);
  return { ok: true, message: "Marked no issues today." };
}
