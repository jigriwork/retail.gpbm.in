"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Profile, Store } from "@/lib/auth/session";
import type { TaskWithRelations } from "@/lib/tasks/queries";

type ActionState = {
  ok: boolean;
  message: string;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

function dateMode(task?: TaskWithRelations | null) {
  if (!task?.due_date) {
    return "none";
  }

  return "custom";
}

export function TaskForm({
  action,
  task,
  stores,
  assignableUsers,
  currentProfile,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  task?: TaskWithRelations | null;
  stores: Store[];
  assignableUsers: Pick<Profile, "id" | "full_name" | "email">[];
  currentProfile: Profile;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionState, formData: FormData) => action(formData),
    initialState,
  );
  const owner = currentProfile.role === "owner";

  return (
    <form action={formAction} className="space-y-4">
      {task ? <input name="taskId" type="hidden" value={task.id} /> : null}

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Title</span>
        <input
          className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus:border-foreground"
          defaultValue={task?.title ?? ""}
          name="title"
          placeholder="Call vendor"
          required
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Description
        </span>
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-foreground"
          defaultValue={task?.description ?? ""}
          name="description"
          placeholder="Optional notes"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Store</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={task?.store_id ?? ""}
            name="storeId"
          >
            <option value="">No store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">
            Category
          </span>
          <input
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={task?.category ?? ""}
            name="category"
            placeholder="sales, salary, personal"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">
            Priority
          </span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={task?.priority ?? "normal"}
            name="priority"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">
            Due date
          </span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={dateMode(task)}
            name="dueDateMode"
          >
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="custom">Custom date</option>
            <option value="none">No date</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">
            Custom date
          </span>
          <input
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={task?.due_date ?? ""}
            name="dueDate"
            type="date"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">
            Due time
          </span>
          <input
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={task?.due_time?.slice(0, 5) ?? ""}
            name="dueTime"
            type="time"
          />
        </label>

        {task ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">
              Status
            </span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={task.status ?? "pending"}
              name="status"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="waiting">Waiting</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        ) : null}

        {owner ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">
              Assign to
            </span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={task?.assigned_to ?? ""}
              name="assignedTo"
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name ?? user.email ?? "User"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {owner ? (
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium">
            <input
              className="size-4 accent-black"
              defaultChecked={task?.is_private ?? false}
              name="isPrivate"
              type="checkbox"
            />
            Private owner task
          </label>
        ) : null}
        <label className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium">
          <input
            className="size-4 accent-black"
            defaultChecked={task?.carry_forward ?? true}
            name="carryForward"
            type="checkbox"
          />
          Carry forward
        </label>
      </div>

      {state.message ? (
        <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {state.message}
        </p>
      ) : null}

      <Button disabled={pending} size="lg">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
