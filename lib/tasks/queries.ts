import { getAccessibleStores, type Profile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday, getIndiaTomorrow } from "@/lib/tasks/dates";

export type TaskWithRelations = {
  assigned_to: string | null;
  carry_forward: boolean | null;
  category: string | null;
  completed_at: string | null;
  created_at: string | null;
  created_by: string | null;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  id: string;
  is_private: boolean | null;
  priority: string | null;
  source: string | null;
  status: string | null;
  store_id: string | null;
  title: string;
  updated_at: string | null;
  stores: { id: string; name: string; code: string } | null;
  assigned_profile: { id: string; full_name: string | null; email: string | null } | null;
};

const taskSelect = `
  *,
  stores(id,name,code),
  assigned_profile:profiles!tasks_assigned_to_fkey(id,full_name,email)
`;

export async function getTasksForProfile() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(taskSelect)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as TaskWithRelations[];
}

export function filterTasksByTab(tasks: TaskWithRelations[], tab: string) {
  const today = getIndiaToday();
  const tomorrow = getIndiaTomorrow();

  return tasks.filter((task) => {
    const status = task.status ?? "pending";
    const dueDate = task.due_date;
    const active = status !== "done" && status !== "cancelled";

    if (tab === "completed") {
      return status === "done";
    }

    if (tab === "tomorrow") {
      return active && dueDate === tomorrow;
    }

    if (tab === "upcoming") {
      return active && dueDate !== null && dueDate > tomorrow;
    }

    if (tab === "pending") {
      return active && (!dueDate || dueDate < today);
    }

    return active && dueDate === today;
  });
}

export async function getTaskSummary(
  profile: Profile,
  accessibleStores?: Awaited<ReturnType<typeof getAccessibleStores>>,
) {
  const tasks = await getTasksForProfile();
  const todayTasks = filterTasksByTab(tasks, "today");
  const urgentTasks = todayTasks.filter((task) => task.priority === "urgent");
  const privateTasks =
    profile.role === "owner"
      ? todayTasks.filter((task) => task.is_private || !task.store_id)
      : [];
  const stores = accessibleStores ?? (await getAccessibleStores(profile));
  const storeCounts = stores.map((store) => ({
    store,
    count: todayTasks.filter((task) => task.store_id === store.id).length,
  }));

  return {
    todayCount: todayTasks.length,
    urgentCount: urgentTasks.length,
    privateCount: privateTasks.length,
    storeCounts,
  };
}
