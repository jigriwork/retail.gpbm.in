"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/auth/session";
import { normalizePhone, normalizeStaffName, staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

async function requireOwnerOrRedirect() {
  const session = await requireOwner();
  if (!session?.profile) {
    redirect("/app/employees");
  }

  return session;
}

export async function createEmployeeContact(formData: FormData) {
  const session = await requireOwnerOrRedirect();
  const supabase = await createClient();
  const staffName = normalizeStaffName(readString(formData, "staffName"));
  const storeId = readString(formData, "storeId");
  const phoneInput = readString(formData, "phone");
  const notes = readString(formData, "notes");
  const phone = normalizePhone(phoneInput);

  if (!staffName || !storeId) {
    redirect("/app/employees/new?error=missing");
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("is_active", true)
    .in("code", ["GP", "BM"])
    .maybeSingle();

  if (!store) {
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

  revalidatePath("/app/employees");
  redirect(`/app/employees/${data.id}?saved=1`);
}

export async function updateEmployeeContact(formData: FormData) {
  await requireOwnerOrRedirect();
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

  revalidatePath("/app/employees");
  revalidatePath(`/app/employees/${employeeId}`);
  redirect(`/app/employees/${employeeId}?saved=1`);
}
