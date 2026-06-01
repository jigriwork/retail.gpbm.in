"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { priorityFromUrgency, updateStatuses, updateUrgencies } from "@/lib/updates/constants";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

export type UpdateActionState = {
  ok: boolean;
  message: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value || null;
}

function safeStatus(value: string) {
  return updateStatuses.some((status) => status === value) ? value : "open";
}

function safeUrgency(value: string) {
  return updateUrgencies.some((urgency) => urgency === value) ? value : "normal";
}

function slugFileName(fileName: string) {
  const clean = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "manager-update-photo";
}

async function validateStoreAccess(storeId: string) {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { ok: false as const, message: "Your account is not active.", profile: null, store: null };
  }

  if (!storeId) {
    return { ok: false as const, message: "Choose a store.", profile, store: null };
  }

  if (profile.role !== "owner" && !(await canAccessStore(storeId, profile))) {
    return {
      ok: false as const,
      message: "You can manage updates only for your assigned store.",
      profile,
      store: null,
    };
  }

  const stores = await getAccessibleStores(profile);
  const store = stores.find((item) => item.id === storeId);

  if (!store || store.is_active === false) {
    return {
      ok: false as const,
      message: "Choose an active Go Planet or Brand Mark store.",
      profile,
      store: null,
    };
  }

  return { ok: true as const, profile, store };
}

async function canAccessUpdate(updateId: string) {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { allowed: false, profile, update: null };
  }

  const supabase = await createClient();
  const { data: update } = await supabase
    .from("manager_updates")
    .select("*")
    .eq("id", updateId)
    .maybeSingle();

  if (!update) {
    return { allowed: false, profile, update: null };
  }

  if (profile.role === "owner") {
    return { allowed: true, profile, update };
  }

  const allowed = update.store_id ? await canAccessStore(update.store_id, profile) : false;
  return { allowed, profile, update };
}

async function uploadUpdatePhoto(storeCode: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { path: null, error: null };
  }

  const supabase = await createClient();
  const path = [
    "manager-updates",
    storeCode.toLowerCase(),
    getIndiaToday(),
    `${Date.now()}-${slugFileName(file.name)}`,
  ].join("/");
  const { error } = await supabase.storage.from("review-photos").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  return { path, error };
}

function dueDateFromForm(value: string) {
  if (value === "today") {
    return getIndiaToday();
  }

  if (value === "tomorrow") {
    return addDays(getIndiaToday(), 1);
  }

  if (value === "custom") {
    return null;
  }

  return value || null;
}

export async function createManagerUpdate(
  _previous: UpdateActionState,
  formData: FormData,
): Promise<UpdateActionState> {
  const title = readString(formData, "title");
  const storeId = readString(formData, "storeId");
  const category = readString(formData, "category");
  const urgency = safeUrgency(readString(formData, "urgency"));

  if (!title) {
    return { ok: false, message: "Title is required." };
  }

  if (!category) {
    return { ok: false, message: "Category is required." };
  }

  const access = await validateStoreAccess(storeId);

  if (!access.ok) {
    return { ok: false, message: access.message };
  }

  const { path, error: photoError } = await uploadUpdatePhoto(
    access.store.code,
    formData.get("photo"),
  );

  if (photoError) {
    return { ok: false, message: photoError.message };
  }

  const supabase = await createClient();
  const { data: update, error } = await supabase
    .from("manager_updates")
    .insert({
      store_id: storeId,
      created_by: access.profile.id,
      title,
      details: readNullableString(formData, "details"),
      category,
      urgency,
      status: "open",
      photo_path: path,
    })
    .select("id")
    .single();

  if (error || !update) {
    return { ok: false, message: error?.message ?? "Unable to create update." };
  }

  if (readString(formData, "createTask") === "on") {
    const customDueDate = readNullableString(formData, "taskDueDate");
    const dueMode = readString(formData, "taskDueMode");
    const dueDate = dueMode === "custom" ? customDueDate : dueDateFromForm(dueMode);
    const taskInsert: TablesInsert<"tasks"> = {
      store_id: storeId,
      created_by: access.profile.id,
      assigned_to: readNullableString(formData, "assignedTo"),
      title: `Update: ${title}`,
      description: readNullableString(formData, "details"),
      category,
      priority: priorityFromUrgency(urgency),
      status: "pending",
      due_date: dueDate,
      is_private: false,
      carry_forward: true,
      source: access.profile.role === "manager" ? "manager" : "manual",
    };
    const { data: task } = await supabase
      .from("tasks")
      .insert(taskInsert)
      .select("id")
      .single();

    if (task) {
      await supabase
        .from("manager_updates")
        .update({ created_task_id: task.id })
        .eq("id", update.id);
    }
  }

  revalidatePath("/app/updates");
  revalidatePath("/app/today");
  revalidatePath(`/app/stores/${storeId}`);
  redirect(`/app/updates/${update.id}`);
}

export async function updateManagerUpdate(
  _previous: UpdateActionState,
  formData: FormData,
): Promise<UpdateActionState> {
  const updateId = readString(formData, "updateId");
  const access = await canAccessUpdate(updateId);

  if (!access.allowed || !access.update) {
    return { ok: false, message: "You cannot update this store update." };
  }

  const update: TablesUpdate<"manager_updates"> = {
    title: readString(formData, "title") || access.update.title,
    details: readNullableString(formData, "details"),
    category: readNullableString(formData, "category"),
    urgency: safeUrgency(readString(formData, "urgency")),
    status: safeStatus(readString(formData, "status")),
  };

  const storeId = access.update.store_id ?? "";
  const stores = await getAccessibleStores(access.profile);
  const store = stores.find((item) => item.id === storeId);

  if (store) {
    const { path, error: photoError } = await uploadUpdatePhoto(store.code, formData.get("photo"));

    if (photoError) {
      return { ok: false, message: photoError.message };
    }

    if (path) {
      update.photo_path = path;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("manager_updates")
    .update(update)
    .eq("id", updateId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/updates");
  revalidatePath(`/app/updates/${updateId}`);
  if (storeId) {
    revalidatePath(`/app/stores/${storeId}`);
  }
  revalidatePath("/app/today");
  return { ok: true, message: "Update saved." };
}

export async function setManagerUpdateStatus(
  _previous: UpdateActionState,
  formData: FormData,
): Promise<UpdateActionState> {
  const updateId = readString(formData, "updateId");
  const status = safeStatus(readString(formData, "status"));
  const access = await canAccessUpdate(updateId);

  if (!access.allowed || !access.update) {
    return { ok: false, message: "You cannot update this store update." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("manager_updates")
    .update({ status })
    .eq("id", updateId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/updates");
  revalidatePath(`/app/updates/${updateId}`);
  if (access.update.store_id) {
    revalidatePath(`/app/stores/${access.update.store_id}`);
  }
  revalidatePath("/app/today");
  return { ok: true, message: "Status updated." };
}
