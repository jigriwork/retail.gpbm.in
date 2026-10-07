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

/** Salary slip name → staff member. The owner links at once; a manager or cashier sends it to the owner. */
export async function linkPayslipName(_state: State, formData: FormData): Promise<State> {
  const storeId = await access(formData);
  if (!storeId) return { ok: false, message: "You cannot match staff for this store." };
  const employee = text(formData, "employeeId", 60);
  if (!employee) return { ok: false, message: "Choose the staff member." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("link_payslip_name", { p_employee: employee, p_name: text(formData, "source"), p_store: storeId });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not save. Please retry." };
  revalidatePath("/app/staff-match");
  return { ok: true, message: data === "linked" ? "Matched." : "Sent to the owner for approval." };
}

/** Owner: approve or reject a suggested salary slip match. */
export async function decidePayslipLink(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner approves salary slip matches." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_payslip_link", { p_approve: formData.get("decision") === "approve", p_request: text(formData, "requestId", 60) });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not save. Please retry." };
  revalidatePath("/app/staff-match");
  return { ok: true, message: formData.get("decision") === "approve" ? "Approved." : "Rejected." };
}

/** Link every salary slip whose name is exactly a staff member of the store. */
export async function autoMatchPayslips(_state: State, formData: FormData): Promise<State> {
  const storeId = await access(formData);
  if (!storeId) return { ok: false, message: "You cannot match staff for this store." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("auto_link_payslip_names", { p_store: storeId });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not match. Please retry." };
  revalidatePath("/app/staff-match");
  return { ok: true, message: Number(data) ? `${data} salary slip${Number(data) === 1 ? "" : "s"} matched.` : "Nothing new to match." };
}

/** A name on the bills that is not a current staff member (left, or a shop counter): hide it from matching. */
export async function markNameLeft(_state: State, formData: FormData): Promise<State> {
  const storeId = await access(formData);
  if (!storeId) return { ok: false, message: "You cannot change staff names for this store." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_sales_name_left", { p_source: text(formData, "source"), p_store: storeId });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not save. Please retry." };
  revalidatePath("/app/staff-match");
  return { ok: true, message: "Hidden: marked as left / not staff." };
}

/** A name on the bills that is not in the staff list: add them as staff of this store and match at once. */
export async function addStaffFromName(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  if (!["owner", "manager"].includes(profile.role)) return { ok: false, message: "Ask the owner or manager to add new staff (Staff → Add new staff)." };
  const storeId = await access(formData);
  if (!storeId) return { ok: false, message: "You cannot add staff for this store." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_staff_from_sales_name", { p_source: text(formData, "source"), p_store: storeId });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Could not add. Please retry." };
  revalidatePath("/app/staff-match");
  revalidatePath("/app/employees");
  return { ok: true, message: "Added to the staff list and matched. Add their phone number on the Staff page." };
}
