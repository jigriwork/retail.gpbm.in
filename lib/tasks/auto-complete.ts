import { createClient } from "@/lib/supabase/server";

export async function completeMatchingTasks(
  storeId: string,
  dueDate: string,
  matchWords: string[],
) {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,category,status")
    .eq("store_id", storeId)
    .eq("due_date", dueDate)
    .in("status", ["pending", "in_progress", "waiting"]);

  const normalizedWords = matchWords.map((word) => word.toLowerCase());
  const matchingIds = (tasks ?? [])
    .filter((task) => {
      const haystack = `${task.title ?? ""} ${task.category ?? ""}`.toLowerCase();
      return normalizedWords.some((word) => haystack.includes(word));
    })
    .map((task) => task.id);

  if (!matchingIds.length) {
    return;
  }

  await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .in("id", matchingIds);
}
