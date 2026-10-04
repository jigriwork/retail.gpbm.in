import { AccessDenied } from "@/components/app/access-denied";
import { Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { BuyingHeader, BuyingNav, pickStore } from "@/components/buying/buying-nav";
import { shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { refreshAllStockPositions, reorderSuggestions } from "@/lib/buying/queries";

export default async function ReorderPage({ searchParams }: { searchParams: Promise<{ store?: string; days?: string; cover?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Buying tools are for the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  const params = await searchParams;
  const store = pickStore(stores, params.store);
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const days = [14, 30, 60].includes(Number(params.days)) ? Number(params.days) : 30;
  const cover = [15, 30, 45, 60].includes(Number(params.cover)) ? Number(params.cover) : 30;
  // Other stores' positions too, so a transfer can be suggested before buying.
  await refreshAllStockPositions();
  const rows = await reorderSuggestions(store.id, days, cover);
  const byBrand = new Map<string, typeof rows>();
  for (const row of rows) byBrand.set(row.brand, [...(byBrand.get(row.brand) ?? []), row]);

  return (
    <div className="space-y-5">
      <BuyingHeader
        description="Items that sold at least twice and will run out before the cover period ends. Suggested quantity = sales speed × cover days − stock in hand. Check other stores first: a transfer is cheaper than a new order."
        title="Reorder by size"
      />
      <BuyingNav active="/app/buying/reorder" isOwner={profile.role === "owner"} storeId={store.id} stores={stores} />
      <Panel
        action={
          <form className="flex flex-wrap items-end gap-2" method="get">
            <input name="store" type="hidden" value={store.id} />
            <Field label="Sales in the last">
              <select className={inputClass} defaultValue={String(days)} name="days"><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select>
            </Field>
            <Field label="Stock to cover">
              <select className={inputClass} defaultValue={String(cover)} name="cover"><option value="15">15 days</option><option value="30">30 days</option><option value="45">45 days</option><option value="60">60 days</option></select>
            </Field>
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
          </form>
        }
        description={`${rows.length} item-size${rows.length === 1 ? "" : "s"} to reorder, by brand.`}
        title={store.name}
      >
        {rows.length ? (
          <div className="space-y-3">
            {[...byBrand.entries()].map(([brand, items]) => (
              <details className="rounded-2xl border border-border bg-background p-4" key={brand} open={byBrand.size <= 3}>
                <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                  <span className="font-semibold">{brand}</span>
                  <span className="text-sm text-muted">{items.length} sizes · order {items.reduce((sum, item) => sum + Number(item.suggest_qty), 0)} pcs</span>
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted">
                      <tr><th className="py-1">Item</th><th>Size</th><th className="text-right">Sold</th><th className="text-right">In stock</th><th className="text-right">Order</th><th className="pl-3">Other stores</th><th>Last sold</th></tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr className="border-t border-border/60" key={`${item.item_name}|${item.size}`}>
                          <td className="py-1.5">{item.item_name}</td>
                          <td>{item.size ?? "—"}</td>
                          <td className="text-right">{Number(item.sold)}</td>
                          <td className="text-right">{Number(item.on_hand)}</td>
                          <td className="text-right font-semibold">{Number(item.suggest_qty)}</td>
                          <td className="pl-3 text-muted">{Number(item.other_store_on_hand) > 0 ? `${Number(item.other_store_on_hand)} at ${item.other_store_names}` : "—"}</td>
                          <td className="text-muted">{shortDate(item.last_sale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        ) : <Empty>Nothing to reorder: every item that sells has enough stock for {cover} days.</Empty>}
      </Panel>
    </div>
  );
}
