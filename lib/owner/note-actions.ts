"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type OwnerNoteActionState = {
  ok: boolean;
  message: string;
};

const denied = { ok: false, message: "Only an active owner can change shared owner notes." };

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function noteValues(formData: FormData) {
  return {
    content: value(formData, "content").slice(0, 4000),
    title: value(formData, "title").slice(0, 120),
  };
}

function refreshOwnerWork() {
  revalidatePath("/app/today");
  revalidatePath("/app/tasks");
}

export async function createOwnerNote(
  _state: OwnerNoteActionState,
  formData: FormData,
): Promise<OwnerNoteActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const input = noteValues(formData);
  if (!input.title) return { ok: false, message: "Add a short note title." };

  const supabase = await createClient();
  const { error } = await supabase.from("owner_notes").insert({
    ...input,
    created_by: owner.profile.id,
    updated_by: owner.profile.id,
  });

  if (error) return { ok: false, message: error.message };
  refreshOwnerWork();
  return { ok: true, message: "Shared owner note saved." };
}

export async function updateOwnerNote(
  _state: OwnerNoteActionState,
  formData: FormData,
): Promise<OwnerNoteActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const noteId = value(formData, "noteId");
  const input = noteValues(formData);
  if (!noteId || !input.title) return { ok: false, message: "Note title is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("owner_notes")
    .update({ ...input, updated_by: owner.profile.id })
    .eq("id", noteId);

  if (error) return { ok: false, message: error.message };
  refreshOwnerWork();
  return { ok: true, message: "Note updated." };
}

async function setArchived(formData: FormData, archived: boolean): Promise<OwnerNoteActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const noteId = value(formData, "noteId");
  if (!noteId) return { ok: false, message: "Note not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("owner_notes")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_by: owner.profile.id,
    })
    .eq("id", noteId);

  if (error) return { ok: false, message: error.message };
  refreshOwnerWork();
  return { ok: true, message: archived ? "Note archived." : "Note restored." };
}

export async function archiveOwnerNote(
  _state: OwnerNoteActionState,
  formData: FormData,
) {
  return setArchived(formData, true);
}

export async function restoreOwnerNote(
  _state: OwnerNoteActionState,
  formData: FormData,
) {
  return setArchived(formData, false);
}

export async function convertOwnerNoteToTask(
  _state: OwnerNoteActionState,
  formData: FormData,
): Promise<OwnerNoteActionState> {
  const owner = await requireOwner();
  if (!owner) return denied;

  const noteId = value(formData, "noteId");
  if (!noteId) return { ok: false, message: "Note not found." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("convert_owner_note_to_task", { p_note_id: noteId });

  if (error) return { ok: false, message: error.message };

  refreshOwnerWork();
  return { ok: true, message: "Task created in the existing task system." };
}
