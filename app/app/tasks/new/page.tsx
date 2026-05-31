import Link from "next/link";

import { TaskForm } from "@/components/tasks/task-form";
import { createTask } from "@/lib/tasks/actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function NewTaskPage() {
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const supabase = await createClient();
  const { data: profiles } =
    profile?.role === "owner"
      ? await supabase
          .from("profiles")
          .select("id,full_name,email")
          .eq("is_active", true)
          .order("full_name")
      : { data: [] };

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/tasks">
          Back to tasks
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Add task</h1>
      </div>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <TaskForm
          action={createTask}
          assignableUsers={profiles ?? []}
          currentProfile={profile}
          stores={stores}
          submitLabel="Create task"
        />
      </section>
    </div>
  );
}
