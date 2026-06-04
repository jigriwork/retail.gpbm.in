"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ActionState = {
  ok: boolean;
  message: string;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

export function CreateManagerForm({
  action,
  disabled,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionState, formData: FormData) => action(formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="h-12 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          disabled={disabled}
          name="fullName"
          placeholder="Full name"
          required
        />
        <input
          className="h-12 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          disabled={disabled}
          name="phone"
          placeholder="Phone optional"
        />
        <input
          className="h-12 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          disabled={disabled}
          name="email"
          placeholder="Email"
          required
          type="email"
        />
        <input
          className="h-12 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          disabled={disabled}
          minLength={6}
          name="password"
          placeholder="Temporary password"
          required
          type="password"
        />
      </div>
      <Button disabled={disabled || pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create manager
      </Button>
      {disabled ? (
        <p className="text-sm leading-6 text-muted">
          Manager creation requires server service key.
        </p>
      ) : null}
      {state.message ? (
        <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function AssignStoreForm({
  action,
  managers,
  stores,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  managers: Array<{ id: string; full_name: string | null; email: string | null }>;
  stores: Array<{ id: string; name: string; code: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionState, formData: FormData) => action(formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <select
          className="h-12 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          name="userId"
          required
        >
          <option value="">Manager</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.full_name ?? manager.email ?? "Manager"}
            </option>
          ))}
        </select>
        <select
          className="h-12 rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
          name="storeId"
          required
        >
          <option value="">Store</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name} ({store.code})
            </option>
          ))}
        </select>
        <Button disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Assign
        </Button>
      </div>
      {state.message ? (
        <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function ManagerStoreAssignmentsForm({
  action,
  assignedStoreIds,
  managerId,
  stores,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  assignedStoreIds: string[];
  managerId: string;
  stores: Array<{ id: string; name: string; code: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionState, formData: FormData) => action(formData),
    initialState,
  );
  const assigned = new Set(assignedStoreIds);

  return (
    <form action={formAction} className="space-y-3">
      <input name="userId" type="hidden" value={managerId} />
      <div className="space-y-2">
        <p className="text-sm font-semibold">Assigned Stores</p>
        <div className="flex flex-wrap gap-2">
          {stores.map((store) => (
            <label
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold"
              key={store.id}
            >
              <input
                className="size-4 accent-black"
                defaultChecked={assigned.has(store.id)}
                name="storeIds"
                type="checkbox"
                value={store.id}
              />
              {store.name}
            </label>
          ))}
        </div>
      </div>
      <Button className="h-10 rounded-xl px-3 text-xs" disabled={pending} variant="secondary">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save Assignments
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-xs text-success" : "text-xs text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function ProfileActiveForm({
  action,
  userId,
  isActive,
}: {
  action: (formData: FormData) => Promise<ActionState>;
  userId: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionState, formData: FormData) => action(formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input name="userId" type="hidden" value={userId} />
      <input name="isActive" type="hidden" value={String(!isActive)} />
      <Button disabled={pending} variant="secondary">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {isActive ? "Deactivate" : "Activate"}
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-xs text-success" : "text-xs text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
