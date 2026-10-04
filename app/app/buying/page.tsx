import { AccessDenied } from "@/components/app/access-denied";
import { Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { BuyingHeader, BuyingNav, pickStore } from "@/components/buying/buying-nav";
import { money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { brandSellThrough, refreshStockPositions } from "@/lib/buying/queries";

export default async function SellThroughPage({ searchParams }: { searchParams: Promise<{ store?: string; days?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Buying tools are for the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  const params = await searchParams;
  const store = pickStore(stores, params.store);
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const days = [30, 60, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  await refreshStockPositions([store.id]);
  const rows = await brandSellThrough(store.id, days);
  const snapshot = rows.find((row) => row.snapshot_date)?.snapshot_date ?? null;
  const totals = rows.reduce((sum, row) => ({ sold: sum.sold + Number(row.sold_units), stock: sum.stock + Number(row.on_hand), value: sum.value + Number(row.on_hand_mrp) }), { sold: 0, stock: 0, value: 0 });

  return (
    <div className="space-y-5">
      <BuyingHeader
        description="Which brands sell and which sit. Sell-through = units sold ÷ (sold + still in stock). Days of cover = how long today's stock lasts at this selling speed."
        title="Sell-through by brand"
      />
      <BuyingNav active="/app/buying" isOwner={profile.role === "owner"} storeId={store.id} stores={stores} />
      {snapshot ? (
        <Notice tone="info">Stock from the report of {shortDate(snapshot)}, less units sold since then. Upload stock weekly to keep this accurate.</Notice>
      ) : <Notice>No stock report for {store.name} yet: upload one under Reports → Stock.</Notice>}

      <Panel
        action={
          <form className="flex items-end gap-2" method="get">
            <input name="store" type="hidden" value={store.id} />
            <Field label="Sales in the last">
              <select className={inputClass} defaultValue={String(days)} name="days">
                <option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option>
              </select>
            </Field>
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
          </form>
        }
        description={`${totals.sold} units sold in ${days} days · ${totals.stock} in stock worth ${money(totals.value)} at MRP.`}
        title={store.name}
      >
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2">Brand</th><th className="text-right">Sold</th><th className="text-right">Sales</th><th className="text-right">In stock</th><th className="text-right">Stock at MRP</th><th className="text-right">Sell-through</th><th className="text-right">Days of cover</th><th className="text-right">No sale 90 days</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pct = row.sell_through_pct === null ? null : Number(row.sell_through_pct);
                  const cover = row.days_cover === null ? null : Number(row.days_cover);
                  return (
                    <tr className="border-t border-border/60" key={row.brand}>
                      <td className="py-2 font-medium">{row.brand}</td>
                      <td className="text-right">{Number(row.sold_units)}</td>
                      <td className="text-right">{money(row.net_sales)}</td>
                      <td className="text-right">{Number(row.on_hand)}</td>
                      <td className="text-right">{money(row.on_hand_mrp)}</td>
                      <td className={`text-right font-semibold ${pct === null ? "" : pct >= 40 ? "text-success" : pct < 15 ? "text-danger" : ""}`}>{pct === null ? "—" : `${pct}%`}</td>
                      <td className={`text-right ${cover !== null && cover > 180 ? "text-danger" : cover !== null && cover < 15 ? "text-accent-ink" : ""}`}>{cover === null ? (Number(row.on_hand) > 0 ? "No sales" : "—") : cover}</td>
                      <td className="text-right">{Number(row.no_sale_90_units) || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>No sales or stock yet.</Empty>}
        <p className="mt-3 text-xs leading-5 text-muted">Green: selling well (40%+). Red: slow (under 15%) or more than 180 days of stock. Amber cover: under 15 days, check Reorder.</p>
      </Panel>
    </div>
  );
}
