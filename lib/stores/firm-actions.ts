"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type FirmMappingState = {
  ok: boolean;
  message: string;
};

export async function updateStoreFirmName(
  _previous: FirmMappingState,
  formData: FormData,
): Promise<FirmMappingState> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can update firm mapping." };
  }

  const storeId = formData.get("storeId");
  const firmName = formData.get("firmName");

  if (typeof storeId !== "string" || !storeId) {
    return { ok: false, message: "Store is required." };
  }

  if (typeof firmName !== "string" || !firmName.trim()) {
    return { ok: false, message: "Firm name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ firm_name: firmName.trim() })
    .eq("id", storeId)
    .eq("is_active", true);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/payslips/upload");

  return { ok: true, message: "Firm name updated." };
}
