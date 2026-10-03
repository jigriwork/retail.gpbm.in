import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { listAllParties, listFirms, listFinanceStores } from "@/lib/accounts/queries";
import { createReturn } from "@/lib/accounts/stock-actions";
import { findBatches, listReturns } from "@/lib/accounts/stock-queries";

const tone = (status: string) => (status === "closed" || status === "credited" ? "good" : status === "cancelled" ? "muted" : "warn") as "good" | "muted" | "warn";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ firm?: string; store?: string; party?: string; q?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Stock returns are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const [returns, firms, stores, parties] = await Promise.all([listReturns(), listFirms(), listFinanceStores(), listAllParties()]);
  const firm = firms.find((item) => item.id === params.firm);
  const store = stores.find((item) => item.id === params.store);
  const party = parties.find((item) => item.id === params.party);
  const batches = firm && store && party ? await findBatches({ partyId: party.id, search: params.q, storeId: store.id, limit: 80 }) : [];

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/returns" session={session} />
      <AccountsHeader
        description="Stock sent back to suppliers. Sending it reduces stock and shows “Return credit pending”; the ledger is reduced only by a posted debit note (on acknowledgement, if agreed) or the supplier's credit note, never both."
        title="Stock returns"
      />
      {session.can.post ? (
        <Panel title="New return">
          <form className="flex flex-wrap gap-2">
            <select className={`${inputClass} max-w-48`} defaultValue={firm?.id ?? ""} name="firm" required><option value="">Firm…</option>{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className={`${inputClass} max-w-48`} defaultValue={store?.id ?? ""} name="store" required><option value="">Store…</option>{stores.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className={`${inputClass} max-w-72`} defaultValue={party?.id ?? ""} name="party" required><option value="">Supplier…</option>{parties.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</select>
            <input className={`${inputClass} max-w-56`} defaultValue={params.q ?? ""} name="q" placeholder="Lot, barcode or article" />
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show stock</button>
          </form>
          {firm && store && party ? (
            <ActionForm action={createReturn} className="mt-4 space-y-4" submitLabel="Create return request">
              <input name="firmId" type="hidden" value={firm.id} />
              <input name="storeId" type="hidden" value={store.id} />
              <input name="partyId" type="hidden" value={party.id} />
              {batches.length ? (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {batches.filter((batch) => batch.remaining > 0).map((batch) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" key={batch.id}>
                      <span>{batch.lot_code ?? batch.barcode ?? "batch"} · {batch.article ?? batch.description ?? ""} {batch.size ?? ""} · {batch.remaining} left · {batch.unit_cost !== null ? money(batch.unit_cost) : "cost unknown"}/pc</span>
                      <input aria-label="Quantity to return" className={`${inputClass} h-9 w-24`} inputMode="decimal" name={`qty_${batch.id}`} placeholder="Qty" />
                    </div>
                  ))}
                </div>
              ) : <Empty>No stock of this supplier found in this store{params.q ? " for that search" : ""}. You can still add an item by hand below.</Empty>}
              <details className="rounded-xl border border-dashed border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold text-primary">Add an item not in the list</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-5">
                  <Field label="Lot"><input className={inputClass} name="manualLot" /></Field>
                  <Field label="Barcode"><input className={inputClass} name="manualBarcode" /></Field>
                  <Field label="Article"><input className={inputClass} name="manualArticle" /></Field>
                  <Field label="Qty"><input className={inputClass} inputMode="decimal" name="manualQty" /></Field>
                  <Field label="Value per piece"><input className={inputClass} inputMode="decimal" name="manualValue" /></Field>
                </div>
              </details>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Request date"><input className={inputClass} defaultValue={indiaToday()} name="date" type="date" /></Field>
                <Field hint="From the supplier terms" label="Ledger is reduced">
                  <select className={inputClass} name="deductOn">
                    <option value="acknowledgement">When the supplier accepts the goods (we post a debit note)</option>
                    <option value="credit_note">Only when the supplier&apos;s credit note arrives</option>
                  </select>
                </Field>
                <Field label="Reason / notes"><input className={inputClass} name="notes" /></Field>
              </div>
            </ActionForm>
          ) : null}
        </Panel>
      ) : null}
      <Panel title="Returns">
        {returns.length ? (
          <div className="divide-y divide-border">
            {returns.map((item) => (
              <Link className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" href={`/app/accounts/returns/${item.id}`} key={item.id}>
                <span><strong>{item.return_no}</strong> · {item.parties?.legal_name} · {item.stores?.name} · {item.billing_firms?.name}<span className="block text-xs text-muted">requested {shortDate(item.request_date)}{item.dispatch_date ? ` · sent ${shortDate(item.dispatch_date)}` : ""}</span></span>
                <span className="flex items-center gap-2">{money(item.accepted_value ?? item.expected_credit)}<Badge tone={tone(item.status)}>{item.status}</Badge></span>
              </Link>
            ))}
          </div>
        ) : <Empty>No returns yet.</Empty>}
      </Panel>
    </div>
  );
}
