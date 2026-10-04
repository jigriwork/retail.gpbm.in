import { AccessDenied } from "@/components/app/access-denied";
import { Badge, Empty, Notice, Panel } from "@/components/accounts/fields";
import { BuyingHeader, BuyingNav, pickStore } from "@/components/buying/buying-nav";
import { money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { markdownCandidates, refreshStockPositions } from "@/lib/buying/queries";

export default async function MarkdownPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Buying tools are for the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  const store = pickStore(stores, (await searchParams).store);
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  await refreshStockPositions([store.id]);
  const rows = await markdownCandidates(store.id);
  const tiers = [40, 30, 20].map((pct) => ({ pct, items: rows.filter((row) => row.suggested_pct === pct) })).filter((tier) => tier.items.length);
  const value = rows.reduce((sum, row) => sum + Number(row.value_mrp), 0);

  return (
    <div className="space-y-5">
      <BuyingHeader
        description="Stock that has not sold for 90 days or more: candidates for the end-of-season sale. Suggested discount: 20% after 90 days without a sale, 30% after 180, 40% after a year. Adjust to the brand's terms; some brands fund their own markdowns."
        title="Markdown list"
      />
      <BuyingNav active="/app/buying/markdown" isOwner={profile.role === "owner"} storeId={store.id} stores={stores} />
      <Notice tone="info">Stock files have no purchase date, so age is counted from the last sale (sales history starts April 2026). Items first seen in stock less than 60 days ago are left out.</Notice>
      {tiers.length ? tiers.map((tier) => (
        <Panel description={`${tier.items.length} item-size${tier.items.length === 1 ? "" : "s"} · ${tier.items.reduce((sum, item) => sum + Number(item.on_hand), 0)} pieces · ${money(tier.items.reduce((sum, item) => sum + Number(item.value_mrp), 0))} at MRP`} key={tier.pct} title={`Suggested ${tier.pct}% off`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-1">Brand</th><th>Item</th><th>Size</th><th className="text-right">MRP</th><th className="text-right">Pieces</th><th className="text-right">At MRP</th><th className="pl-3">Last sold</th><th>In stock since</th></tr>
              </thead>
              <tbody>
                {tier.items.slice(0, 300).map((item) => (
                  <tr className="border-t border-border/60" key={`${item.brand}|${item.item_name}|${item.size}|${item.mrp}`}>
                    <td className="py-1.5">{item.brand}</td>
                    <td>{item.item_name}</td>
                    <td>{item.size ?? "—"}</td>
                    <td className="text-right">{money(item.mrp)}</td>
                    <td className="text-right">{Number(item.on_hand)}</td>
                    <td className="text-right">{money(item.value_mrp)}</td>
                    <td className="pl-3">{item.last_sale ? shortDate(item.last_sale) : <Badge>Not since April</Badge>}</td>
                    <td className="text-muted">{item.first_seen ? `at least ${shortDate(item.first_seen)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tier.items.length > 300 ? <p className="mt-2 text-xs text-muted">Showing the oldest 300.</p> : null}
          </div>
        </Panel>
      )) : <Panel title={store.name}><Empty>No stock without a sale for 90 days.</Empty></Panel>}
      {rows.length ? <p className="text-sm text-muted">{store.name}: {money(value)} of stock at MRP has not sold for 90+ days.</p> : null}
    </div>
  );
}
