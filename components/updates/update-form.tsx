"use client";

import { useActionState } from "react";
import { Camera, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store, Profile } from "@/lib/auth/session";
import type { UpdateActionState } from "@/lib/updates/actions";
import { updateCategories, updateStatuses, updateUrgencies } from "@/lib/updates/constants";
import type { ManagerUpdate } from "@/lib/updates/queries";

const initialState: UpdateActionState = {
  ok: false,
  message: "",
};

export function ManagerUpdateForm({
  action,
  assignableUsers,
  defaultStoreId,
  mode,
  stores,
  update,
}: {
  action: (previous: UpdateActionState, formData: FormData) => Promise<UpdateActionState>;
  assignableUsers: Pick<Profile, "id" | "full_name" | "email">[];
  defaultStoreId?: string;
  mode: "create" | "edit";
  stores: Store[];
  update?: ManagerUpdate | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const creating = mode === "create";

  return (
    <form action={formAction} className="space-y-5">
      {update ? <input name="updateId" type="hidden" value={update.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Store</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={update?.store_id ?? defaultStoreId ?? stores[0]?.id ?? ""}
            disabled={!creating}
            name="storeId"
            required
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
          {!creating && update?.store_id ? (
            <input name="storeId" type="hidden" value={update.store_id} />
          ) : null}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Category</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={update?.category ?? "Owner attention needed"}
            name="category"
            required
          >
            {updateCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Urgency</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm capitalize outline-none focus:border-foreground"
            defaultValue={update?.urgency ?? "normal"}
            name="urgency"
          >
            {updateUrgencies.map((urgency) => (
              <option key={urgency} value={urgency}>
                {urgency}
              </option>
            ))}
          </select>
        </label>

        {!creating ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Status</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm capitalize outline-none focus:border-foreground"
              defaultValue={update?.status ?? "open"}
              name="status"
            >
              {updateStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Title</span>
        <input
          className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus:border-foreground"
          defaultValue={update?.title ?? ""}
          name="title"
          placeholder="What needs attention?"
          required
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Details</span>
        <textarea
          className="min-h-32 w-full rounded-2xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-foreground"
          defaultValue={update?.details ?? ""}
          name="details"
          placeholder="Add the full store update, issue, customer follow-up, stock note, or pending work."
        />
      </label>

      {creating ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input className="size-5 accent-black" name="createTask" type="checkbox" />
            Create follow-up task
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-muted">Assign to</span>
              <select
                className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
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
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-muted">Due</span>
              <select
                className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
                defaultValue="today"
                name="taskDueMode"
              >
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="custom">Custom</option>
                <option value="">No date</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-muted">Custom date</span>
              <input
                className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
                name="taskDueDate"
                type="date"
              />
            </label>
          </div>
        </section>
      ) : null}

      <label className="block rounded-[1.35rem] border border-dashed border-border bg-card p-5">
        <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Camera className="size-4" />
          Optional photo
        </span>
        <input
          accept="image/*"
          className="block w-full text-sm text-muted file:mr-4 file:h-10 file:rounded-xl file:border-0 file:bg-foreground file:px-4 file:text-sm file:font-semibold file:text-background"
          name="photo"
          type="file"
        />
        {update?.photo_path ? (
          <span className="mt-3 block text-xs leading-5 text-muted">
            A photo is already attached. Uploading a new one will replace the stored path.
          </span>
        ) : null}
      </label>

      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}

      <Button disabled={pending} size="lg">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {creating ? "Add store update" : "Save update"}
      </Button>
    </form>
  );
}
