"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/auth/session";
import type {
  StaffAliasRow,
  StaffAliasState,
  StaffContactOption,
  UnmatchedStaffName,
} from "@/lib/reports/staff-aliases";

const initialState: StaffAliasState = {
  ok: false,
  message: "",
};

function storeName(stores: Store[], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? "Store";
}

function ContactSelect({
  contacts,
  defaultValue,
  storeId,
}: {
  contacts: StaffContactOption[];
  defaultValue?: string | null;
  storeId: string;
}) {
  const storeContacts = contacts.filter((contact) => contact.store_id === storeId);

  return (
    <select
      className="h-11 w-full rounded-2xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
      defaultValue={defaultValue ?? ""}
      name="employeeContactId"
    >
      <option value="">Use source name</option>
      <option value="__new">Create staff contact</option>
      {storeContacts.map((contact) => (
        <option key={contact.id} value={contact.id}>
          {contact.staff_name}
        </option>
      ))}
    </select>
  );
}

function AliasForm({
  action,
  contacts,
  defaultContactId,
  sourceName,
  storeId,
  stores,
  isActive = true,
}: {
  action: (previous: StaffAliasState, formData: FormData) => Promise<StaffAliasState>;
  contacts: StaffContactOption[];
  defaultContactId?: string | null;
  isActive?: boolean;
  sourceName: string;
  storeId: string;
  stores: Store[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
      <label className="block">
        <span className="mb-2 block text-xs font-medium text-muted">Store</span>
        <select
          className="h-11 w-full rounded-2xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
          defaultValue={storeId}
          name="storeId"
          required
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-medium text-muted">Source name</span>
        <input
          className="h-11 w-full rounded-2xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
          defaultValue={sourceName}
          name="sourceName"
          required
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-medium text-muted">Mapped staff</span>
        <ContactSelect contacts={contacts} defaultValue={defaultContactId} storeId={storeId} />
      </label>

      <div className="flex items-center gap-3">
        <label className="flex h-11 items-center gap-2 text-sm font-medium">
          <input className="size-4 accent-foreground" defaultChecked={isActive} name="isActive" type="checkbox" />
          Active
        </label>
        <Button disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </div>

      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success lg:col-span-4" : "text-sm font-medium text-danger lg:col-span-4"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function StaffAliasesManager({
  action,
  aliases,
  contacts,
  stores,
  unmatched,
}: {
  action: (previous: StaffAliasState, formData: FormData) => Promise<StaffAliasState>;
  aliases: StaffAliasRow[];
  contacts: StaffContactOption[];
  stores: Store[];
  unmatched: UnmatchedStaffName[];
}) {
  const firstStoreId = stores[0]?.id ?? "";

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Add mapping</h2>
        {firstStoreId ? (
          <div className="mt-4">
            <AliasForm
              action={action}
              contacts={contacts}
              sourceName=""
              storeId={firstStoreId}
              stores={stores}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No active assigned store is available.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Unmatched sales names</h2>
        {unmatched.length ? (
          unmatched.map((item) => (
            <article className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={`${item.storeId}:${item.normalizedSourceName}`}>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{item.sourceName}</p>
                  <p className="text-sm text-muted">{storeName(stores, item.storeId)}</p>
                </div>
                <p className="text-sm font-medium text-muted">{item.rowCount} rows</p>
              </div>
              <AliasForm
                action={action}
                contacts={contacts}
                sourceName={item.sourceName}
                storeId={item.storeId}
                stores={stores}
              />
            </article>
          ))
        ) : (
          <section className="rounded-[1.35rem] border border-border bg-card p-5 text-sm text-muted shadow-sm">
            No unmatched sales names found for the selected filters.
          </section>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Existing aliases</h2>
        {aliases.length ? (
          aliases.map((alias) => (
            <article className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={alias.id}>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{alias.source_name}</p>
                  <p className="text-sm text-muted">
                    {alias.stores?.name ?? "Store"} to {alias.canonical_staff_name}
                  </p>
                </div>
                <p className="text-sm font-medium text-muted">{alias.is_active === false ? "Inactive" : "Active"}</p>
              </div>
              <AliasForm
                action={action}
                contacts={contacts}
                defaultContactId={alias.employee_contact_id}
                isActive={alias.is_active !== false}
                sourceName={alias.source_name}
                storeId={alias.store_id}
                stores={stores}
              />
            </article>
          ))
        ) : (
          <section className="rounded-[1.35rem] border border-border bg-card p-5 text-sm text-muted shadow-sm">
            No aliases found for the selected filters.
          </section>
        )}
      </section>
    </div>
  );
}
