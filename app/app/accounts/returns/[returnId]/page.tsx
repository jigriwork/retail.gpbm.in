import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, money, shortDate } from "@/lib/accounts/format";
import { advanceReturn } from "@/lib/accounts/stock-actions";
import { getReturn } from "@/lib/accounts/stock-queries";

function Step({ action, children, label, returnId }: { action: string; children?: React.ReactNode; label: string; returnId: string }) {
  return (
    <ActionForm action={advanceReturn} className="space-y-3 rounded-xl border border-border bg-background p-3" submitLabel={label} variant="secondary">
      <input name="returnId" type="hidden" value={returnId} />
      <input name="action" type="hidden" value={action} />
      <Field label="Date"><input className={`${inputClass} max-w-48`} defaultValue={indiaToday()} name="date" type="date" /></Field>
      {children}
    </ActionForm>
  );
}

export default async function ReturnPage({ params }: { params: Promise<{ returnId: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Stock returns are visible to the owner and people with accounts access." />;
  const { returnId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(returnId)) notFound();
  const { ret, lines } = await getReturn(returnId);
  if (!ret) notFound();
  const can = session.can.post;
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/returns" session={session} />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-semibold text-muted" href="/app/accounts/returns">← Stock returns</Link>
        <h1 className="mt-2 text-3xl font-semibold">{ret.return_no}</h1>
        <p className="mt-2 text-sm text-muted">{ret.parties?.legal_name} · {ret.stores?.name} · Billed under <strong className="text-foreground">{ret.billing_firms?.name}</strong></p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={ret.status === "closed" || ret.status === "credited" ? "good" : "warn"}>{ret.status}</Badge>
          <Badge>Expected credit {money(ret.expected_credit)}</Badge>
          {ret.accepted_value !== null ? <Badge>Accepted {money(ret.accepted_value)}</Badge> : null}
          {ret.supplier_credit_amount !== null ? <Badge>Supplier credit {money(ret.supplier_credit_amount)}{ret.supplier_credit_ref ? ` (${ret.supplier_credit_ref})` : ""}</Badge> : null}
          {ret.debit_note_voucher_id ? <Link className="text-sm font-semibold text-primary" href={`/app/accounts/vouchers/${ret.debit_note_voucher_id}`}>Our debit note →</Link> : null}
          {ret.credit_note_voucher_id ? <Link className="text-sm font-semibold text-primary" href={`/app/accounts/vouchers/${ret.credit_note_voucher_id}`}>Credit note →</Link> : null}
        </div>
        <p className="mt-3 text-sm text-muted">
          Requested {shortDate(ret.request_date)}{ret.authorised_date ? ` · authorised ${shortDate(ret.authorised_date)}${ret.authorisation_ref ? ` (${ret.authorisation_ref})` : ""}` : ""}
          {ret.dispatch_date ? ` · sent ${shortDate(ret.dispatch_date)}${ret.dispatch_ref ? ` (${ret.dispatch_ref})` : ""}` : ""}{ret.acknowledged_date ? ` · acknowledged ${shortDate(ret.acknowledged_date)}` : ""}
          {" "}· Ledger reduced {ret.deduct_on === "acknowledgement" ? "when the supplier accepts" : "only by the supplier's credit note"}
        </p>
      </section>
      <Panel title="Items">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Value/pc</th><th className="text-right">Accepted</th><th className="text-right">Rejected</th></tr></thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5">{line.lot_code ?? line.barcode ?? ""} {line.article ?? ""} {line.size ?? ""}</td>
                <td className="text-right">{line.qty}</td><td className="text-right">{money(line.unit_value)}</td>
                <td className="text-right">{line.accepted_qty ?? "—"}</td><td className="text-right">{line.rejected_qty ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {can ? (
        <Panel title="Next step">
          {ret.status === "requested" ? <Step action="authorise" label="Mark authorised" returnId={ret.id}><Field label="Authorisation reference"><input className={inputClass} name="ref" /></Field></Step> : null}
          {ret.status === "requested" || ret.status === "authorised" ? (
            <div className="mt-3"><Step action="dispatch" label="Mark sent to supplier" returnId={ret.id}><Field label="Dispatch / LR number"><input className={inputClass} name="ref" /></Field><p className="text-xs text-muted">Stock is reduced now; the ledger is not touched.</p></Step></div>
          ) : null}
          {ret.status === "dispatched" ? (
            <Step action="acknowledge" label="Record supplier acknowledgement" returnId={ret.id}>
              {lines.map((line) => <Field key={line.id} label={`Accepted of ${line.qty} · ${line.lot_code ?? line.barcode ?? line.article ?? "item"}`}><input className={`${inputClass} max-w-32`} defaultValue={line.qty} inputMode="decimal" name={`accepted_${line.id}`} /></Field>)}
              <Field hint="Leave blank to use accepted pieces × value" label="Accepted value agreed"><input className={`${inputClass} max-w-48`} inputMode="decimal" name="amount" /></Field>
              {ret.deduct_on === "acknowledgement" ? <div className="grid gap-3 sm:grid-cols-3"><Field label="CGST in debit note"><input className={inputClass} inputMode="decimal" name="cgst" /></Field><Field label="SGST"><input className={inputClass} inputMode="decimal" name="sgst" /></Field><Field label="IGST"><input className={inputClass} inputMode="decimal" name="igst" /></Field></div> : null}
              <p className="text-xs text-muted">Rejected pieces go back into stock.{ret.deduct_on === "acknowledgement" ? " A debit note for the accepted value is posted and reduces the ledger." : ""}</p>
            </Step>
          ) : null}
          {ret.status === "dispatched" || ret.status === "acknowledged" ? (
            <div className="mt-3">
              <Step action="credit" label="Record supplier's credit note" returnId={ret.id}>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Credit note number"><input className={inputClass} name="ref" /></Field><Field label="Credit note amount"><input className={inputClass} inputMode="decimal" name="amount" required /></Field></div>
                {ret.debit_note_voucher_id
                  ? <Notice tone="info">Our debit note already reduced the ledger. The supplier&apos;s note is matched to it, not deducted again; any difference becomes a dispute.</Notice>
                  : <div className="grid gap-3 sm:grid-cols-3"><Field label="CGST"><input className={inputClass} inputMode="decimal" name="cgst" /></Field><Field label="SGST"><input className={inputClass} inputMode="decimal" name="sgst" /></Field><Field label="IGST"><input className={inputClass} inputMode="decimal" name="igst" /></Field></div>}
              </Step>
            </div>
          ) : null}
          {ret.status === "credited" ? <Step action="close" label="Close return" returnId={ret.id} /> : null}
          {ret.status === "requested" || ret.status === "authorised" ? <div className="mt-3"><Step action="cancel" label="Cancel return" returnId={ret.id}><Field label="Reason"><input className={inputClass} name="ref" /></Field></Step></div> : null}
          {ret.status === "closed" || ret.status === "cancelled" ? <p className="text-sm text-muted">No further steps.</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
