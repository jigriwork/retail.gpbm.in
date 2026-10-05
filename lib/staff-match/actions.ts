"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type State = AccountsActionState;
const text = (formData: FormData, key: string, max = 120) => {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().slice(0, max) : "";
};

async function access(formData: FormData) {
  const { profile } = await requireProfile();
  if (!["owner", "manager", "cashier"].includes(profile.role)) return null;
  const storeId = text(formData, "storeId", 60);
  return storeId && (await canAccessStore(storeId, profile)) ? storeId : null;
}

/** Link every certain match (same name apart from case, spaces and " S" / "1"). */
export async function autoMatchStaff(_state: State, formData: FormData): Promise<State> {
  const storeId = await access(formData);
  if (!storeId) return { ok: false, message: "You cannot match staff for this store." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("auto_link_staff_names", { p_store: storeId });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not match the names. Please retry." };
  revalidatePath("/app/staff-match");
  return { ok: true, message: Number(data) ? `${data} name${Number(data) === 1 ? "" : "s"} matched.` : "Nothing new to match automatically." };
}

/** Confirm that a sales-bill name is this staff member. */
export async function linkStaffName(_state: State, formData: FormData): Promise<State> {
  const storeId = await access(formData);
  if (!storeId) return { ok: false, message: "You cannot match staff for this store." };
  const employee = text(formData, "employeeId", 60);
  if (!employee) return { ok: false, message: "Choose the staff member." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_staff_name", { p_employee: employee, p_source: text(formData, "source"), p_store: storeId });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not save. Please retry." };
  revalidatePath("/app/staff-match");
  return { ok: true, message: "Matched." };
}
