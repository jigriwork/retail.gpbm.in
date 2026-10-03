import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Field, inputClass, Notice, Pager, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { approveBillDiscount, saveCompanyFigures, setWorkingStatus } from "@/lib/accounts/working-actions";
import { getWorking } from "@/lib/accounts/working-queries";

const figureRows = [
  ["qty", "Pieces"], ["mrp_value", "MRP value"], ["nsv", "Net sales (incl. tax)"], ["customer_discount", "Customer discount"],
  ["accepted_discount", "Discount accepted by company"], ["sales_value", "Company-accepted sales"], ["margin", "Dealer margin"],
  ["sales_tax", "Tax on sales"], ["purchase_cost", "Purchase cost (formula or batch)"], ["purchase_tax", "Purchase tax"],
  ["purchase_value", "Purchase value incl. tax"], ["tax_diff", "Tax difference"], ["payment", "Payment"], ["cn", "Credit note"],
] as const;

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export default async function WorkingPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ page?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Company workings are visible to the owner and people with accounts access." />;
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(runId)) notFound();
  const page = Math.max(0, Number(query.page) || 0);
  const { run, lines, total, sibling, claims, settlement, pageSize } = await getWorking(runId, page);
  if (!run) notFound();
  const totals = (run.totals ?? {}) as Record<string, string>;
  const siblingTotals = (sibling?.totals ?? {}) as Record<string, string>;
  const company = (run.company_figures ?? null) as { payment?: number | null; cn?: number | null; note?: string | null } | null;
  const blockers = (run.blockers ?? []) as Array<{ code: string; text: string }>;
  const inputs = (run.inputs ?? {}) as Record<string, unknown>;
  const manual = (run.rules as Record<string, { accept?: string }>)?.discount?.accept === "input";
  const diff = (ours: unknown, theirs: unknown) => (num(ours) !== null && num(theirs) !== null ? Math.round((Number(ours) - Number(theirs)) * 100) / 100 : null);

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/workings" session={session} />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-semibold text-muted" href="/app/accounts/workings">← Workings</Link>
        <h1 className="mt-2 text-3xl font-semibold">{run.parties?.legal_name} → {run.brands?.name}</h1>
        <p className="mt-2 text-sm text-muted">
          {shortDate(run.period_from)} – {shortDate(run.period_to)} · Billed under <strong className="text-foreground">{run.billing_firms?.name}</strong>{run.stores?.name ? ` · ${run.stores.name}` : ""}
          {" "}· {run.rule_set === "agreed_terms" ? "Our agreed terms" : "The company's own working"} · terms version {String(inputs.terms_version ?? "—")} ({String(inputs.terms_status ?? "—")})
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={run.status === "approved" || run.status === "closed" ? "good" : "warn"}>{run.status}</Badge>
          {run.complete ? <Badge tone="good">Inputs complete</Badge> : <Badge tone="bad">Working incomplete</Badge>}
          {run.source_changed ? <Badge tone="bad">Source changed — review required</Badge> : null}
          {(run.supply_arrangements as { settlement_basis?: string } | null)?.settlement_basis === "sales" ? <Badge>Paid against sold stock</Badge> : null}
        </div>
      </section>
      {blockers.length ? (
        <Notice>
          Working incomplete. These figures are provisional and cannot be approved: {blockers.map((blocker) => blocker.text).join(" ")}
          {" "}See <Link className="font-semibold underline" href="/app/accounts/inputs">Sales inputs</Link> and <Link className="font-semibold underline" href="/app/accounts/stock">Stock attribution</Link>.
        </Notice>
      ) : null}
      {run.source_changed ? <Notice>A sales report in this period was corrected after this working was prepared. Its figures are kept as they were; prepare a new working to see the corrected figures.</Notice> : null}

      <Panel title="Figures">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1 pr-3" /><th className="pr-3 text-right">This working</th>{sibling ? <th className="pr-3 text-right"><Link className="underline" href={`/app/accounts/workings/${sibling.id}`}>{sibling.rule_set === "agreed_terms" ? "Agreed terms" : "Company's working"}</Link></th> : null}{company ? <th className="pr-3 text-right">Company&apos;s sheet</th> : null}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {figureRows.map(([key, label]) => (
                <tr className={key === "payment" || key === "cn" ? "font-semibold" : ""} key={key}>
                  <td className="py-1.5 pr-3">{label}</td>
                  <td className="pr-3 text-right">{key === "qty" ? totals[key] : money(totals[key])}</td>
                  {sibling ? <td className="pr-3 text-right">{key === "qty" ? siblingTotals[key] : money(siblingTotals[key])}</td> : null}
                  {company ? <td className="pr-3 text-right">{key === "payment" ? money(company.payment ?? null) : key === "cn" ? money(company.cn ?? null) : ""}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {company && (diff(totals.payment, company.payment) || diff(totals.cn, company.cn)) ? (
          <p className="mt-3 text-sm">Difference to the company&apos;s sheet: payment {money(diff(totals.payment, company.payment))}, CN {money(diff(totals.cn, company.cn))}. Treat it as a claim or dispute until reviewed and agreed.</p>
        ) : null}
        <p className="mt-2 text-xs text-muted">Figures are exact (not rounded) unless the terms set line rounding.</p>
      </Panel>

      {claims.length || settlement ? (
        <Panel title="Expected credit and payable">
          <ul className="space-y-1 text-sm">
            {claims.map((claim) => <li key={claim.id}>Expected CN {money(claim.expected_amount)} · {claim.status}{claim.matched_voucher_id ? <> · <Link className="underline" href={`/app/accounts/vouchers/${claim.matched_voucher_id}`}>matched note</Link></> : null}</li>)}
            {settlement ? <li>Settlement payable {money(settlement.payable)} · due {shortDate(settlement.due_date)} · {settlement.status}</li> : null}
          </ul>
          <Link className="mt-2 inline-flex text-sm font-semibold text-primary" href="/app/accounts/claims">Match credit notes and payments →</Link>
        </Panel>
      ) : null}

      {session.can.post ? (
        <Panel title="Review and approval">
          <div className="flex flex-wrap gap-3">
            {run.status === "draft" ? <ActionForm action={setWorkingStatus} className="flex" submitLabel="Mark reviewed" variant="secondary"><input name="runId" type="hidden" value={run.id} /><input name="status" type="hidden" value="reviewed" /></ActionForm> : null}
            {(run.status === "draft" || run.status === "reviewed") && session.can.approve && run.rule_set === "agreed_terms" ? (
              <ActionForm action={setWorkingStatus} className="flex" submitLabel="Approve working"><input name="runId" type="hidden" value={run.id} /><input name="status" type="hidden" value="approved" /></ActionForm>
            ) : null}
            {run.status === "approved" && session.can.close ? <ActionForm action={setWorkingStatus} className="flex" submitLabel="Close" variant="secondary"><input name="runId" type="hidden" value={run.id} /><input name="status" type="hidden" value="closed" /></ActionForm> : null}
            {run.status === "draft" || run.status === "reviewed" ? (
              <ActionForm action={setWorkingStatus} className="flex flex-wrap items-center gap-2" submitLabel="Set aside" variant="secondary">
                <input name="runId" type="hidden" value={run.id} /><input name="status" type="hidden" value="superseded" />
                <input className={`${inputClass} h-9 max-w-56`} name="note" placeholder="Why" />
              </ActionForm>
            ) : null}
          </div>
          <details className="mt-4 rounded-xl border border-dashed border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Enter the company&apos;s figures from their sheet</summary>
            <ActionForm action={saveCompanyFigures} className="mt-3 flex flex-wrap items-end gap-3" submitLabel="Save for comparison" variant="secondary">
              <input name="runId" type="hidden" value={run.id} />
              <Field label="Their payment"><input className={inputClass} defaultValue={company?.payment ?? ""} inputMode="decimal" name="payment" /></Field>
              <Field label="Their CN"><input className={inputClass} defaultValue={company?.cn ?? ""} inputMode="decimal" name="cn" /></Field>
              <Field label="Note"><input className={inputClass} defaultValue={company?.note ?? ""} name="note" /></Field>
            </ActionForm>
          </details>
        </Panel>
      ) : null}

      <Panel description={`${total} lines. Each opens to the bill it came from in the daily sales report.`} title="Calculation lines">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-left text-muted"><tr><th className="py-1 pr-2">Date</th><th className="pr-2">Bill</th><th className="pr-2">Lot</th><th className="pr-2">Class</th><th className="pr-2 text-right">Qty</th><th className="pr-2 text-right">MRP</th><th className="pr-2 text-right">Net</th><th className="pr-2 text-right">Accepted disc.</th><th className="pr-2 text-right">Margin</th><th className="pr-2 text-right">Tax diff</th><th className="pr-2 text-right">Payment</th><th className="text-right">CN</th></tr></thead>
            <tbody className="divide-y divide-border">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-1 pr-2 whitespace-nowrap">{shortDate(line.sale_date)}</td>
                  <td className="pr-2">{line.bill_no}</td><td className="pr-2">{line.lot_code}</td><td className="pr-2">{line.class}</td>
                  <td className="pr-2 text-right">{line.qty}</td><td className="pr-2 text-right">{line.mrp}</td><td className="pr-2 text-right">{Number(line.nsv).toFixed(2)}</td>
                  <td className="pr-2 text-right">{Number(line.accepted_discount).toFixed(2)}</td><td className="pr-2 text-right">{Number(line.margin).toFixed(2)}</td>
                  <td className="pr-2 text-right">{Number(line.tax_diff).toFixed(2)}</td><td className="pr-2 text-right">{Number(line.payment).toFixed(2)}</td><td className="text-right">{Number(line.cn).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager base={`/app/accounts/workings/${run.id}`} page={page} pageSize={pageSize} total={total} />
        {manual && session.can.post ? (
          <details className="mt-4 rounded-xl border border-dashed border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Record a bill&apos;s approved discount</summary>
            <ActionForm action={approveBillDiscount} className="mt-3 flex flex-wrap items-end gap-3" submitLabel="Save approval" variant="secondary">
              <input name="arrangementId" type="hidden" value={run.arrangement_id} />
              <Field label="Store id"><input className={inputClass} defaultValue={run.store_id ?? ""} name="storeId" required /></Field>
              <Field label="Bill date"><input className={inputClass} name="saleDate" required type="date" /></Field>
              <Field label="Bill no."><input className={inputClass} name="billNo" required /></Field>
              <Field label="Approved amount"><input className={inputClass} inputMode="decimal" name="amount" required /></Field>
              <Field label="Note"><input className={inputClass} name="note" /></Field>
            </ActionForm>
          </details>
        ) : null}
      </Panel>
    </div>
  );
}
