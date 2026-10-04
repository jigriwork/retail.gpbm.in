import Link from "next/link";

import type { Store } from "@/lib/auth/session";

const tabs = [
  { href: "/app/buying", label: "Sell-through" },
  { href: "/app/buying/reorder", label: "Reorder" },
  { href: "/app/buying/transfers", label: "Transfers" },
  { href: "/app/buying/markdown", label: "Markdown" },
  { href: "/app/buying/budgets", label: "Budgets", ownerOnly: true },
  { href: "/app/stock-counts", label: "Stock counts" },
];

export function BuyingHeader({ description, title }: { description: string; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted">Buying & stock</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}

export function BuyingNav({ active, isOwner, storeId, stores }: { active: string; isOwner: boolean; storeId?: string; stores?: Pick<Store, "id" | "name">[] }) {
  const query = storeId ? `?store=${storeId}` : "";
  const pill = (current: boolean) => current
    ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
    : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted";
  return (
    <div className="space-y-2">
      <nav aria-label="Buying" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.filter((tab) => isOwner || !tab.ownerOnly).map((tab) => (
          <Link aria-current={tab.href === active ? "page" : undefined} className={pill(tab.href === active)} href={`${tab.href}${query}`} key={tab.href}>{tab.label}</Link>
        ))}
      </nav>
      {stores && stores.length > 1 && storeId ? (
        <nav aria-label="Store" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {stores.map((store) => (
            <Link
              aria-current={store.id === storeId ? "page" : undefined}
              className={store.id === storeId
                ? "shrink-0 rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary"
                : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
              href={`${active}?store=${store.id}`}
              key={store.id}
            >
              {store.name}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

/** Store chosen by ?store=, else the first store the viewer can see. */
export function pickStore<T extends { id: string }>(stores: T[], storeId?: string) {
  return stores.find((store) => store.id === storeId) ?? stores[0];
}
