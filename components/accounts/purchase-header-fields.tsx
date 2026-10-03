import { Field, inputClass } from "@/components/accounts/fields";
import { indiaToday } from "@/lib/accounts/format";

type Invoice = {
  id: string; firm_id: string; store_id: string; party_id: string; supplier_invoice_no: string; invoice_date: string; received_date: string | null;
  logic_purchase_ref?: string | null; total_qty: number | null; taxable_amount: number; cgst_amount: number; sgst_amount: number; igst_amount: number; freight_amount: number;
  other_charges: number; discount_amount: number; round_off: number; invoice_total: number; due_date: string | null; due_date_source: string | null; notes: string | null;
};

const amount = (value: number | null | undefined) => (value === null || value === undefined || Number(value) === 0 ? "" : String(value));

/** Purchase invoice header fields, as printed on the supplier's invoice. */
export function PurchaseHeaderFields({ firms, invoice, parties, stores }: {
  firms: Array<{ id: string; name: string; is_active: boolean }>;
  invoice?: Invoice;
  parties: Array<{ id: string; legal_name: string }>;
  stores: Array<{ id: string; name: string; firm: { name: string } | null }>;
}) {
  return (
    <>
      {invoice ? <input name="invoiceId" type="hidden" value={invoice.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Supplier (legal name on invoice)">
          <select className={inputClass} defaultValue={invoice?.party_id ?? ""} name="partyId" required>
            <option value="">Choose…</option>
            {parties.map((party) => <option key={party.id} value={party.id}>{party.legal_name}</option>)}
          </select>
        </Field>
        <Field label="Receiving store">
          <select className={inputClass} defaultValue={invoice?.store_id ?? ""} name="storeId" required>
            <option value="">Choose…</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}{store.firm ? ` (billed under ${store.firm.name} today)` : ""}</option>)}
          </select>
        </Field>
        <Field hint="Leave automatic unless the invoice is billed to another firm" label="Billed under">
          <select className={inputClass} defaultValue={invoice?.firm_id ?? ""} name="firmId">
            <option value="">Automatic from store and date</option>
            {firms.filter((firm) => firm.is_active).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier invoice number"><input className={inputClass} defaultValue={invoice?.supplier_invoice_no ?? ""} name="supplierInvoiceNo" placeholder="PJ-26" required /></Field>
        <Field label="Invoice date"><input className={inputClass} defaultValue={invoice?.invoice_date ?? ""} max={indiaToday()} name="invoiceDate" required type="date" /></Field>
        <Field hint="Logic's purchase number, e.g. PP26-193, if it differs from the supplier's invoice number. Sales show it as LOT NUMBER." label="Logic purchase no. (optional)"><input className={inputClass} defaultValue={invoice?.logic_purchase_ref ?? ""} name="logicPurchaseRef" /></Field>
        <Field label="Received on"><input className={inputClass} defaultValue={invoice?.received_date ?? ""} name="receivedDate" type="date" /></Field>
        <Field label="Total quantity"><input className={inputClass} defaultValue={invoice?.total_qty ?? ""} inputMode="decimal" name="totalQty" placeholder="463" /></Field>
        <Field label="Taxable value"><input className={inputClass} defaultValue={amount(invoice?.taxable_amount)} inputMode="decimal" name="taxable" placeholder="976985.60" /></Field>
        <Field label="CGST"><input className={inputClass} defaultValue={amount(invoice?.cgst_amount)} inputMode="decimal" name="cgst" /></Field>
        <Field label="SGST"><input className={inputClass} defaultValue={amount(invoice?.sgst_amount)} inputMode="decimal" name="sgst" /></Field>
        <Field label="IGST"><input className={inputClass} defaultValue={amount(invoice?.igst_amount)} inputMode="decimal" name="igst" /></Field>
        <Field label="Freight"><input className={inputClass} defaultValue={amount(invoice?.freight_amount)} inputMode="decimal" name="freight" /></Field>
        <Field label="Other charges"><input className={inputClass} defaultValue={amount(invoice?.other_charges)} inputMode="decimal" name="otherCharges" /></Field>
        <Field label="Discount on invoice"><input className={inputClass} defaultValue={amount(invoice?.discount_amount)} inputMode="decimal" name="discount" /></Field>
        <Field hint="Negative if reduced, e.g. -0.24" label="Round off"><input className={inputClass} defaultValue={amount(invoice?.round_off)} inputMode="decimal" name="roundOff" /></Field>
        <Field label="Invoice total"><input className={inputClass} defaultValue={amount(invoice?.invoice_total)} inputMode="decimal" name="invoiceTotal" placeholder="1065813.00" required /></Field>
        <Field hint="Blank = from confirmed terms when posting" label="Due date"><input className={inputClass} defaultValue={invoice?.due_date_source === "manual" ? invoice.due_date ?? "" : ""} name="dueDate" type="date" /></Field>
        <Field label="Notes"><input className={inputClass} defaultValue={invoice?.notes ?? ""} name="notes" /></Field>
      </div>
    </>
  );
}
