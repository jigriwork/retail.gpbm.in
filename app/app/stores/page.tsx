import Link from "next/link";
import { ChevronRight, Plus, Store as StoreIcon } from "lucide-react";

import { AddStoreForm } from "@/components/stores/add-store-form";
import { StoreActiveToggle } from "@/components/stores/store-active-toggle";
import { getAccessibleStores, requireProfile, type Store } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { createClient } from "@/lib/supabase/server";

function StoreCard({ href, limited, store }: { href: string; limited: boolean; store: Store }) {
  return (
    <Link
      className="flex flex-col rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-primary"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <StoreIcon className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">{store.name}</h2>
            <p className="text-sm text-muted">
              {store.code}
              {store.location ? ` · ${store.location}` : ""}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-muted">
          {store.type ?? "store"}
        </span>
      </div>
      {!limited ? (
        <p className="mt-6 text-sm font-medium">
          Target <span className="text-muted">{store.monthly_target_enabled ? "enabled" : "disabled"}</span>
        </p>
      ) : null}
    </Link>
  );
}

export default async function StoresPage() {
  const { profile } = await requireProfile();
  const isOwner = profile?.role === "owner";

  if (!isOwner) {
    const stores = await getAccessibleStores(profile);
    const limited = await isLimitedView(profile);
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-muted">Stores</p>
          <h1 className="mt-2 text-3xl font-semibold">Your store access</h1>
        </div>
        {stores.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => (
              <StoreCard
                href={limited ? `/app/checklist/${store.id}` : `/app/stores/${store.id}`}
                key={store.id}
                limited={limited}
                store={store}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm leading-6 text-muted shadow-sm">
            No stores are available for this account yet.
          </div>
        )}
      </div>
    );
  }

  // Owners manage every store, including switched-off ones.
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("*").order("is_active", { ascending: false }).order("name");
  const stores = (data ?? []) as Store[];
  const active = stores.filter((store) => store.is_active);
  const inactive = stores.filter((store) => !store.is_active);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Stores</p>
          <h1 className="mt-2 text-3xl font-semibold">Your stores</h1>
          <p className="mt-1 text-sm text-muted">
            {active.length} active{inactive.length ? ` · ${inactive.length} switched off` : ""}
          </p>
        </div>
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary" href="/app/users">
          Assign managers <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((store) => (
          <div className="space-y-2" key={store.id}>
            <StoreCard href={`/app/stores/${store.id}`} limited={false} store={store} />
            <div className="px-1">
              <StoreActiveToggle active storeId={store.id} storeName={store.name} />
            </div>
          </div>
        ))}
      </div>

      <details className="group rounded-[1.35rem] border border-border bg-card shadow-sm" open={active.length === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
            <Plus className="size-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Add a store</h2>
            <p className="text-sm text-muted">Opening a new branch? Set it up here, then assign its manager.</p>
          </div>
          <ChevronRight className="size-5 text-muted transition group-open:rotate-90" />
        </summary>
        <div className="border-t border-border p-5">
          <AddStoreForm />
        </div>
      </details>

      {inactive.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Switched off</h2>
          <p className="text-sm text-muted">Hidden from managers and daily work. Their history is kept.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((store) => (
              <div className="rounded-[1.35rem] border border-dashed border-border bg-card/60 p-5" key={store.id}>
                <p className="text-lg font-semibold">{store.name}</p>
                <p className="text-sm text-muted">
                  {store.code}
                  {store.location ? ` · ${store.location}` : ""}
                </p>
                <div className="mt-4">
                  <StoreActiveToggle active={false} storeId={store.id} storeName={store.name} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
