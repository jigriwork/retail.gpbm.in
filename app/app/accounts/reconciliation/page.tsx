import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { saveDispute } from "@/lib/accounts/ledger-actions";
import { listDisputes } from "@/lib/accounts/ledger-queries";

export default async function ReconciliationPage() {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Reconciliation is visible to the owner and people with accounts access." />;
  const disputes = await listDisputes();
  const open = disputes.filter((dispute) => dispute.status === "open");
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/reconciliation" session={session} />
      <AccountsHeader
        description="Differences with suppliers that still need an answer. A dispute never changes the ledger by itself; once agreed, post the credit or debit note and mark it resolved."
        title="Reconciliation"
      />
      <Notice tone="info">Company statement upload and line-by-line matching, and expected credits from company workings, are added in later releases.</Notice>
      <Panel title={`Difference to resolve (${open.length})`}>
        {disputes.length ? (
          <div className="space-y-3">
            {disputes.map((dispute) => (
              <div className="rounded-2xl border border-border bg-background p-4 text-sm" key={dispute.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{dispute.title}</span>
                  <span className="flex items-center gap-2"><strong>{money(dispute.amount)}</strong><Badge tone={dispute.status === "open" ? "warn" : "muted"}>{dispute.status}</Badge></span>
                </div>
                <p className="mt-1 text-muted">
                  <Link className="underline" href={`/app/accounts/parties/${dispute.party_id}/ledger?firm=${dispute.firm_id}`}>{dispute.parties?.legal_name}</Link> · {dispute.billing_firms?.name} · raised {shortDate(dispute.created_at)}
                  {dispute.voucher_id ? <> · <Link className="underline" href={`/app/accounts/vouchers/${dispute.voucher_id}`}>entry</Link></> : null}
                </p>
                {dispute.details ? <p className="mt-1">{dispute.details}</p> : null}
                {dispute.resolution ? <p className="mt-1 text-muted">Resolution: {dispute.resolution}</p> : null}
                {session.can.post ? (
                  <ActionForm action={saveDispute} className="mt-2 flex flex-wrap items-end gap-2" submitLabel="Update" variant="secondary">
                    <input name="disputeId" type="hidden" value={dispute.id} />
                    <Field label="Status">
                      <select className={`${inputClass} h-9`} defaultValue={dispute.status} name="status">
                        <option value="open">Open</option><option value="resolved">Resolved</option><option value="withdrawn">Withdrawn</option>
                      </select>
                    </Field>
                    <div className="min-w-64 flex-1"><Field label="How it was resolved"><input className={`${inputClass} h-9`} defaultValue={dispute.resolution ?? ""} name="resolution" /></Field></div>
                  </ActionForm>
                ) : null}
              </div>
            ))}
          </div>
        ) : <Empty>No disputes recorded. Raise one from any entry.</Empty>}
      </Panel>
    </div>
  );
}
