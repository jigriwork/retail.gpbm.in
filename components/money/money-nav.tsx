import Link from "next/link";

import type { Store } from "@/lib/auth/session";

export function MoneyHeader({ description, title }: { description: string; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted">Store money</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}

/** Tabs for the money pages, keeping the chosen store; the store switch shows when there is more than one. */
export function MoneyNav({ active, isCashier = false, isOwner, storeId, stores, extra = {} }: {
  active: string; isCashier?: boolean; isOwner: boolean; storeId: string; stores: Pick<Store, "id" | "name">[]; extra?: Record<string, string>;
}) {
  // Cash goes in the cash book; "Other expenses" are bank/UPI/owner-paid. Profit is owner-only.
  const links = [
    { href: "/app/money", label: "Cash book" },
    ...(isCashier ? [] : [{ href: "/app/money/expenses", label: "Other expenses" }]),
    ...(isOwner ? [{ href: "/app/money/profit", label: "Profit" }] : []),
  ];
  const query = (params: Record<string, string>) => `?${new URLSearchParams(params)}`;
  return (
    <div className="space-y-2">
      <nav aria-label="Store money" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {links.map((link) => (
          <Link
            aria-current={link.href === active ? "page" : undefined}
            className={link.href === active
              ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
              : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
            href={`${link.href}${query({ store: storeId })}`}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {stores.length > 1 ? (
        <nav aria-label="Store" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {stores.map((store) => (
            <Link
              aria-current={store.id === storeId ? "page" : undefined}
              className={store.id === storeId
                ? "shrink-0 rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary"
                : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
              href={`${active}${query({ ...extra, store: store.id })}`}
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
