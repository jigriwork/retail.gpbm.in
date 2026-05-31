import Link from "next/link";

import { getAccessibleStores, requireProfile } from "@/lib/auth/session";

export default async function StoresPage() {
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-muted">Stores</p>
        <h1 className="mt-2 text-3xl font-semibold">Your store access</h1>
      </div>

      {stores.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <Link
              className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
              href={`/app/stores/${store.id}`}
              key={store.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{store.name}</h2>
                  <p className="mt-1 text-sm text-muted">{store.code}</p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-muted">
                  {store.type ?? "store"}
                </span>
              </div>
              <p className="mt-8 text-sm font-medium">
                Target{" "}
                <span className="text-muted">
                  {store.monthly_target_enabled ? "enabled" : "disabled"}
                </span>
              </p>
            </Link>
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
