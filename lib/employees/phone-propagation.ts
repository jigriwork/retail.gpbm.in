import "server-only";

import { revalidatePath } from "next/cache";
import { normalizePhone, staffNameKey } from "@/lib/employees/utils";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// Deliberately not a Server Action. Recheck the caller even when invoked by an
// already guarded action: service-role access must never rely on its caller.
export async function requirePhoneActor() {
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Authentication required.");
  const { data: profile, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error || !profile || profile.is_active !== true || !["owner", "manager"].includes(profile.role)) {
    throw new Error("An active owner or assigned manager is required.");
  }
  return { client, user, profile };
}

export async function requirePhoneStore(storeId: string, actor: Awaited<ReturnType<typeof requirePhoneActor>>) {
  const { data: store, error } = await actor.client.from("stores").select("id,code,is_active")
    .eq("id", storeId).maybeSingle();
  if (error || !store || store.is_active !== true || !["GP", "BM"].includes(store.code)) {
    throw new Error("Employee store is unavailable.");
  }
  if (actor.profile.role !== "owner") {
    const { data: assignment, error: assignmentError } = await actor.client.from("store_users").select("id")
      .eq("store_id", store.id).eq("user_id", actor.user.id).maybeSingle();
    if (assignmentError || !assignment) throw new Error("Store access denied.");
  }
}

export function validatedEmployeePhone(input: string) {
  // normalizePhone is also used for permissive spreadsheet imports. Interactive
  // edits must reject letters/garbage rather than silently stripping them.
  const phone = normalizePhone(input);
  if (!/^\+?[\d\s()-]+$/.test(input) || !phone.isValid) throw new Error("Enter a valid Indian mobile number.");
  return phone;
}

export async function propagateContactPhone(contactId: string, input: string) {
  const actor = await requirePhoneActor();
  const phone = validatedEmployeePhone(input);
  const { data: contact, error: contactError } = await actor.client.from("employee_contacts")
    .select("id,store_id,staff_name,normalized_staff_name").eq("id", contactId).maybeSingle();
  if (contactError || !contact?.store_id || !staffNameKey(contact.staff_name) ||
      staffNameKey(contact.staff_name) !== contact.normalized_staff_name) {
    throw new Error("Employee contact not found or invalid.");
  }
  await requirePhoneStore(contact.store_id, actor);

  const admin = createAdminClient();
  if (!admin) throw new Error("Phone propagation is unavailable.");
  // Supabase caps result sets. Walk pages so older batches are not silently
  // omitted when a store has more than 1,000 payslip rows.
  const matchingRows: { id: string; batch_id: string | null; staff_name: string | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: rows, error: rowsError } = await admin.from("payslip_rows")
      .select("id,batch_id,staff_name").eq("store_id", contact.store_id)
      .order("id").range(offset, offset + 999);
    if (rowsError) throw new Error("Unable to load related payslips.");
    matchingRows.push(...(rows ?? []).filter(row => staffNameKey(row.staff_name) === contact.normalized_staff_name));
    if (!rows || rows.length < 1000) break;
  }
  const rowIds = matchingRows.map(row => row.id);
  const audit = {
    actor_id: actor.user.id, actor_role: actor.profile.role,
    entity_type: "employee_contact", entity_id: contact.id, store_id: contact.store_id,
    metadata: { payslip_row_ids: rowIds },
  };
  // Record intent before any privileged write; no phone numbers or credentials.
  const { error: auditError } = await admin.from("audit_logs").insert({ ...audit, action: "employee_phone_update_requested" });
  if (auditError) throw new Error("Unable to audit phone update.");
  const { data: updatedContact, error: updateError } = await actor.client.from("employee_contacts").update({
    phone: phone.employeePhone, normalized_phone: phone.employeePhone, whatsapp_phone: phone.whatsappPhone,
  }).eq("id", contact.id).eq("store_id", contact.store_id).eq("normalized_staff_name", contact.normalized_staff_name)
    .select("id").maybeSingle();
  if (updateError || !updatedContact) throw new Error("Unable to update employee phone; contact may have changed.");
  if (rowIds.length) {
    const values = { employee_phone: phone.employeePhone, whatsapp_phone: phone.whatsappPhone };
    const { error } = await admin.from("payslip_rows").update(values).eq("store_id", contact.store_id).in("id", rowIds);
    if (error) throw new Error("Unable to update related payslip rows.");
    const { error: generatedError } = await admin.from("generated_payslips").update(values)
      .eq("store_id", contact.store_id).in("payslip_row_id", rowIds);
    if (generatedError) throw new Error("Unable to update generated payslip phones.");
  }
  const { error: completedError } = await admin.from("audit_logs").insert({ ...audit, action: "employee_phone_updated" });
  if (completedError) throw new Error("Phone updated, but completion audit failed.");
  revalidatePath("/app/payslips");
  for (const row of matchingRows) {
    if (row.batch_id) {
      revalidatePath(`/app/payslips/${row.batch_id}`);
      revalidatePath(`/app/payslips/${row.batch_id}/rows/${row.id}`);
    }
  }
}
