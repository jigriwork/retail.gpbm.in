import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, shortDate } from "@/lib/accounts/format";
import { monthRange } from "@/lib/accounts/ledger-queries";
import { listAllBrands, listAllParties, listFinanceStores } from "@/lib/accounts/queries";
import { attributeBrand, attributeManually, createOpeningStock, runAttribution } from "@/lib/accounts/stock-actions";
import { attributionSummary, findBatches, openingSources, unattributedByBrand, unresolvedLines } from "@/lib/accounts/stock-queries";

export default async function StockAttributionPage({ searchParams }: { searchParams: Promise<{ store?: string; month?: string; q?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Stock attribution is visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const stores = (await listFinanceStores()).filter((store) => store.is_active);
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  const { from, month, to } = monthRange(params.month);
  const [summary, unresolved, unattributed, sources, parties, brands, batches] = store ? await Promise.all([
    attributionSummary(store.id, from, to), unresolvedLines(store.id, from, to), unattributedByBrand(), openingSources(),
    listAllParties(), listAllBrands(), params.q ? findBatches({ search: params.q, storeId: store.id }) : Promise.resolve([]),
  ]) : [[], [], [], { anyOpening: false, reports: [] }, [], [], []];
  const partyName = new Map(parties.map((party) => [party.id, party.legal_name]));
  const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
  const pieces = (method: string) => summary.filter((row) => row.method === method).reduce((sum, row) => sum + Number(row.qty), 0);

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/stock" session={session} />
      <AccountsHeader
        description="Which supplier each sold piece came from. Sales are matched to purchase batches by Logic lot code, then by barcode oldest-first. Anything that cannot be matched stays visible and blocks final settlements; nothing is assumed to come from today's distributor."
        title="Stock attribution"
      />
      <Panel title="Store and month">
        <form className="flex flex-wrap gap-2">
          <select className={`${inputClass} max-w-56`} defaultValue={store?.id} name="store">{stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input className={`${inputClass} max-w-40`} defaultValue={month} name="month" type="month" />
          <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
        </form>
      </Panel>
      {store ? (
        <>
          <Panel title={`${store.name} · ${month}`}>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-border bg-background p-3"><p className="text-xs font-semibold uppercase text-muted">Attributed</p><p className="mt-1 text-lg font-semibold">{pieces("attributed")} pcs</p></div>
              <div className="rounded-2xl border border-border bg-background p-3"><p className="text-xs font-semibold uppercase text-muted">Opening stock not yet mapped</p><p className="mt-1 text-lg font-semibold">{pieces("unattributed")} pcs</p></div>
              <div className="rounded-2xl border border-border bg-background p-3"><p className="text-xs font-semibold uppercase text-muted">Attribution to resolve</p><p className="mt-1 text-lg font-semibold">{pieces("unresolved")} pcs</p></div>
            </div>
            {summary.filter((row) => row.method === "attributed").length ? (
              <ul className="mt-3 divide-y divide-border text-sm">
                {summary.filter((row) => row.method === "attributed").map((row, index) => (
                  <li className="flex justify-between py-1.5" key={index}><span>{partyName.get(row.party_id ?? "") ?? "Supplier"} · {brandName.get(row.brand_id ?? "") ?? "brand not set"}</span><span>{Number(row.qty)} pcs</span></li>
                ))}
              </ul>
            ) : null}
            {session.can.post ? (
              <ActionForm action={runAttribution} className="mt-4 flex flex-wrap items-end gap-3" submitLabel="Attribute this month's sales">
                <input name="storeId" type="hidden" value={store.id} />
                <input name="from" type="hidden" value={from} />
                <input name="to" type="hidden" value={to < indiaToday() ? to : indiaToday()} />
              </ActionForm>
            ) : null}
          </Panel>

          <Panel description="Sold pieces whose purchase batch could not be found. Pick the batch by hand with a reason, or add the missing purchase / opening stock and attribute again." title={`Attribution to resolve (${unresolved.length})`}>
            {unresolved.length ? (
              <div className="space-y-2">
                <form className="flex gap-2">
                  <input name="store" type="hidden" value={store.id} /><input name="month" type="hidden" value={month} />
                  <input className={inputClass} defaultValue={params.q ?? ""} name="q" placeholder="Find a batch by lot code, barcode or article" />
                  <button className="h-11 shrink-0 rounded-xl border border-border px-4 text-sm font-semibold">Find</button>
                </form>
                {unresolved.map((line) => (
                  <div className="rounded-xl border border-border bg-background p-3 text-sm" key={line.id}>
                    <p><strong>{line.sales_rows?.item_name}</strong> · {line.sales_rows?.bill_no} · {shortDate(line.sale_date)} · {Number(line.qty)} pcs · lot {line.sales_rows?.lot_code ?? "—"} · {line.sales_rows?.brand ?? ""}</p>
                    <p className="text-xs text-muted">{line.note}</p>
                    {session.can.post && batches.length ? (
                      <ActionForm action={attributeManually} className="mt-2 flex flex-wrap items-end gap-2" submitLabel="Use this batch" variant="secondary">
                        <input name="allocationId" type="hidden" value={line.id} />
                        <select className={`${inputClass} h-9 max-w-md`} name="batchId">{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.lot_code ?? batch.barcode ?? "batch"} · {batch.parties?.legal_name ?? "unattributed"} · {batch.remaining} left</option>)}</select>
                        <input className={`${inputClass} h-9 max-w-64`} name="note" placeholder="Why this batch" required />
                      </ActionForm>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : <Empty>Nothing to resolve for this month (or attribution has not been run yet).</Empty>}
          </Panel>
        </>
      ) : null}

      <Panel description="Stock bought before purchases were recorded here. Created once from a stock report; each lot keeps its Logic purchase rate as given." title="Opening stock">
        {sources.anyOpening ? <Notice tone="info">Opening stock already exists. Add it again only for a store that has none.</Notice> : null}
        {session.can.post && sources.reports.length ? (
          <ActionForm action={createOpeningStock} className="mt-3 flex flex-wrap items-end gap-3" submitLabel="Create opening stock" variant="secondary">
            <Field label="Stock report">
              <select className={inputClass} name="reportId">{sources.reports.map((report) => <option key={report.id} value={report.id}>{report.stores?.name} · {report.period_month?.slice(0, 7)} · {report.file_name}</option>)}</select>
            </Field>
            <Field hint="The day the stock was counted" label="Stock date"><input className={inputClass} name="asOf" required type="date" /></Field>
          </ActionForm>
        ) : null}
        {unattributed.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Not yet mapped to a supplier</p>
            {unattributed.map((group) => (
              <div className="rounded-xl border border-border bg-background p-3 text-sm" key={`${group.storeId}:${group.brandId}`}>
                <p><strong>{group.brandName}</strong> · {group.storeName} · {group.lots} lots · {group.pieces} pcs</p>
                {session.can.post ? (
                  <ActionForm action={attributeBrand} className="mt-2 flex flex-wrap items-end gap-2" submitLabel="Map to supplier" variant="secondary">
                    <input name="storeId" type="hidden" value={group.storeId} />
                    <input name="brandId" type="hidden" value={group.brandId ?? ""} />
                    <select className={`${inputClass} h-9 max-w-xs`} name="partyId" required><option value="">Supplier…</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.legal_name}</option>)}</select>
                    <input className={`${inputClass} h-9 max-w-sm`} name="note" placeholder="Based on (e.g. only distributor before Sept 2026)" required />
                  </ActionForm>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
      <p className="text-xs text-muted">Values shown use the cost recorded on each batch: invoice taxable value for purchases, Logic PURCHASE RATE for opening stock (as given), never a later month&apos;s rate.<Link className="underline" href="/app/accounts/returns">Supplier returns →</Link></p>
    </div>
  );
}
