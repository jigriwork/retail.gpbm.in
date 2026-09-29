import "server-only";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday } from "@/lib/tasks/dates";

// Owner to-dos are ordinary tasks: private, no store, created by and assigned
// to the owner. RLS already hides private store-less tasks from managers, and
// they still appear under Tasks, so there is no separate table to keep in sync.
export const OWNER_TODO_CATEGORY = "owner-todo";

export type OwnerTodo = {
  completed_at: string | null;
  due_date: string | null;
  id: string;
  status: string | null;
  title: string;
};

export async function getOwnerTodos(): Promise<{ doneToday: OwnerTodo[]; open: OwnerTodo[] }> {
  const owner = await requireOwner();

  if (!owner) {
    return { doneToday: [], open: [] };
  }

  const supabase = await createClient();
  const startOfToday = new Date(`${getIndiaToday()}T00:00:00+05:30`).toISOString();
  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,status,due_date,completed_at")
    .eq("category", OWNER_TODO_CATEGORY)
    .eq("created_by", owner.profile.id)
    .or(`status.is.null,status.not.in.(done,cancelled),completed_at.gte.${startOfToday}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(`Could not load owner to-dos: ${error.message}`);
  }

  const todos = data ?? [];
  return {
    doneToday: todos.filter((todo) => todo.status === "done"),
    open: todos.filter((todo) => !["done", "cancelled"].includes(todo.status ?? "pending")),
  };
}
