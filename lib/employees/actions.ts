"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAccessibleStores, requireOwner, requireProfile, type Profile } from "@/lib/auth/session";
import { normalizePhone, normalizeStaffName, staffNameKey } from "@/lib/employees/utils";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type EmployeeSyncState = {
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

type ContactSession = Awaited<ReturnType<typeof requireProfile>> & {
  profile: Profile;
};

async function requireContactUserOrRedirect(): Promise<ContactSession> {
  const session = await requireProfile();
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

export async function propagateEmployeePhone({
  employeePhone,
  normalizedStaffName,
  storeId,
  whatsappPhone,
}: {
  employeePhone: string | null;
  normalizedStaffName: string;
  storeId: string;
  whatsappPhone: string | null;
}) {
  const supabase = createAdminClient() ?? (await createClient());
  const { data: rows } = await supabase
    .from("payslip_rows")
    .select("id,batch_id,staff_name")
    .eq("store_id", storeId);
  const matchingRows = (rows ?? []).filter(
    (row) => staffNameKey(row.staff_name) === normalizedStaffName,
  );
  const rowIds = matchingRows.map((row) => row.id);

  if (rowIds.length) {
    await supabase
      .from("payslip_rows")
      .update({
        employee_phone: employeePhone,
        whatsapp_phone: whatsappPhone,
      })
      .in("id", rowIds);

    await supabase
      .from("generated_payslips")
      .update({
        employee_phone: employeePhone,
        whatsapp_phone: whatsappPhone,
      })
      .in("payslip_row_id", rowIds);
  }

  revalidatePath("/app/payslips");
  for (const row of matchingRows) {
    if (row.batch_id) {
      revalidatePath(`/app/payslips/${row.batch_id}`);
      revalidatePath(`/app/payslips/${row.batch_id}/rows/${row.id}`);
    }
  }
}

async function propagateContactPhone(storeId: string, staffName: string, phoneInput: string) {
  const phone = normalizePhone(phoneInput);

  await propagateEmployeePhone({
    employeePhone: phone.employeePhone || null,
    normalizedStaffName: staffNameKey(staffName),
    storeId,
    whatsappPhone: phone.whatsappPhone || null,
  });
}

export async function createEmployeeContact(formData: FormData) {
  const session = await requireContactUserOrRedirect();
  const supabase = await createClient();
  const staffName = normalizeStaffName(readString(formData, "staffName"));
  const storeId = readString(formData, "storeId");
  const phoneInput = readString(formData, "phone");
  const notes = readString(formData, "notes");
  const phone = normalizePhone(phoneInput);

  if (!staffName || !storeId) {
    redirect("/app/employees/new?error=missing");
  }
  if (phoneInput && !phone.isValid) {
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
      normalized_phone: phone.employeePhone || null,
      normalized_staff_name: staffNameKey(staffName),
      notes: notes || null,
      phone: phone.employeePhone || phoneInput || null,
      staff_name: staffName,
      store_id: storeId,
      whatsapp_phone: phone.whatsappPhone || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/app/employees/new?error=${encodeURIComponent(error?.message ?? "Save failed")}`);
  }

  await propagateContactPhone(storeId, staffName, phone.employeePhone);
  revalidatePath("/app/employees");
  redirect(`/app/employees/${data.id}?saved=1`);
}

export async function updateEmployeeContact(formData: FormData) {
  const session = await requireContactUserOrRedirect();
  const supabase = await createClient();
  const employeeId = readString(formData, "employeeId");
  const staffName = normalizeStaffName(readString(formData, "staffName"));
  const storeId = readString(formData, "storeId");
  const phoneInput = readString(formData, "phone");
  const notes = readString(formData, "notes");
  const phone = normalizePhone(phoneInput);

  if (!employeeId || !staffName || !storeId) {
    redirect(`/app/employees/${employeeId || ""}?error=missing`);
  }
  if (phoneInput && !phone.isValid) {
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
      normalized_phone: phone.employeePhone || null,
      normalized_staff_name: staffNameKey(staffName),
      notes: notes || null,
      phone: phone.employeePhone || phoneInput || null,
      staff_name: staffName,
      store_id: storeId,
      whatsapp_phone: phone.whatsappPhone || null,
    })
    .eq("id", employeeId);

  if (error) {
    redirect(`/app/employees/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  await propagateContactPhone(storeId, staffName, phone.employeePhone);
  revalidatePath("/app/employees");
  revalidatePath(`/app/employees/${employeeId}`);
  redirect(`/app/employees/${employeeId}?saved=1`);
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
