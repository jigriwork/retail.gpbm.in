import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { monthRange } from "@/lib/accounts/ledger-queries";
import { listArrangementsWithTerms } from "@/lib/accounts/queries";
import { prepareWorking } from "@/lib/accounts/working-actions";
import { listWorkings } from "@/lib/accounts/working-queries";

const statusTone = (status: string) => (status === "approved" || status === "closed" ? "good" : status === "superseded" ? "muted" : "warn") as "good" | "muted" | "warn";

export default async function WorkingsPage() {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Company workings are visible to the owner and people with accounts access." />;
  const [runs, arrangements] = await Promise.all([listWorkings(), listArrangementsWithTerms()]);
  const { from, to } = monthRange();
  const lastMonth = monthRange(new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7));
  const withRules = arrangements.filter((arrangement) => arrangement.terms.some((terms) => terms.rules && Object.keys(terms.rules as object).length));

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/workings" session={session} />
      <AccountsHeader
        description="Company workings from the daily sales you already upload. Each working keeps the exact report versions, attribution and terms version it used. Approving a working records the expected credit and, for pay-against-sold-stock suppliers, what is payable; it never posts to the ledger."
        title="Company workings"
      />
      <Notice tone="info">
        Two views are kept side by side: the company&apos;s own way of working it out (to reproduce their sheet) and our agreed terms. Differences are shown, never silently corrected;
        only the agreed-terms working can be approved.
      </Notice>
      {session.can.post ? (
        <Panel title="Prepare a working">
          {withRules.length ? (
            <ActionForm action={prepareWorking} submitLabel="Prepare working">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Supplier and brand">
                  <select className={inputClass} name="arrangementId" required>
                    {withRules.map((arrangement) => <option key={arrangement.id} value={arrangement.id}>{arrangement.parties?.legal_name} → {arrangement.brands?.name} · {arrangement.billing_firms?.name}{arrangement.stores?.name ? ` · ${arrangement.stores.name}` : ""}</option>)}
                  </select>
                </Field>
                <Field label="Rules">
                  <select className={inputClass} name="ruleSet">
                    <option value="agreed_terms">Our agreed terms</option>
                    <option value="company_working">The company&apos;s own working (comparison)</option>
                  </select>
                </Field>
                <Field label="From"><input className={inputClass} defaultValue={lastMonth.from} name="from" required type="date" /></Field>
                <Field label="To"><input className={inputClass} defaultValue={lastMonth.to < to ? lastMonth.to : to} name="to" required type="date" /></Field>
              </div>
              <Field label="Notes"><input className={inputClass} name="notes" /></Field>
            </ActionForm>
          ) : <Empty>No supplier has calculation rules yet. Add them to a terms version under Company terms.</Empty>}
        </Panel>
      ) : null}
      <Panel title="Workings">
        {runs.length ? (
          <div className="divide-y divide-border">
            {runs.map((run) => {
              const totals = (run.totals ?? {}) as Record<string, string>;
              return (
                <Link className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" href={`/app/accounts/workings/${run.id}`} key={run.id}>
                  <span>
                    <strong>{run.parties?.legal_name} → {run.brands?.name}</strong> · {shortDate(run.period_from)} – {shortDate(run.period_to)}
                    <span className="block text-xs text-muted">{run.rule_set === "agreed_terms" ? "Agreed terms" : "Company's working"} · {run.billing_firms?.name}{run.stores?.name ? ` · ${run.stores.name}` : ""}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>pay {money(totals.payment)} · CN {money(totals.cn)}</span>
                    {!run.complete ? <Badge tone="bad">Working incomplete</Badge> : null}
                    {run.source_changed ? <Badge tone="bad">Source changed</Badge> : null}
                    <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : <Empty>No workings yet.</Empty>}
      </Panel>
    </div>
  );
}
