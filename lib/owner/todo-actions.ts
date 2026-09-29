"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { OWNER_TODO_CATEGORY, ownerTodoRow } from "@/lib/owner/todos";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday, getIndiaTomorrow } from "@/lib/tasks/dates";

export type OwnerTodoActionState = {
  ok: boolean;
  message: string;
};

const denied = { ok: false, message: "Only an active owner can change owner to-dos." };

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function refreshOwnerWork() {
  revalidatePath("/app/today");
  revalidatePath("/app/tasks");
}

export async function addOwnerTodo(
  _state: OwnerTodoActionState,
  formData: FormData,
): Promise<OwnerTodoActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const title = value(formData, "title").slice(0, 200);
  if (!title) return { ok: false, message: "Type what you need to do." };

  const due = value(formData, "due");
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .insert(ownerTodoRow(owner.profile.id, title, due === "tomorrow" ? getIndiaTomorrow() : due === "none" ? null : getIndiaToday()));

  if (error) return { ok: false, message: error.message };
  refreshOwnerWork();
  return { ok: true, message: "Added." };
}

export async function setOwnerTodoStatus(formData: FormData): Promise<OwnerTodoActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const todoId = value(formData, "todoId");
  const status = value(formData, "status");
  if (!todoId || !["done", "pending", "cancelled"].includes(status)) {
    return { ok: false, message: "Unknown to-do change." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", todoId)
    .eq("category", OWNER_TODO_CATEGORY)
    .eq("created_by", owner.profile.id);

  if (error) return { ok: false, message: error.message };
  refreshOwnerWork();
  return { ok: true, message: status === "done" ? "Done." : status === "cancelled" ? "Removed." : "Reopened." };
}
