"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccessibleStores, requireOwner, requireProfile, type Profile } from "@/lib/auth/session";
import { propagateContactPhone, requirePhoneActor, validatedEmployeePhone } from "@/lib/employees/phone-propagation";
import { normalizePhone, normalizeStaffName, staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";

export type EmployeeSyncState = {
  ok: boolean;
  message: string;
};

export type EmployeeBulkPhoneState = {
  ok: boolean;
  message: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function safeEmployeesReturnPath(value: string) {
  if (!value || !value.startsWith("/app/employees")) {
    return "/app/employees";
  }

  if (value.startsWith("/app/employees/new") || /^\/app\/employees\/[^/?#]+/.test(value)) {
    return "/app/employees";
  }

  return value;
}

function withSavedFlag(path: string) {
  const url = new URL(path, "http://local");
  url.searchParams.set("saved", "1");
  return `${url.pathname}${url.search}`;
}

type ContactSession = Awaited<ReturnType<typeof requireProfile>> & {
  profile: Profile;
};

async function requireContactUserOrRedirect(): Promise<ContactSession> {
  const session = await requirePhoneActor();
  if (!session.profile || !["owner", "manager"].includes(session.profile.role)) {
    redirect("/app/employees");
  }

  return session as ContactSession;
}

async function getWritableEmployeeStores(profile: Profile) {
  return (await getAccessibleStores(profile)).filter(
    (store) => store.is_active && ["GP", "BM"].includes(store.code),
  );
}

async function canWriteEmployeeStore(storeId: string, profile: Profile) {
  const stores = await getWritableEmployeeStores(profile);
  return stores.some((store) => store.id === storeId);
}

export async function createEmployeeContact(formData: FormData) {
  const session = await requireContactUserOrRedirect();
  const supabase = await createClient();
  const staffName = normalizeStaffName(readString(formData, "staffName"));
  const storeId = readString(formData, "storeId");
  const phoneInput = readString(formData, "phone");
  const notes = readString(formData, "notes");
  const returnTo = safeEmployeesReturnPath(readString(formData, "returnTo"));
  const phone = normalizePhone(phoneInput);

  if (!staffName || !storeId) {
    redirect("/app/employees/new?error=missing");
  }
  if (!phone.isValid || !/^\+?[\d\s()-]+$/.test(phoneInput)) {
    redirect("/app/employees/new?error=phone");
  }

  if (!(await canWriteEmployeeStore(storeId, session.profile))) {
    redirect("/app/employees/new?error=store");
  }

  const { data, error } = await supabase
    .from("employee_contacts")
    .insert({
      created_by: session.profile.id,
      is_active: readBoolean(formData, "isActive"),
      normalized_staff_name: staffNameKey(staffName),
      notes: notes || null,
      staff_name: staffName,
      store_id: storeId,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/app/employees/new?error=${encodeURIComponent(error?.message ?? "Save failed")}`);
  }

  await propagateContactPhone(data.id, phoneInput);
  revalidatePath("/app/employees");
  redirect(withSavedFlag(returnTo));
}

export async function updateEmployeeContact(formData: FormData) {
  const session = await requireContactUserOrRedirect();
  const supabase = await createClient();
  const employeeId = readString(formData, "employeeId");
  const staffName = normalizeStaffName(readString(formData, "staffName"));
  const storeId = readString(formData, "storeId");
  const phoneInput = readString(formData, "phone");
  const notes = readString(formData, "notes");
  const returnTo = safeEmployeesReturnPath(readString(formData, "returnTo"));
  const phone = normalizePhone(phoneInput);

  if (!employeeId || !staffName || !storeId) {
    redirect(`/app/employees/${employeeId || ""}?error=missing`);
  }
  if (!phone.isValid || !/^\+?[\d\s()-]+$/.test(phoneInput)) {
    redirect(`/app/employees/${employeeId}?error=phone`);
  }

  const { data: existing } = await supabase
    .from("employee_contacts")
    .select("id,store_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (!existing?.store_id || !(await canWriteEmployeeStore(existing.store_id, session.profile))) {
    redirect(`/app/employees/${employeeId}?error=access`);
  }

  if (!(await canWriteEmployeeStore(storeId, session.profile))) {
    redirect(`/app/employees/${employeeId}?error=store`);
  }

  const { error } = await supabase
    .from("employee_contacts")
    .update({
      is_active: readBoolean(formData, "isActive"),
      normalized_staff_name: staffNameKey(staffName),
      notes: notes || null,
      staff_name: staffName,
      store_id: storeId,
    })
    .eq("id", employeeId);

  if (error) {
    redirect(`/app/employees/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  await propagateContactPhone(employeeId, phoneInput);
  revalidatePath("/app/employees");
  revalidatePath(`/app/employees/${employeeId}`);
  redirect(withSavedFlag(returnTo));
}

export async function deactivateEmployeeContact(formData: FormData) {
  const session = await requireContactUserOrRedirect();
  const employeeId = readString(formData, "employeeId");
  const supabase = await createClient();

  if (!employeeId) {
    redirect("/app/employees?error=missing");
  }

  const { data: existing } = await supabase
    .from("employee_contacts")
    .select("id,store_id,is_active")
    .eq("id", employeeId)
    .maybeSingle();

  if (!existing?.store_id || !(await canWriteEmployeeStore(existing.store_id, session.profile))) {
    redirect("/app/employees?error=access");
  }

  await supabase
    .from("employee_contacts")
    .update({ is_active: existing.is_active === false })
    .eq("id", employeeId);
  revalidatePath("/app/employees");
  revalidatePath(`/app/employees/${employeeId}`);
}

export async function bulkUpdateEmployeePhones(
  _previous: EmployeeBulkPhoneState,
  formData: FormData,
): Promise<EmployeeBulkPhoneState> {
  void _previous;

  const session = await requireContactUserOrRedirect();
  const contactIds = formData
    .getAll("contactIds")
    .filter((value): value is string => typeof value === "string" && Boolean(value));

  if (!contactIds.length) {
    return { ok: false, message: "No staff contacts selected." };
  }

  const supabase = await createClient();
  const { data: contacts, error } = await supabase
    .from("employee_contacts")
    .select("id,staff_name,store_id,phone,normalized_phone,whatsapp_phone")
    .in("id", contactIds);

  if (error) {
    return { ok: false, message: error.message };
  }

  const contactsById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
  let saved = 0;
  let skippedBlank = 0;
  let invalid = 0;
  let denied = 0;

  for (const contactId of contactIds) {
    const contact = contactsById.get(contactId);
    const phoneInput = readString(formData, `phone:${contactId}`);

    if (!contact || !contact.store_id) {
      denied += 1;
      continue;
    }

    if (!phoneInput) {
      skippedBlank += 1;
      continue;
    }

    if (!(await canWriteEmployeeStore(contact.store_id, session.profile))) {
      denied += 1;
      continue;
    }

    let phone;
    try {
      phone = validatedEmployeePhone(phoneInput);
    } catch {
      invalid += 1;
      continue;
    }

    try {
      // Reapply even if the contact already has this number: a previous attempt
      // may have failed after updating the contact but before related payslips.
      await propagateContactPhone(contact.id, phone.employeePhone);
    } catch {
      invalid += 1;
      continue;
    }
    saved += 1;
  }

  revalidatePath("/app/employees");

  const details = [
    `Saved ${saved}`,
    skippedBlank ? `blank skipped ${skippedBlank}` : "",
    invalid ? `invalid ${invalid}` : "",
    denied ? `not allowed ${denied}` : "",
  ].filter(Boolean);

  return {
    ok: invalid === 0 && denied === 0,
    message: details.join(". ") || "No changes to save.",
  };
}

export async function syncStaffFromPayslips(
  _previous: EmployeeSyncState,
  _formData?: FormData,
): Promise<EmployeeSyncState> {
  void _previous;
  void _formData;

  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can sync staff from payslips." };
  }

  const supabase = await createClient();
  const { data: rows, error: rowsError } = await supabase
    .from("payslip_rows")
    .select("staff_name,store_id,employee_phone,whatsapp_phone")
    .order("created_at", { ascending: true });

  if (rowsError) {
    return { ok: false, message: rowsError.message };
  }

  const { data: contacts } = await supabase.from("employee_contacts").select("*");
  const contactMap = new Map(
    (contacts ?? []).map((contact) => [
      `${contact.store_id ?? ""}:${contact.normalized_staff_name}`,
      contact,
    ]),
  );
  const countedExisting = new Set<string>();
  const countedCreated = new Set<string>();
  const countedUpdated = new Set<string>();
  let created = 0;
  let existed = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    if (!row.store_id || !row.staff_name) {
      skipped += 1;
      continue;
    }

    const normalizedStaffName = staffNameKey(row.staff_name);
    if (!normalizedStaffName) {
      skipped += 1;
      continue;
    }

    const key = `${row.store_id}:${normalizedStaffName}`;
    const phone = normalizePhone(row.employee_phone ?? row.whatsapp_phone ?? "");
    const existing = contactMap.get(key);

    if (!existing) {
      const { data: inserted } = await supabase
        .from("employee_contacts")
        .insert({
          created_by: session.profile.id,
          is_active: true,
          normalized_phone: phone.employeePhone || null,
          normalized_staff_name: normalizedStaffName,
          phone: phone.employeePhone || null,
          staff_name: normalizeStaffName(row.staff_name),
          store_id: row.store_id,
          whatsapp_phone: phone.whatsappPhone || null,
        })
        .select("*")
        .single();

      if (inserted) {
        contactMap.set(key, inserted);
        created += 1;
        countedCreated.add(key);
      }
      continue;
    }

    if (!countedCreated.has(key) && !countedExisting.has(key)) {
      existed += 1;
      countedExisting.add(key);
    }
    if (!existing.normalized_phone && phone.employeePhone && !countedUpdated.has(key)) {
      await supabase
        .from("employee_contacts")
        .update({
          normalized_phone: phone.employeePhone,
          phone: phone.employeePhone,
          whatsapp_phone: phone.whatsappPhone,
        })
        .eq("id", existing.id);
      existing.normalized_phone = phone.employeePhone;
      existing.phone = phone.employeePhone;
      existing.whatsapp_phone = phone.whatsappPhone;
      updated += 1;
      countedUpdated.add(key);
    }
  }

  revalidatePath("/app/employees");

  return {
    ok: true,
    message: `Sync complete. Created ${created}. Already existed ${existed}. Updated with phone ${updated}. Rows skipped ${skipped}.`,
  };
}
