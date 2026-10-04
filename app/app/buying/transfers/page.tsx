import { AccessDenied } from "@/components/app/access-denied";
import { Empty, Panel } from "@/components/accounts/fields";
import { BuyingHeader, BuyingNav } from "@/components/buying/buying-nav";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { refreshAllStockPositions, transferSuggestions } from "@/lib/buying/queries";

export default async function TransfersPage() {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Buying tools are for the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  await refreshAllStockPositions();
  const rows = await transferSuggestions();
  const routes = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.from_store} → ${row.to_store}`;
    routes.set(key, [...(routes.get(key) ?? []), row]);
  }

  return (
    <div className="space-y-5">
      <BuyingHeader
        description="Stock one store has not sold for 60 days, while another store sold the same item and size in the last 30 days and has none left. Move it instead of reordering or marking it down."
        title="Transfers between stores"
      />
      <BuyingNav active="/app/buying/transfers" isOwner={profile.role === "owner"} stores={stores} />
      {routes.size ? [...routes.entries()].map(([route, items]) => (
        <Panel description={`${items.length} item-size${items.length === 1 ? "" : "s"} · ${items.reduce((sum, item) => sum + Number(item.qty), 0)} pieces`} key={route} title={route}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-1">Brand</th><th>Item</th><th>Size</th><th className="text-right">Idle at sender</th><th className="text-right">Sold at receiver (30 days)</th><th className="text-right">Move</th></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr className="border-t border-border/60" key={`${item.brand}|${item.item_name}|${item.size}`}>
                    <td className="py-1.5">{item.brand}</td>
                    <td>{item.item_name}</td>
                    <td>{item.size ?? "—"}</td>
                    <td className="text-right">{Number(item.from_on_hand)}</td>
                    <td className="text-right">{Number(item.to_sold_30)}</td>
                    <td className="text-right font-semibold">{Number(item.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Record the movement in Logic as a branch transfer so both stores&apos; stock stays right.</p>
        </Panel>
      )) : <Panel title="No transfers suggested"><Empty>No idle stock at one store that the other store is selling.</Empty></Panel>}
    </div>
  );
}
