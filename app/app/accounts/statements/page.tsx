import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { areaClass, Empty, Field, inputClass, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { linkableDocuments } from "@/lib/accounts/ledger-queries";
import { saveStatement } from "@/lib/accounts/period-actions";
import { listAllParties, listFirms } from "@/lib/accounts/queries";
import { createClient } from "@/lib/supabase/server";

export default async function StatementsPage() {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Statements are visible to the owner and people with accounts access." />;
  const [firms, parties, documents, { data: statements }] = await Promise.all([
    listFirms(), listAllParties(), linkableDocuments(null),
    (await createClient()).from("supplier_statements").select("id,period_from,period_to,closing_balance,created_at, parties(legal_name), billing_firms(name)").order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/statements" session={session} />
      <AccountsHeader description="A supplier's statement of our account, compared with our ledger line by line. It never replaces our balance; differences go to Reconciliation." title="Company statements" />
      {session.can.post ? (
        <Panel title="Add a statement">
          <ActionForm action={saveStatement} submitLabel="Compare with our ledger">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Firm"><select className={inputClass} name="firmId" required>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}</select></Field>
              <Field label="Supplier"><select className={inputClass} name="partyId" required><option value="">Choose…</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.legal_name}</option>)}</select></Field>
              <Field label="Statement document"><select className={inputClass} name="documentId"><option value="">—</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title ?? document.file_name}</option>)}</select></Field>
              <Field label="From"><input className={inputClass} name="from" required type="date" /></Field>
              <Field label="To"><input className={inputClass} name="to" required type="date" /></Field>
              <Field hint="What they say we owe" label="Their closing balance"><input className={inputClass} inputMode="decimal" name="closing" required /></Field>
            </div>
            <Field hint="Optional. One line per row: date, document no, description, debit (their bill), credit (our payment / their note). Comma or tab separated, e.g. copied from Excel." label="Statement lines">
              <textarea className={areaClass} name="lines" placeholder={"25/09/2026, PJ-26, Pepe invoice, 1065813, 0\n05/10/2026, UTR123, Payment, 0, 500000"} rows={6} />
            </Field>
          </ActionForm>
        </Panel>
      ) : null}
      <Panel title="Statements">
        {statements?.length ? (
          <div className="divide-y divide-border">
            {statements.map((statement) => (
              <Link className="flex flex-wrap justify-between gap-2 py-2 text-sm" href={`/app/accounts/statements/${statement.id}`} key={statement.id}>
                <span><strong>{statement.parties?.legal_name}</strong> · {statement.billing_firms?.name} · {shortDate(statement.period_from)} – {shortDate(statement.period_to)}</span>
                <span>their balance {money(statement.closing_balance)}</span>
              </Link>
            ))}
          </div>
        ) : <Empty>No statements yet.</Empty>}
      </Panel>
    </div>
  );
}
