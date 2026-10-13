"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { canAccessStore, requireOwner, requireProfile } from "@/lib/auth/session";
import { propagateContactPhone, validatedEmployeePhone } from "@/lib/employees/phone-propagation";
import { normalizeStaffName, staffNameKey } from "@/lib/employees/utils";
import { uploadSalesReport } from "@/lib/reports/sales-actions";
import { uploadStockReport } from "@/lib/reports/stock-actions";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type State = AccountsActionState;
type UploadState = { ok: boolean; message: string };

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

// The cashier sees whether an upload worked, never its figures.
export async function cashierUploadSales(_state: UploadState, formData: FormData): Promise<UploadState> {
  const result = await uploadSalesReport({ ok: false, message: "" }, formData);
  return { ok: result.ok, message: result.ok ? "Sales report uploaded. Thank you." : result.message };
}

export async function cashierUploadStock(_state: UploadState, formData: FormData): Promise<UploadState> {
  const result = await uploadStockReport({ ok: false, message: "" }, formData);
  return { ok: result.ok, message: result.ok ? "Stock report uploaded. Thank you." : result.message };
}

/** Name of an active staff-list entry with this 10-digit number, if any (same person entered twice). */
async function staffWithPhone(phone: string) {
  const admin = createAdminClient();
  if (!admin || !/^[6-9]\d{9}$/.test(phone)) return null;
  const { data } = await admin.from("employee_contacts").select("staff_name,phone,whatsapp_phone,normalized_phone")
    .eq("is_active", true).or(`phone.ilike.%${phone},whatsapp_phone.ilike.%${phone},normalized_phone.ilike.%${phone}`).limit(5);
  const match = (data ?? []).find((row) => [row.phone, row.whatsapp_phone, row.normalized_phone]
    .some((value) => String(value ?? "").replace(/\D/g, "").slice(-10) === phone));
  return match?.staff_name ?? null;
}

export async function requestStaffMember(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  const storeId = text(formData, "storeId", 60);
  if (!profile || profile.is_active !== true || !["cashier", "manager", "owner"].includes(profile.role) || !(await canAccessStore(storeId, profile))) {
    return { ok: false, message: "You cannot add staff for this store." };
  }
  const name = normalizeStaffName(text(formData, "staffName", 80));
  if (name.length < 2) return { ok: false, message: "Enter the staff member's full name." };
  let phone: string;
  try {
    phone = validatedEmployeePhone(text(formData, "phone", 20)).employeePhone.slice(2);
  } catch {
    return { ok: false, message: "Enter a valid 10-digit Indian mobile number." };
  }
  const joining = text(formData, "joiningDate", 10);
  const supabase = await createClient();
  const existing = await staffWithPhone(phone);
  if (existing) return { ok: false, message: `${existing} is already in the staff list with this number. No new staff needed.` };
  const { error } = await supabase.from("staff_requests").insert({
    store_id: storeId, staff_name: name, phone, designation: text(formData, "designation", 60) || null,
    joining_date: /^\d{4}-\d{2}-\d{2}$/.test(joining) ? joining : null, note: text(formData, "note", 300) || null, requested_by: profile.id,
  });
  if (error) return { ok: false, message: "Could not send the request. Please retry." };
  revalidatePath("/app/cashier/staff");
  revalidatePath("/app/employees");
  return { ok: true, message: "Sent to the owner for approval. The staff member becomes active once approved." };
}

/** Owner approves (creates the employee, as Employees → Add does) or rejects a request. */
export async function decideStaffRequest(_state: State, formData: FormData): Promise<State> {
  const owner = await requireOwner();
  if (!owner) return { ok: false, message: "Only the owner approves new staff." };
  const decision = text(formData, "decision", 10);
  const reason = text(formData, "reason", 300);
  const supabase = await createClient();
  const { data: request } = await supabase.from("staff_requests").select("*").eq("id", text(formData, "requestId", 60)).maybeSingle();
  if (!request || request.status !== "pending") return { ok: false, message: "This request was already decided." };
  const decided = { decided_by: owner.profile.id, decided_at: new Date().toISOString() };

  if (decision === "reject") {
    if (reason.length < 3) return { ok: false, message: "Say why the request is rejected." };
    const { error } = await supabase.from("staff_requests").update({ ...decided, status: "rejected", decision_note: reason }).eq("id", request.id).eq("status", "pending");
    if (error) return { ok: false, message: "Could not reject the request." };
    // Keep the current approval card mounted long enough to show the action
    // result. These authenticated pages are dynamic and read fresh data on
    // their next visit, so no path invalidation is needed here.
    return { ok: true, message: "Request rejected." };
  }
  if (decision !== "approve") return { ok: false, message: "Unknown decision." };

  const { data: existing } = await supabase.from("employee_contacts").select("id")
    .eq("store_id", request.store_id).eq("normalized_staff_name", staffNameKey(request.staff_name)).maybeSingle();
  if (existing) return { ok: false, message: `${request.staff_name} already exists at this store. Reject the request or rename the staff member.` };
  const samePhone = await staffWithPhone(request.phone);
  if (samePhone) return { ok: false, message: `${samePhone} already has this number in the staff list. This looks like the same person: reject the request.` };
  const { data: contact, error } = await supabase.from("employee_contacts").insert({
    created_by: owner.profile.id, is_active: true, normalized_staff_name: staffNameKey(request.staff_name),
    staff_name: request.staff_name, store_id: request.store_id, designation: request.designation,
    notes: [request.joining_date ? `Joined ${request.joining_date}` : null, request.note].filter(Boolean).join(" · ") || null,
  }).select("id").single();
  if (error || !contact) return { ok: false, message: "Could not create the staff member. Please retry." };
  try {
    await propagateContactPhone(contact.id, request.phone);
  } catch {
    // The employee exists; the phone can be added on their page.
  }
  const { error: decisionError } = await supabase.from("staff_requests")
    .update({ ...decided, status: "approved", decision_note: reason || null, employee_contact_id: contact.id })
    .eq("id", request.id).eq("status", "pending");
  if (decisionError) return { ok: false, message: "The staff member was added, but the request could not be marked approved. Please retry." };
  return { ok: true, message: `${request.staff_name} added to the staff list.` };
}
