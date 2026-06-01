import Link from "next/link";
import { Plus, SlidersHorizontal } from "lucide-react";

import { UpdateCard } from "@/components/updates/update-card";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { updateCategories, updateStatuses, updateUrgencies } from "@/lib/updates/constants";
import { getManagerUpdates } from "@/lib/updates/queries";

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    storeId?: string;
    status?: string;
    urgency?: string;
    category?: string;
    period?: string;
  }>;
}) {
  const filters = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const activeStoreIds = new Set(stores.map((store) => store.id));
  const activeFilters = { ...filters, status: filters.status ?? "open" };
  const updates = (await getManagerUpdates({ ...activeFilters, limit: 80 })).filter(
    (update) => update.store_id && activeStoreIds.has(update.store_id),
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Manager Updates</p>
            <h1 className="mt-2 text-3xl font-semibold">Store updates feed</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Issues, customer follow-ups, stock notes, pending work and owner attention items.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
            href="/app/updates/new"
          >
            <Plus className="size-4" />
            Add update
          </Link>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted" />
          <h2 className="font-semibold">Filters</h2>
        </div>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            className="h-11 rounded-2xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
            defaultValue={filters.storeId ?? "all"}
            name="storeId"
          >
            <option value="all">All stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-2xl border border-border bg-card px-3 text-sm capitalize outline-none focus:border-foreground"
            defaultValue={activeFilters.status}
            name="status"
          >
            <option value="all">All status</option>
            {updateStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-2xl border border-border bg-card px-3 text-sm capitalize outline-none focus:border-foreground"
            defaultValue={filters.urgency ?? "all"}
            name="urgency"
          >
            <option value="all">All urgency</option>
            {updateUrgencies.map((urgency) => (
              <option key={urgency} value={urgency}>
                {urgency}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-2xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
            defaultValue={filters.category ?? "all"}
            name="category"
          >
            <option value="all">All categories</option>
            {updateCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-2xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
            defaultValue={filters.period ?? "all"}
            name="period"
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="all">All</option>
          </select>
          <button className="h-11 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background lg:col-span-5">
            Apply filters
          </button>
        </form>
      </section>

      {updates.length ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {updates.map((update) => (
            <UpdateCard key={update.id} update={update} />
          ))}
        </section>
      ) : (
        <section className="rounded-[1.35rem] border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-2xl font-semibold">No updates waiting.</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Add a store update when something needs attention.
          </p>
        </section>
      )}
    </div>
  );
}
