"use client";

import { useActionState } from "react";

import { Field, inputClass } from "@/components/accounts/fields";
import { Button } from "@/components/ui/button";
import { reviewFinanceDocument, type ReviewState } from "@/lib/accounts/document-actions";
import { documentKinds } from "@/lib/accounts/format";

export function DocumentReviewForm({ document, firms, parties, stores }: {
  document: { id: string; kind: string; firm_id: string | null; store_id: string | null; party_id: string | null; title: string | null; doc_no: string | null; doc_date: string | null; amount: number | null; status: string; notes: string | null };
  firms: Array<{ id: string; name: string }>;
  parties: Array<{ id: string; legal_name: string }>;
  stores: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(reviewFinanceDocument, { ok: false, message: "" } as ReviewState);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input name="documentId" type="hidden" value={document.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Kind">
          <select className={inputClass} defaultValue={document.kind} name="kind">
            {documentKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </Field>
        <Field label="Billed under">
          <select className={inputClass} defaultValue={document.firm_id ?? ""} name="firmId">
            <option value="">To confirm</option>
            {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
          </select>
        </Field>
        <Field label="Store">
          <select className={inputClass} defaultValue={document.store_id ?? ""} name="storeId">
            <option value="">Not store-specific</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier">
          <select className={inputClass} defaultValue={document.party_id ?? ""} name="partyId">
            <option value="">—</option>
            {parties.map((party) => <option key={party.id} value={party.id}>{party.legal_name}</option>)}
          </select>
        </Field>
        <Field label="Description"><input className={inputClass} defaultValue={document.title ?? ""} name="title" /></Field>
        <Field label="Number"><input className={inputClass} defaultValue={document.doc_no ?? ""} name="docNo" /></Field>
        <Field label="Date"><input className={inputClass} defaultValue={document.doc_date ?? ""} name="docDate" type="date" /></Field>
        <Field label="Amount on document"><input className={inputClass} defaultValue={document.amount ?? ""} inputMode="decimal" name="amount" /></Field>
        <Field label="Status">
          <select className={inputClass} defaultValue={document.status === "stored" ? "reviewed" : document.status} name="status">
            <option value="reviewed">Reviewed</option>
            <option value="stored">Not reviewed yet</option>
            <option value="rejected">Rejected (wrong / not ours)</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><input className={inputClass} defaultValue={document.notes ?? ""} name="notes" /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} variant="secondary">Save review</Button>
        {state.message ? <p className={state.ok ? "text-sm text-success" : "text-sm text-danger"} role="status">{state.message}</p> : null}
      </div>
    </form>
  );
}
