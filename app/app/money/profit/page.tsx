import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { MoneyHeader, MoneyNav } from "@/components/money/money-nav";
import { indiaToday, labelFor, money } from "@/lib/accounts/format";
import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { endMonthlyCost, saveEstimatedMargin, saveMonthlyCost } from "@/lib/money/actions";
import { expenseCategories, monthLabel, monthStart } from "@/lib/money/format";
import { listMonthlyCosts, storeProfit } from "@/lib/money/queries";

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string }> }) {
  const owner = await requireOwner();
  if (!owner) return <AccessDenied message="Store profit is visible to the owner only." />;
  const stores = await getAccessibleStores(owner.profile);
  const params = await searchParams;
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  if (!store) return <AccessDenied message="No active store." />;
  const today = indiaToday();
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? `${params.month}-01` : monthStart(today);
  const [profit, costs] = await Promise.all([storeProfit(store.id, month), listMonthlyCosts(store.id)]);
  const pct = (part: number) => (profit.net_sales ? `${((part / profit.net_sales) * 100).toFixed(1)}%` : "—");
  const costCoverage = profit.net_sales ? Math.round((profit.cost_known_sales / profit.net_sales) * 100) : 0;
  const warnings = [
    profit.sales_days < profit.days_elapsed ? `Sales reports cover ${profit.sales_days} of ${profit.days_elapsed} days so far.` : null,
    profit.cost_unknown_sales > 0 && profit.estimated_margin_pct === null ? `${money(profit.cost_unknown_sales)} of sales has no known purchase cost. Set an estimated margin below to include it.` : null,
    profit.cost_unknown_sales > 0 && profit.estimated_margin_pct !== null ? `Cost of ${money(profit.cost_unknown_sales)} of sales is estimated at a ${profit.estimated_margin_pct}% margin.` : null,
    profit.taxable_estimated_sales > 0 ? `GST on ${money(profit.taxable_estimated_sales)} of sales is estimated (5% up to ₹2,625 a piece, else 18%) because the report had no tax columns.` : null,
    profit.salary_people === 0 ? "No payslip upload for this month yet, so salaries are not included." : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <MoneyHeader
        description="What the store earned in the month: sales without GST, less the cost of what was sold, salaries, expenses and fixed costs. Built from the uploads; every estimate is marked."
        title="Store profit"
      />
      <MoneyNav active="/app/money/profit" extra={{ month: month.slice(0, 7) }} isOwner storeId={store.id} stores={stores} />

      <Panel
        action={
          <form className="flex items-end gap-2" method="get">
            <input name="store" type="hidden" value={store.id} />
            <Field label="Month"><input className={inputClass} defaultValue={month.slice(0, 7)} max={today.slice(0, 7)} name="month" type="month" /></Field>
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
          </form>
        }
        title={`${store.name} · ${monthLabel(month)}`}
      >
        {warnings.length ? <div className="mb-4 space-y-2">{warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}</div> : null}
        <dl className="space-y-1 text-sm">
          <Line label="Sales (with GST)" value={money(profit.sales_incl_gst)} />
          <Line label="GST collected" muted value={`− ${money(profit.gst)}`} />
          <Line bold label="Net sales" value={money(profit.net_sales)} />
          <Line label={`Cost of goods sold, known (${costCoverage}% of sales)`} muted value={`− ${money(profit.cost_known)}`} />
          {profit.cost_estimated !== null && profit.cost_unknown_sales > 0 ? <Line label={`Cost of goods sold, estimated (${profit.estimated_margin_pct}% margin)`} muted value={`− ${money(profit.cost_estimated)}`} /> : null}
          <Line bold label={`Gross profit${profit.gross_profit_complete ? "" : " (incomplete)"}`} note={pct(profit.gross_profit)} value={money(profit.gross_profit)} />
          <Line label={`Salaries (${profit.salary_people} people${profit.salary_file ? ` · ${profit.salary_file}` : ""})`} muted value={`− ${money(profit.salaries)}`} />
          {profit.expenses.map((item) => <Line key={item.category} label={labelFor(expenseCategories, item.category)} muted value={`− ${money(item.amount)}`} />)}
          {profit.fixed_costs.map((item) => <Line key={item.id} label={`${item.name} (fixed)`} muted value={`− ${money(item.amount)}`} />)}
          <Line bold label="Net profit" note={pct(profit.net_profit)} tone={profit.net_profit < 0 ? "bad" : "good"} value={money(profit.net_profit)} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted">Known cost comes from purchase batches in Accounts, else the stock report&apos;s basic rate for the same lot code. Salaries add back advances (deducted on payslips but still salary). Check the payslip file name is the right month.</p>
      </Panel>

      <Panel description="Used only for sold items with no known purchase cost (for example Brand Mark, whose stock report has no purchase rate)." title="Estimated margin">
        <ActionForm action={saveEstimatedMargin} className="flex flex-wrap items-end gap-3" submitLabel="Save margin" variant="secondary">
          <input name="storeId" type="hidden" value={store.id} />
          <Field label="Gross margin on sales without GST (%)"><input className={inputClass} defaultValue={store.estimated_margin_pct ?? ""} inputMode="decimal" name="margin" placeholder="e.g. 35" /></Field>
        </ActionForm>
      </Panel>

      <Panel description="Rent, electricity, internet: costs that repeat every month. Do not also enter them as expenses, or they count twice." title="Fixed monthly costs">
        {costs.length ? (
          <ul className="mb-4 space-y-2 text-sm">
            {costs.map((cost) => (
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-3" key={cost.id}>
                <span><span className="font-semibold">{cost.name}</span> · {money(cost.amount)} a month · from {monthLabel(cost.valid_from)}{cost.valid_to ? ` to ${monthLabel(cost.valid_to)}` : ""}</span>
                {cost.valid_to ? null : (
                  <ActionForm action={endMonthlyCost} className="flex flex-wrap items-end gap-2" submitLabel="End" variant="secondary">
                    <input name="costId" type="hidden" value={cost.id} />
                    <input className={`${inputClass} max-w-44`} defaultValue={today.slice(0, 7)} name="validTo" type="month" />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : <div className="mb-4"><Empty>None yet.</Empty></div>}
        <ActionForm action={saveMonthlyCost} className="flex flex-wrap items-end gap-3" submitLabel="Add fixed cost">
          <input name="storeId" type="hidden" value={store.id} />
          <div className="min-w-40 flex-1"><Field label="Name"><input className={inputClass} name="name" placeholder="Rent" required /></Field></div>
          <Field label="Monthly amount (₹)"><input className={inputClass} inputMode="decimal" name="amount" required /></Field>
          <Field label="From month"><input className={inputClass} defaultValue={month.slice(0, 7)} name="validFrom" required type="month" /></Field>
        </ActionForm>
      </Panel>
    </div>
  );
}

function Line({ bold, label, muted, note, tone, value }: { bold?: boolean; label: string; muted?: boolean; note?: string; tone?: "good" | "bad"; value: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 ${bold ? "font-semibold" : ""}`}>
      <dt className={muted ? "text-muted" : undefined}>{label}</dt>
      <dd className={tone === "bad" ? "text-danger" : tone === "good" ? "text-success" : undefined}>
        {value}{note ? <span className="ml-2 text-xs font-normal text-muted">{note}</span> : null}
      </dd>
    </div>
  );
}
