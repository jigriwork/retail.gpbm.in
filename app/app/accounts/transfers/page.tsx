import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { linkableDocuments } from "@/lib/accounts/ledger-queries";
import { listAllParties, listFinanceStores, listFirms } from "@/lib/accounts/queries";
import { recordDistributorTransfer, transferBetweenStores } from "@/lib/accounts/stock-actions";
import { findBatches, listTransfers } from "@/lib/accounts/stock-queries";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ firm?: string; from?: string; store?: string; q?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Transfers are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const [firms, parties, stores, transfers, documents] = await Promise.all([listFirms(), listAllParties(), listFinanceStores(), listTransfers(), linkableDocuments(null)]);
  const name = new Map(parties.map((party) => [party.id, party.legal_name]));
  const firm = firms.find((item) => item.id === params.firm);
  const fromParty = parties.find((item) => item.id === params.from);
  const fromStore = stores.find((item) => item.id === params.store);
  const [oldStock, storeStock] = await Promise.all([
    firm && fromParty ? findBatches({ partyId: fromParty.id, search: params.q, limit: 80 }) : Promise.resolve([]),
    fromStore ? findBatches({ search: params.q, storeId: fromStore.id, limit: 80 }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/transfers" session={session} />
      <AccountsHeader
        description="Distributor takeovers and stock moved between stores. A new distributor never inherits old stock or old dues unless a signed takeover is recorded here; earlier sales always stay with the supplier the stock came from."
        title="Transfers"
      />
      {session.can.approve ? (
        <Panel description="Needs the signed takeover letter (upload it under Documents first)." title="Distributor takeover">
          <form className="flex flex-wrap gap-2">
            <select className={`${inputClass} max-w-48`} defaultValue={firm?.id ?? ""} name="firm" required><option value="">Firm…</option>{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className={`${inputClass} max-w-72`} defaultValue={fromParty?.id ?? ""} name="from" required><option value="">Old supplier…</option>{parties.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</select>
            <input className={`${inputClass} max-w-56`} defaultValue={params.q ?? ""} name="q" placeholder="Lot or barcode (optional)" />
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show old stock</button>
          </form>
          {firm && fromParty ? (
            <ActionForm action={recordDistributorTransfer} className="mt-4 space-y-4" submitLabel="Record takeover">
              <input name="firmId" type="hidden" value={firm.id} />
              <input name="fromPartyId" type="hidden" value={fromParty.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="New supplier"><select className={inputClass} name="toPartyId" required><option value="">Choose…</option>{parties.filter((item) => item.id !== fromParty.id).map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</select></Field>
                <Field label="Takeover date"><input className={inputClass} defaultValue={indiaToday()} name="date" type="date" /></Field>
                <Field hint="0 if only stock moves" label="Amount owed that moves to the new supplier"><input className={inputClass} inputMode="decimal" name="amount" /></Field>
                <Field label="Signed document"><select className={inputClass} name="documentId" required><option value="">Choose…</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title ?? document.file_name}</option>)}</select></Field>
                <Field label="What was agreed"><input className={inputClass} name="narration" required /></Field>
              </div>
              {oldStock.filter((batch) => batch.remaining > 0 && batch.firm_id === firm.id).length ? (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {oldStock.filter((batch) => batch.remaining > 0 && batch.firm_id === firm.id).map((batch) => (
                    <label className="flex items-center justify-between gap-2 px-3 py-2 text-sm" key={batch.id}>
                      <span>{batch.lot_code ?? batch.barcode ?? "batch"} · {batch.brands?.name ?? ""} · {batch.stores?.name} · {batch.remaining} left</span>
                      <input className="size-4 accent-primary" name="batchIds" type="checkbox" value={batch.id} />
                    </label>
                  ))}
                </div>
              ) : <Empty>No stock of the old supplier left in this firm.</Empty>}
            </ActionForm>
          ) : null}
        </Panel>
      ) : <Notice tone="info">Distributor takeovers are recorded by the owner or an accountant allowed to approve.</Notice>}

      {session.can.post ? (
        <Panel description="Moves pieces with their supplier and cost. If the two stores bill under different firms, record the inter-firm transfer in your statutory books as well." title="Move stock between stores">
          <form className="flex flex-wrap gap-2">
            <select className={`${inputClass} max-w-56`} defaultValue={fromStore?.id ?? ""} name="store" required><option value="">From store…</option>{stores.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <input className={`${inputClass} max-w-56`} defaultValue={params.q ?? ""} name="q" placeholder="Lot or barcode" />
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show stock</button>
          </form>
          {fromStore ? (
            <ActionForm action={transferBetweenStores} className="mt-4 space-y-3" submitLabel="Move stock">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="To store"><select className={inputClass} name="toStoreId" required>{stores.filter((item) => item.is_active && item.id !== fromStore.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Date"><input className={inputClass} defaultValue={indiaToday()} name="date" type="date" /></Field>
                <Field label="Note"><input className={inputClass} name="note" /></Field>
              </div>
              {storeStock.filter((batch) => batch.remaining > 0).length ? (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {storeStock.filter((batch) => batch.remaining > 0).map((batch) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" key={batch.id}>
                      <span>{batch.lot_code ?? batch.barcode ?? "batch"} · {batch.parties?.legal_name ?? "unattributed"} · {batch.remaining} left</span>
                      <input className={`${inputClass} h-9 w-24`} inputMode="decimal" name={`move_${batch.id}`} placeholder="Qty" />
                    </div>
                  ))}
                </div>
              ) : <Empty>No stock found.</Empty>}
            </ActionForm>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Recorded takeovers">
        {transfers.length ? (
          <ul className="divide-y divide-border text-sm">
            {transfers.map((transfer) => (
              <li className="py-2" key={transfer.id}>
                <strong>{name.get(transfer.from_party_id)} → {name.get(transfer.to_party_id)}</strong> · {transfer.billing_firms?.name} · {shortDate(transfer.transfer_date)} · {money(transfer.liability_amount)} · {transfer.batches_moved} lots
                <span className="block text-muted">{transfer.narration}{transfer.from_voucher_id ? <> · <Link className="underline" href={`/app/accounts/vouchers/${transfer.from_voucher_id}`}>entries</Link></> : null}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>No takeovers recorded.</Empty>}
      </Panel>
    </div>
  );
}
