import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { indiaToday, money } from "@/lib/accounts/format";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { endScheme, saveScheme, saveTarget } from "@/lib/incentives/actions";
import { slabsText, type Slab } from "@/lib/incentives/calc";
import { listSchemes, staffIncentives } from "@/lib/incentives/queries";
import { monthLabel, monthStart } from "@/lib/money/format";

const basisLabel = { sales_amount: "Monthly net sale (₹)", target_pct: "% of the salesperson's target" } as Record<string, string>;

export default async function IncentivesPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="Incentives are for the owner and store managers." />;
  const stores = await getAccessibleStores(profile);
  const params = await searchParams;
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const isOwner = profile.role === "owner";
  const today = indiaToday();
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? `${params.month}-01` : monthStart(today);
  const [{ rows, scheme, unassignedSale }, schemes] = await Promise.all([staffIncentives(store.id, month), isOwner ? listSchemes() : Promise.resolve([])]);
  const totals = rows.reduce((sum, row) => ({ sale: sum.sale + row.netSale, bills: sum.bills + row.bills, items: sum.items + row.items, incentive: sum.incentive + row.incentive }), { sale: 0, bills: 0, items: 0, incentive: 0 });
  const monthParam = month.slice(0, 7);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Reports</p>
        <h1 className="mt-2 text-3xl font-semibold">Staff incentives</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Each salesperson&apos;s month from the daily bills: sales, bills, average bill, items per bill, target and incentive. Staff names are matched as on the Staff Sales page.</p>
      </section>

      <nav aria-label="Store" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {stores.map((item) => (
          <Link aria-current={item.id === store.id ? "page" : undefined}
            className={item.id === store.id ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white" : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
            href={`/app/reports/incentives?store=${item.id}&month=${monthParam}`} key={item.id}>{item.name}</Link>
        ))}
      </nav>

      <Panel
        action={
          <div className="flex flex-wrap items-end gap-2">
            <form className="flex items-end gap-2" method="get">
              <input name="store" type="hidden" value={store.id} />
              <Field label="Month"><input className={inputClass} defaultValue={monthParam} max={today.slice(0, 7)} name="month" type="month" /></Field>
              <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
            </form>
            {isOwner ? <a className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold" href={`/app/reports/incentives/export?store=${store.id}&month=${monthParam}`}>Download for payroll</a> : null}
          </div>
        }
        description={scheme ? `Scheme “${scheme.name}”: slabs on ${basisLabel[scheme.basis].toLowerCase()} · ${slabsText(scheme.slabs as unknown as Slab[])}${scheme.min_bills ? ` · at least ${scheme.min_bills} bills` : ""}` : "No incentive scheme for this month yet."}
        title={`${store.name} · ${monthLabel(month)}`}
      >
        {unassignedSale ? <div className="mb-3"><Notice>{money(unassignedSale)} of sales has no salesperson on the bill, so it counts for nobody. Fix names under Reports → Staff aliases.</Notice></div> : null}
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2">#</th><th>Salesperson</th><th className="text-right">Net sale</th><th className="text-right">Bills</th><th className="text-right">Avg bill</th><th className="text-right">Items/bill</th><th className="pl-4">Target</th><th className="text-right">Achieved</th><th className="text-right">Incentive</th></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr className="border-t border-border/60 align-top" key={row.staffName}>
                    <td className="py-2 text-muted">{index + 1}</td>
                    <td className="font-medium">{row.staffName}{row.next && row.next.gap > 0 ? <span className="block text-xs font-normal text-muted">{money(row.next.gap)} more for {row.next.rate}%</span> : null}</td>
                    <td className="text-right">{money(row.netSale)}</td>
                    <td className="text-right">{row.bills}</td>
                    <td className="text-right">{money(row.averageBill)}</td>
                    <td className={`text-right ${row.itemsPerBill < 1.5 ? "text-danger" : row.itemsPerBill >= 2.5 ? "text-success" : ""}`}>{row.itemsPerBill.toFixed(2)}</td>
                    <td className="pl-4">
                      <ActionForm action={saveTarget} className="flex items-center gap-2" submitLabel="Set" variant="secondary">
                        <input name="storeId" type="hidden" value={store.id} />
                        <input name="month" type="hidden" value={monthParam} />
                        <input name="staffName" type="hidden" value={row.staffName} />
                        <input className={`${inputClass} h-9 w-28`} defaultValue={row.target ?? ""} inputMode="decimal" name="target" placeholder="₹" />
                      </ActionForm>
                    </td>
                    <td className="text-right">{row.achievedPct === null ? "—" : <Badge tone={row.achievedPct >= 100 ? "good" : row.achievedPct >= 80 ? "warn" : "bad"}>{row.achievedPct.toFixed(0)}%</Badge>}</td>
                    <td className="text-right font-semibold">{money(row.incentive)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td /><td className="py-2">Store</td><td className="text-right">{money(totals.sale)}</td><td className="text-right">{totals.bills}</td>
                  <td className="text-right">{money(totals.bills ? totals.sale / totals.bills : 0)}</td><td className="text-right">{(totals.bills ? totals.items / totals.bills : 0).toFixed(2)}</td>
                  <td /><td /><td className="text-right">{money(totals.incentive)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <Empty>No staff sales in {monthLabel(month)}.</Empty>}
        <p className="mt-3 text-xs leading-5 text-muted">Items per bill under 1.5 is red: suggest a second item (socks, belt, innerwear) at the counter. 2.5+ is green. Incentives use net sale after returns.</p>
      </Panel>

      {isOwner ? (
        <Panel description="Slabs as from:rate pairs. Rate is % of the salesperson's whole net sale for the month. Example: 0:0, 100000:1, 200000:1.5 pays 1% from ₹1 lakh and 1.5% from ₹2 lakh. With a target basis, “from” is % of target: 80:0.5, 100:1." title="Incentive schemes">
          {schemes.length ? (
            <ul className="mb-4 space-y-2 text-sm">
              {schemes.map((item) => (
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-3" key={item.id}>
                  <span><span className="font-semibold">{item.name}</span> · {item.stores?.name ?? "All stores"} · {basisLabel[item.basis]} · {slabsText(item.slabs as unknown as Slab[])} · {item.payout === "marginal" ? "each slab on its part" : "whole sale"} · from {monthLabel(item.valid_from)}{item.valid_to ? ` to ${monthLabel(item.valid_to)}` : ""}</span>
                  {item.valid_to ? null : (
                    <ActionForm action={endScheme} className="flex items-end gap-2" submitLabel="End" variant="secondary">
                      <input name="schemeId" type="hidden" value={item.id} />
                      <input className={`${inputClass} max-w-44`} defaultValue={monthParam} name="validTo" type="month" />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <ActionForm action={saveScheme} className="grid gap-4 sm:grid-cols-3" submitLabel="Save scheme">
            <Field label="Name"><input className={inputClass} name="name" placeholder="Floor staff 2026" required /></Field>
            <Field label="Store">
              <select className={inputClass} name="storeId"><option value="">All stores</option>{stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </Field>
            <Field label="From month"><input className={inputClass} defaultValue={monthParam} name="validFrom" required type="month" /></Field>
            <Field label="Slabs based on">
              <select className={inputClass} name="basis"><option value="sales_amount">Monthly net sale (₹)</option><option value="target_pct">% of target</option></select>
            </Field>
            <Field label="Pay">
              <select className={inputClass} name="payout"><option value="whole">Highest slab on the whole sale</option><option value="marginal">Each slab on its own part</option></select>
            </Field>
            <Field label="Minimum bills in the month"><input className={inputClass} defaultValue="0" inputMode="numeric" name="minBills" /></Field>
            <div className="sm:col-span-3"><Field label="Slabs (from:rate)"><input className={inputClass} name="slabs" placeholder="0:0, 100000:1, 200000:1.5" required /></Field></div>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
