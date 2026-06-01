"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday } from "@/lib/tasks/dates";

const moods = ["Fresh", "Normal", "Lazy", "Tired", "Focused", "Low"];
const energies = ["High", "Medium", "Low"];
const sleepQualities = ["Good", "Okay", "Poor"];

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readAllowed(formData: FormData, key: string, allowed: string[]) {
  const value = readString(formData, key);
  return allowed.includes(value) ? value : null;
}

async function completeOwnerLifeTask(userId: string, today: string, words: string[]) {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,category,status")
    .eq("created_by", userId)
    .eq("is_private", true)
    .eq("due_date", today)
    .in("status", ["pending", "in_progress", "waiting"]);

  const lowerWords = words.map((word) => word.toLowerCase());
  const matchingIds = (tasks ?? [])
    .filter((task) => {
      const haystack = `${task.title ?? ""} ${task.category ?? ""}`.toLowerCase();
      return lowerWords.some((word) => haystack.includes(word));
    })
    .map((task) => task.id);

  if (!matchingIds.length) return;

  await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .in("id", matchingIds);
}

async function upsertLifeLog(values: Record<string, unknown>, taskWords: string[] = []) {
  const session = await requireOwner();

  if (!session?.profile) return;

  const today = getIndiaToday();
  const supabase = await createClient();
  await supabase.from("life_logs").upsert(
    {
      user_id: session.profile.id,
      log_date: today,
      updated_at: new Date().toISOString(),
      ...values,
    },
    { onConflict: "user_id,log_date" },
  );

  if (taskWords.length) {
    await completeOwnerLifeTask(session.profile.id, today, taskWords);
  }

  revalidatePath("/app/life");
  revalidatePath("/app/today");
  revalidatePath("/app/secretary");
}

export async function saveLifeFlow(formData: FormData) {
  await upsertLifeLog({
    mood: readAllowed(formData, "mood", moods),
    energy: readAllowed(formData, "energy", energies),
    sleep_quality: readAllowed(formData, "sleepQuality", sleepQualities),
    notes: readString(formData, "notes") || null,
  });
}

export async function markWakeNow() {
  await upsertLifeLog({ wake_time: new Date().toISOString() });
}

export async function markSleepNow() {
  await upsertLifeLog({ sleep_time: new Date().toISOString() }, ["sleep"]);
}

export async function toggleGymDone(formData: FormData) {
  const next = readString(formData, "next") === "true";
  await upsertLifeLog({ gym_done: next }, next ? ["gym"] : []);
}

export async function toggleSportsDone(formData: FormData) {
  const next = readString(formData, "next") === "true";
  await upsertLifeLog({ sports_done: next }, next ? ["sports", "outdoor"] : []);
}

export async function toggleNoScrolling(formData: FormData) {
  const next = readString(formData, "next") === "true";
  await upsertLifeLog({ no_useless_scrolling: next });
}
