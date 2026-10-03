import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { matchClaim, paySettlement } from "@/lib/accounts/working-actions";
import { listClaims, listSettlements, paymentsForSettlement, unmatchedCreditNotes } from "@/lib/accounts/working-queries";

export default async function ClaimsPage() {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Expected credits are visible to the owner and people with accounts access." />;
  const [claims, settlements] = await Promise.all([listClaims(), listSettlements()]);
  const pending = claims.filter((claim) => claim.status === "expected");
  const notesFor = new Map<string, Awaited<ReturnType<typeof unmatchedCreditNotes>>>();
  const paymentsFor = new Map<string, Awaited<ReturnType<typeof paymentsForSettlement>>>();
  if (session.can.post) {
    for (const claim of pending) {
      const key = `${claim.firm_id}:${claim.party_id}`;
      if (!notesFor.has(key)) notesFor.set(key, await unmatchedCreditNotes(claim.firm_id, claim.party_id));
    }
    for (const settlement of settlements.filter((item) => item.status === "open")) {
      const key = `${settlement.firm_id}:${settlement.party_id}`;
      if (!paymentsFor.has(key)) paymentsFor.set(key, await paymentsForSettlement(settlement.firm_id, settlement.party_id));
    }
  }
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/claims" session={session} />
      <AccountsHeader
        description="Credits expected from approved workings, and what is payable for stock sold. An expected credit never reduces the ledger: post the supplier's actual credit note, then match it here. A difference becomes a dispute."
        title="Expected credits and settlements"
      />
      <Panel title={`CN pending (${pending.length})`}>
        {claims.length ? (
          <div className="space-y-2">
            {claims.map((claim) => {
              const notes = notesFor.get(`${claim.firm_id}:${claim.party_id}`) ?? [];
              return (
                <div className="rounded-xl border border-border bg-background p-3 text-sm" key={claim.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{claim.parties?.legal_name}</strong> · {claim.billing_firms?.name} · {shortDate(claim.period_from)} – {shortDate(claim.period_to)} · {claim.kind.replace("_", " ")}</span>
                    <span className="flex items-center gap-2">expected {money(claim.expected_amount)}{claim.received_amount !== null ? ` · received ${money(claim.received_amount)}` : ""}<Badge tone={claim.status === "received" ? "good" : claim.status === "disputed" ? "bad" : "warn"}>{claim.status}</Badge></span>
                  </div>
                  {claim.run_id ? <Link className="text-xs text-primary underline" href={`/app/accounts/workings/${claim.run_id}`}>working</Link> : null}
                  {claim.status === "expected" && session.can.post ? (
                    notes.length ? (
                      <ActionForm action={matchClaim} className="mt-2 flex flex-wrap items-end gap-2" submitLabel="Match" variant="secondary">
                        <input name="claimId" type="hidden" value={claim.id} />
                        <Field label="Posted credit note"><select className={`${inputClass} h-9`} name="voucherId">{notes.map((note) => <option key={note.id} value={note.id}>{note.voucher_no} · {note.reference_no ?? ""} · {money(note.amount)}</option>)}</select></Field>
                      </ActionForm>
                    ) : <p className="mt-1 text-xs text-muted">No unmatched credit note posted yet for this supplier. <Link className="underline" href={`/app/accounts/notes?firm=${claim.firm_id}&party=${claim.party_id}&type=credit_note`}>Post it</Link>.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : <Empty>No expected credits yet. They appear when a working is approved.</Empty>}
      </Panel>
      <Panel title="Settlements payable (pay against sold stock)">
        {settlements.length ? (
          <div className="space-y-2">
            {settlements.map((settlement) => {
              const payments = paymentsFor.get(`${settlement.firm_id}:${settlement.party_id}`) ?? [];
              return (
                <div className="rounded-xl border border-border bg-background p-3 text-sm" key={settlement.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{settlement.parties?.legal_name}</strong> · {settlement.billing_firms?.name} · due {shortDate(settlement.due_date)}</span>
                    <span className="flex items-center gap-2">payable {money(settlement.payable)} · paid {money(settlement.paid)}<Badge tone={settlement.status === "paid" ? "good" : "warn"}>{settlement.status}</Badge></span>
                  </div>
                  {settlement.status === "open" && session.can.post && payments.length ? (
                    <ActionForm action={paySettlement} className="mt-2 flex flex-wrap items-end gap-2" submitLabel="Link payment" variant="secondary">
                      <input name="settlementId" type="hidden" value={settlement.id} />
                      <Field label="Posted payment"><select className={`${inputClass} h-9`} name="voucherId">{payments.map((payment) => <option key={payment.id} value={payment.id}>{payment.voucher_no} · {shortDate(payment.voucher_date)} · {money(payment.amount)}</option>)}</select></Field>
                      <Field label="Amount"><input className={`${inputClass} h-9 w-36`} inputMode="decimal" name="amount" required /></Field>
                    </ActionForm>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : <Empty>No settlements yet.</Empty>}
      </Panel>
    </div>
  );
}
