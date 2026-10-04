import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { BuyingHeader, BuyingNav } from "@/components/buying/buying-nav";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { deleteBudget, saveBudget } from "@/lib/buying/actions";
import { budgetStatus, listBrandsForBudget } from "@/lib/buying/queries";

export default async function BudgetsPage() {
  const owner = await requireOwner();
  if (!owner) return <AccessDenied message="Buying budgets are set by the owner." />;
  const [budgets, brands, stores] = await Promise.all([budgetStatus(), listBrandsForBudget(), getAccessibleStores(owner.profile)]);
  const today = indiaToday();

  return (
    <div className="space-y-5">
      <BuyingHeader
        description="How much to buy of each brand in a season (purchase value without GST), against purchases posted in Accounts. Stops over-buying before the season starts."
        title="Buying budgets"
      />
      <BuyingNav active="/app/buying/budgets" isOwner />
      {brands.length ? null : <Notice>Add brands under <Link className="font-semibold underline" href="/app/accounts/brands">Accounts → Brands</Link> first; budgets are set per brand.</Notice>}
      <Notice tone="info">“Purchased” counts purchase invoices posted in Accounts for that brand. Until purchases are entered there, it stays at zero.</Notice>

      {brands.length ? (
        <Panel title="Set a budget">
          <ActionForm action={saveBudget} className="grid gap-4 sm:grid-cols-3" submitLabel="Save budget">
            <Field label="Brand">
              <select className={inputClass} name="brandId" required>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </Field>
            <Field label="Store">
              <select className={inputClass} name="storeId">
                <option value="">All stores</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </Field>
            <Field label="Season"><input className={inputClass} name="season" placeholder="AW26" required /></Field>
            <Field label="From"><input className={inputClass} defaultValue={today} name="startsOn" required type="date" /></Field>
            <Field label="To"><input className={inputClass} name="endsOn" required type="date" /></Field>
            <Field label="Budget (₹, without GST)"><input className={inputClass} inputMode="decimal" name="amount" required /></Field>
          </ActionForm>
        </Panel>
      ) : null}

      <Panel title={`${budgets.length} budget${budgets.length === 1 ? "" : "s"}`}>
        {budgets.length ? (
          <div className="space-y-2">
            {budgets.map((budget) => {
              const used = Number(budget.used_pct);
              return (
                <div className="rounded-2xl border border-border bg-background p-3 text-sm" key={budget.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{budget.brand} · {budget.season} · {budget.store_name ?? "All stores"}</span>
                    <Badge tone={used > 100 ? "bad" : used > 85 ? "warn" : "good"}>{used}% used</Badge>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                    <div className={`h-full ${used > 100 ? "bg-danger" : used > 85 ? "bg-accent" : "bg-success"}`} style={{ width: `${Math.min(used, 100)}%` }} />
                  </div>
                  <p className="mt-2 text-muted">
                    {shortDate(budget.starts_on)} → {shortDate(budget.ends_on)} · budget {money(budget.budget_amount)} · purchased {money(budget.purchased)} · left {money(budget.remaining)} · sold {Number(budget.sold_units)} pcs ({money(budget.net_sales)})
                  </p>
                  <ActionForm action={deleteBudget} className="mt-2 flex" submitLabel="Remove" variant="secondary">
                    <input name="budgetId" type="hidden" value={budget.id} />
                  </ActionForm>
                </div>
              );
            })}
          </div>
        ) : <Empty>No budgets yet.</Empty>}
      </Panel>
    </div>
  );
}
