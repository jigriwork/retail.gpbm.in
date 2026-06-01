"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type StoreTargetState = {
  ok: boolean;
  message: string;
};

export async function updateStoreTarget(
  _previous: StoreTargetState,
  formData: FormData,
): Promise<StoreTargetState> {
  const session = await requireOwner();

  if (!session?.profile) {
    return { ok: false, message: "Only the owner can update store targets." };
  }

  const storeId = formData.get("storeId");
  const enabled = formData.get("enabled") === "on";
  const targetRaw = formData.get("target");

  if (typeof storeId !== "string" || !storeId) {
    return { ok: false, message: "Store is required." };
  }

  const target = targetRaw ? Number(String(targetRaw).replace(/[^0-9.]/g, "")) : null;

  if (enabled && (!target || target <= 0)) {
    return { ok: false, message: "Enter a positive target amount when target is enabled." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({
      monthly_target_enabled: enabled,
      monthly_target: enabled ? target : null,
    })
    .eq("id", storeId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/stores");
  revalidatePath(`/app/stores/${storeId}`);
  revalidatePath("/app/settings");
  revalidatePath("/app/today");
  revalidatePath("/app/reports/sales/analytics");

  return { ok: true, message: "Target updated." };
}
