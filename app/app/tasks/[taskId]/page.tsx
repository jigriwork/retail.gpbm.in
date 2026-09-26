import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskForm } from "@/components/tasks/task-form";
import { updateTask } from "@/lib/tasks/actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { TaskWithRelations } from "@/lib/tasks/queries";

const taskSelect = `
  *,
  stores(id,name,code),
  assigned_profile:profiles!tasks_assigned_to_fkey(id,full_name,email),
  assigned_employee:employee_contacts!tasks_assigned_employee_id_fkey(id,staff_name,store_id)
`;

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const { profile } = await requireProfile();

  if (!profile) {
    return null;
  }

  const supabase = await createClient();
  const [{ data: task }, stores, { data: profiles }, { data: employees }] = await Promise.all([
    supabase.from("tasks").select(taskSelect).eq("id", taskId).maybeSingle(),
    getAccessibleStores(profile),
    profile.role === "owner"
      ? supabase
          .from("profiles")
          .select("id,full_name,email")
          .eq("is_active", true)
          .order("full_name")
      : Promise.resolve({ data: [] }),
    supabase.from("employee_contacts").select("id,staff_name,store_id").eq("is_active", true).order("staff_name"),
  ]);

  if (!task) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/tasks">
          Back to tasks
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Edit task</h1>
      </div>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <TaskForm
          action={updateTask}
          assignableUsers={profiles ?? []}
          assignableEmployees={employees ?? []}
          currentProfile={profile}
          stores={stores}
          submitLabel="Save task"
          task={task as TaskWithRelations}
        />
      </section>
    </div>
  );
}
