import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { BuyingHeader, BuyingNav, pickStore } from "@/components/buying/buying-nav";
import { shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { startStockCount } from "@/lib/buying/actions";
import { countScopes, listStockCounts, refreshStockPositions } from "@/lib/buying/queries";

const statusLabel: Record<string, { label: string; tone: "muted" | "warn" | "good" }> = {
  counting: { label: "Counting", tone: "warn" },
  submitted: { label: "Waiting for owner", tone: "muted" },
  reviewed: { label: "Reviewed", tone: "good" },
};

export default async function StockCountsPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Stock counts are for the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  const store = pickStore(stores, (await searchParams).store);
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const limited = await isLimitedView(profile);
  await refreshStockPositions([store.id]);
  const [counts, brands] = await Promise.all([listStockCounts(store.id), countScopes(store.id)]);

  return (
    <div className="space-y-5">
      <BuyingHeader
        description="Count one brand at a time, every week or two. The counter only enters what is on the shelf; the app compares it with the expected stock (latest stock report less sales since) after the count is submitted."
        title="Stock counts"
      />
      {limited ? null : <BuyingNav active="/app/stock-counts" isOwner={profile.role === "owner"} storeId={store.id} stores={stores} />}

      <Panel description="Start when the floor is quiet. Count every piece of the brand on the shelves and in the back." title={`Start a count · ${store.name}`}>
        <ActionForm action={startStockCount} className="flex flex-wrap items-end gap-3" submitLabel="Start count">
          <input name="storeId" type="hidden" value={store.id} />
          <div className="min-w-56 flex-1">
            <Field label="Brand">
              <select className={inputClass} name="brand" required>
                {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Name (optional)"><input className={inputClass} name="title" placeholder="Mufti, week 41" /></Field>
        </ActionForm>
      </Panel>

      <Panel title="Counts">
        {counts.length ? (
          <ul className="space-y-2">
            {counts.map((count) => (
              <li key={count.id}>
                <Link className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3 text-sm transition hover:border-primary" href={`/app/stock-counts/${count.id}`}>
                  <span><span className="font-semibold">{count.title}</span> · started {shortDate(count.created_at.slice(0, 10))} by {count.profiles?.full_name ?? "—"}</span>
                  <Badge tone={statusLabel[count.status]?.tone ?? "muted"}>{statusLabel[count.status]?.label ?? count.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>No counts yet.</Empty>}
      </Panel>
    </div>
  );
}
