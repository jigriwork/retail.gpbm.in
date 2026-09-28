import Link from "next/link";
import { Plus } from "lucide-react";

import { OwnerToolsNav } from "@/components/owner/owner-tools-nav";
import { SopCard } from "@/components/sops/sop-card";
import { getSopsForViewer } from "@/lib/sops/queries";

export default async function SopsPage({ searchParams }: { searchParams: Promise<{ storeId?: string }> }) {
  const { storeId } = await searchParams;
  const { available, isOwner, sops, store, stores } = await getSopsForViewer(storeId);

  return (
    <div className="space-y-5">
      {isOwner ? <OwnerToolsNav active="/app/sops" /> : null}
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">{isOwner ? "Owners manage · managers read their store's SOPs" : store?.name ?? "Your store"}</p>
        <h1 className="mt-2 text-3xl font-semibold">Store SOPs</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Short routines for opening, the selling floor, complaints and closing. Follow them during the day; record only exceptions.
        </p>
        {stores.length > 1 || isOwner ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {isOwner ? (
              <Link className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!store ? "bg-foreground text-background" : "border-border"}`} href="/app/sops">
                All SOPs
              </Link>
            ) : null}
            {stores.map((item) => (
              <Link
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${store?.id === item.id ? "bg-foreground text-background" : "border-border"}`}
                href={`/app/sops?storeId=${item.id}`}
                key={item.id}
              >
                {isOwner ? `As ${item.name} manager sees it` : item.name}
              </Link>
            ))}
          </div>
        ) : null}
        {sops.length ? (
          <nav aria-label="SOP list" className="mt-4 flex flex-wrap gap-2">
            {sops.map((sop) => (
              <a className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold" href={`#${sop.sop_key}`} key={sop.id}>
                {sop.title}
              </a>
            ))}
          </nav>
        ) : null}
      </section>

      {isOwner ? (
        <Link className="inline-flex h-11 items-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background" href="/app/sops/new">
          <Plus className="size-4" /> New SOP
        </Link>
      ) : null}

      {!available ? (
        <p className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">SOPs are not available for this account.</p>
      ) : sops.length ? (
        sops
          .filter((sop) => !store || sop.is_active)
          .map((sop) => <SopCard canEdit={isOwner} key={sop.id} sop={sop} storeId={store?.id ?? sop.store_id} />)
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted">No SOP has been published for this store yet.</p>
      )}
    </div>
  );
}
