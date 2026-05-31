"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaToday, getIndiaTomorrow } from "@/lib/tasks/dates";
import { buildAutoTasksForToday } from "@/lib/tasks/reminders";
import type { TablesUpdate } from "@/lib/supabase/database.types";

type ActionState = {
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

function dueDateFromForm(formData: FormData) {
  const mode = readString(formData, "dueDateMode");

  if (mode === "today") {
    return getIndiaToday();
  }

  if (mode === "tomorrow") {
    return getIndiaTomorrow();
  }

  if (mode === "custom") {
    return readNullableString(formData, "dueDate");
  }

  return null;
}

async function canWriteTask(taskId: string) {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { allowed: false, profile, task: null };
  }

  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) {
    return { allowed: false, profile, task: null };
  }

  if (profile.role === "owner") {
    return { allowed: true, profile, task };
  }

  if (task.is_private) {
    return { allowed: false, profile, task };
  }

  const assignedToManager = task.assigned_to === profile.id;
  const storeAllowed = task.store_id ? await canAccessStore(task.store_id, profile) : false;

  return {
    allowed: assignedToManager || storeAllowed,
    profile,
    task,
  };
}

export async function createTask(formData: FormData): Promise<ActionState> {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { ok: false, message: "Your account is not fully activated. Contact owner/admin." };
  }

  const title = readString(formData, "title");
  const storeId = readNullableString(formData, "storeId");
  const isPrivate = readString(formData, "isPrivate") === "on";

  if (!title) {
    return { ok: false, message: "Task title is required." };
  }

  if (profile.role !== "owner" && isPrivate) {
    return { ok: false, message: "Managers cannot create private owner tasks." };
  }

  if (profile.role !== "owner") {
    if (!storeId) {
      return { ok: false, message: "Choose one of your assigned stores." };
    }

    const allowed = await canAccessStore(storeId, profile);

    if (!allowed) {
      return { ok: false, message: "You can create tasks only for assigned stores." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title,
    description: readNullableString(formData, "description"),
    store_id: storeId,
    category: readNullableString(formData, "category"),
    priority: readString(formData, "priority") || "normal",
    due_date: dueDateFromForm(formData),
    due_time: readNullableString(formData, "dueTime"),
    is_private: profile.role === "owner" ? isPrivate : false,
    carry_forward: readString(formData, "carryForward") !== "off",
    assigned_to:
      profile.role === "owner" ? readNullableString(formData, "assignedTo") : null,
    source: "manual",
    status: "pending",
    created_by: profile.id,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  redirect("/app/tasks");
}

export async function updateTask(formData: FormData): Promise<ActionState> {
  const taskId = readString(formData, "taskId");
  const write = await canWriteTask(taskId);

  if (!write.allowed || !write.profile || !write.task) {
    return { ok: false, message: "You cannot edit this task." };
  }

  const storeId = readNullableString(formData, "storeId");

  if (write.profile.role !== "owner") {
    if (write.task.is_private) {
      return { ok: false, message: "Managers cannot edit private owner tasks." };
    }

    if (storeId && !(await canAccessStore(storeId, write.profile))) {
      return { ok: false, message: "You can edit tasks only for assigned stores." };
    }
  }

  const update: TablesUpdate<"tasks"> = {
    title: readString(formData, "title"),
    description: readNullableString(formData, "description"),
    category: readNullableString(formData, "category"),
    priority: readString(formData, "priority") || "normal",
    status: readString(formData, "status") || "pending",
    due_date: dueDateFromForm(formData),
    due_time: readNullableString(formData, "dueTime"),
    carry_forward: readString(formData, "carryForward") !== "off",
    store_id: storeId,
  };

  if (write.profile.role === "owner") {
    update.assigned_to = readNullableString(formData, "assignedTo");
    update.is_private = readString(formData, "isPrivate") === "on";
  }

  if (update.status === "done") {
    update.completed_at = new Date().toISOString();
  } else if (write.task.status === "done") {
    update.completed_at = null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(update).eq("id", taskId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/tasks");
  revalidatePath(`/app/tasks/${taskId}`);
  revalidatePath("/app/today");
  return { ok: true, message: "Task updated." };
}

export async function setTaskStatus(formData: FormData): Promise<ActionState> {
  const taskId = readString(formData, "taskId");
  const status = readString(formData, "status");
  const write = await canWriteTask(taskId);

  if (!write.allowed || !write.task) {
    return { ok: false, message: "You cannot update this task." };
  }

  const update: TablesUpdate<"tasks"> = {
    status,
    completed_at: status === "done" ? new Date().toISOString() : null,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(update).eq("id", taskId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return { ok: true, message: "Task status updated." };
}

export async function moveTaskToTomorrow(formData: FormData): Promise<ActionState> {
  const taskId = readString(formData, "taskId");
  const write = await canWriteTask(taskId);

  if (!write.allowed) {
    return { ok: false, message: "You cannot move this task." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ due_date: addDays(getIndiaToday(), 1), status: "pending" })
    .eq("id", taskId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return { ok: true, message: "Moved to tomorrow." };
}

export async function generateTodayReminders(): Promise<ActionState> {
  const { profile } = await requireProfile();

  if (!profile || profile.role !== "owner" || profile.is_active === false) {
    return { ok: false, message: "Only owners can generate reminders." };
  }

  const stores = await getAccessibleStores(profile);
  const reminders = buildAutoTasksForToday(profile, stores);
  const supabase = await createClient();
  let created = 0;

  for (const reminder of reminders) {
    let existingQuery = supabase
      .from("tasks")
      .select("id")
      .eq("source", "auto")
      .eq("category", reminder.category ?? "")
      .eq("due_date", reminder.due_date ?? getIndiaToday());

    existingQuery = reminder.store_id
      ? existingQuery.eq("store_id", reminder.store_id)
      : existingQuery.is("store_id", null);

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      continue;
    }

    const { error } = await supabase.from("tasks").insert(reminder);

    if (!error) {
      created += 1;
    }
  }

  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return {
    ok: true,
    message: created ? `Generated ${created} reminder tasks.` : "Today reminders already exist.",
  };
}
