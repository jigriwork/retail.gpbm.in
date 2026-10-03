import Link from "next/link";

import { ActionForm } from "@/components/accounts/action-form";
import { BalanceCards } from "@/components/accounts/balance-cards";
import { Check, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import type { FinanceSession } from "@/lib/accounts/access";
import { indiaToday, money, noteReasons, paymentModes, shortDate } from "@/lib/accounts/format";
import { recordSupplierEntry } from "@/lib/accounts/ledger-actions";
import { openBills, openCredits, partyBalances } from "@/lib/accounts/ledger-queries";
import { linkableDocuments } from "@/lib/accounts/ledger-queries";
import { listAllParties, listFinanceStores, listFirms } from "@/lib/accounts/queries";
import { canPostFirmWide } from "@/lib/accounts/access";

const typeLabels: Record<string, string> = {
  credit_note: "Credit note received", debit_note: "Debit note we raised", opening: "Opening balance", payment: "Payment to supplier", receipt: "Refund from supplier",
};

/**
 * Choose firm and supplier, see where they stand, then post one entry and
 * adjust it against bills. Used by Payments (payment, refund, opening) and
 * Notes (credit and debit notes).
 */
export async function SupplierEntry({ base, firmId, partyId, session, storeId, type, types }: {
  base: string; firmId?: string; partyId?: string; session: FinanceSession; storeId?: string; type: string; types: string[];
}) {
  const [firms, parties, stores] = await Promise.all([listFirms(), listAllParties(), listFinanceStores()]);
  const storeAllowed = ["payment", "credit_note", "debit_note"].includes(type);
  const store = storeAllowed ? stores.find((item) => item.id === storeId) : undefined;
  const firm = firms.find((item) => item.id === firmId);
  const party = parties.find((item) => item.id === partyId);
  const chooser = (
    <Panel title="Firm and supplier">
      <form className="flex flex-wrap gap-2">
        <input name="type" type="hidden" value={type} />
        <select className={`${inputClass} max-w-56`} defaultValue={firm?.id ?? ""} name="firm" required>
          <option value="">Billing firm…</option>
          {firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className={`${inputClass} max-w-80`} defaultValue={party?.id ?? ""} name="party" required>
          <option value="">Supplier…</option>
          {parties.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}
        </select>
        {storeAllowed ? (
          <select className={`${inputClass} max-w-56`} defaultValue={store?.id ?? ""} name="store">
            <option value="">Firm-wide (no store)</option>
            {stores.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name} bills only</option>)}
          </select>
        ) : null}
        <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
      </form>
    </Panel>
  );
  if (!firm || !party) return chooser;

  const reducesWhatWeOwe = type !== "receipt" && type !== "opening";
  const [[balance], bills, credits, documents] = await Promise.all([
    partyBalances(firm.id, party.id),
    reducesWhatWeOwe || type === "opening" ? openBills(firm.id, party.id) : Promise.resolve([]),
    type === "receipt" ? openCredits(firm.id, party.id) : Promise.resolve([]),
    linkableDocuments(null),
  ]);
  const targets = type === "receipt" ? credits : store ? bills.filter((bill) => bill.store_id === store.id) : bills;
  const firmWide = canPostFirmWide(session, firm.id);
  return (
    <>
      {chooser}
      <Panel action={<Link className="text-sm font-semibold text-primary" href={`/app/accounts/parties/${party.id}/ledger?firm=${firm.id}`}>Open ledger →</Link>} title={`${party.legal_name} · ${firm.name}`}>
        <BalanceCards balance={balance} firmId={firm.id} partyId={party.id} />
      </Panel>
      <div className="flex flex-wrap gap-1 text-xs font-semibold">
        {types.map((item) => (
          <Link className={item === type ? "rounded-full bg-primary px-3 py-1.5 text-white" : "rounded-full border border-border px-3 py-1.5 text-muted"} href={`${base}?firm=${firm.id}&party=${party.id}&type=${item}${store ? `&store=${store.id}` : ""}`} key={item}>
            {typeLabels[item]}
          </Link>
        ))}
      </div>
      {session.can.post ? (
        <Panel title={typeLabels[type]}>
          <ActionForm action={recordSupplierEntry} submitLabel={`Post ${typeLabels[type].toLowerCase()}`}>
            <input name="type" type="hidden" value={type} />
            <input name="firmId" type="hidden" value={firm.id} />
            <input name="partyId" type="hidden" value={party.id} />
            {store ? <input name="storeId" type="hidden" value={store.id} /> : null}
            {store ? <p className="text-sm text-muted">For {store.name} only: {type === "payment" ? <>the full amount must be set against {store.name}&apos;s bills below.</> : <>it can only be set against {store.name}&apos;s bills.</>}</p> : null}
            {!store && !firmWide ? <p className="text-sm text-danger">Your access is limited to a store. Choose your store above; advances and firm-wide entries need firm-wide permission.</p> : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={type === "opening" ? "As of date" : "Date"}><input className={inputClass} defaultValue={indiaToday()} max={indiaToday()} name="date" required type="date" /></Field>
              <Field label="Amount (₹)"><input className={inputClass} inputMode="decimal" name="amount" required /></Field>
              {type === "payment" || type === "receipt" ? (
                <Field label="Paid by">
                  <select className={inputClass} name="mode">{paymentModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select>
                </Field>
              ) : null}
              {type === "opening" ? (
                <Field label="On that date">
                  <select className={inputClass} name="mode">
                    <option value="payable">We owed the supplier</option>
                    <option value="advance">The supplier owed us (advance)</option>
                  </select>
                </Field>
              ) : null}
              {type === "credit_note" || type === "debit_note" ? (
                <Field label="Reason">
                  <select className={inputClass} name="reason">{noteReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select>
                </Field>
              ) : null}
              <Field label={type === "payment" || type === "receipt" ? "UTR / cheque no." : type === "opening" ? "Bill no. (if one bill)" : "Note number"}><input className={inputClass} name="reference" /></Field>
              {type === "credit_note" || type === "debit_note" || type === "opening" ? <Field label={type === "opening" ? "Bill date" : "Note date"}><input className={inputClass} name="referenceDate" type="date" /></Field> : null}
              {type === "opening" ? <Field hint="For an opening bill still to be paid" label="Due date"><input className={inputClass} name="dueDate" type="date" /></Field> : null}
            </div>
            {type === "credit_note" || type === "debit_note" ? (
              <div className="grid gap-4 sm:grid-cols-4">
                <Field hint="Leave blank if the note has no tax split" label="Taxable value"><input className={inputClass} inputMode="decimal" name="taxable" /></Field>
                <Field label="CGST"><input className={inputClass} inputMode="decimal" name="cgst" /></Field>
                <Field label="SGST"><input className={inputClass} inputMode="decimal" name="sgst" /></Field>
                <Field label="IGST"><input className={inputClass} inputMode="decimal" name="igst" /></Field>
              </div>
            ) : null}
            <Field label={type === "opening" ? "Based on (statement, ledger copy, agreement)" : "Narration"}>
              <input className={inputClass} name="narration" required={type === "opening"} />
            </Field>
            <Field label="Attach a document (optional)">
              <select className={inputClass} name="documentId">
                <option value="">—</option>
                {documents.map((document) => <option key={document.id} value={document.id}>{document.title ?? document.file_name}{document.doc_no ? ` · ${document.doc_no}` : ""}</option>)}
              </select>
            </Field>
            {type === "opening" ? null : targets.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{type === "receipt" ? "Set the refund against these unadjusted payments" : "Adjust against these open bills"}</p>
                <Check defaultChecked label="Adjust oldest first automatically (ignored if you type amounts below)" name="autoAllocate" />
                <div className="divide-y divide-border rounded-xl border border-border">
                  {targets.map((bill) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" key={bill.id}>
                      <span>
                        <span className="font-semibold">{bill.reference_no ?? bill.voucher_no}</span> · {shortDate(bill.voucher_date)}
                        {"due_date" in bill && bill.due_date ? ` · due ${shortDate(bill.due_date)}` : ""} · open {money(bill.open)}
                      </span>
                      <input aria-label={`Adjust against ${bill.voucher_no}`} className={`${inputClass} h-9 w-36`} inputMode="decimal" name={`alloc_${bill.id}`} placeholder="Amount" />
                    </div>
                  ))}
                </div>
              </div>
            ) : <Empty>{type === "receipt" ? "No unadjusted payments; the refund will stay open until matched." : "No open bills; the amount will show as an advance or unadjusted note."}</Empty>}
          </ActionForm>
        </Panel>
      ) : null}
    </>
  );
}
