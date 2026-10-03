import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { createClient } from "@/lib/supabase/server";

type Comparison = {
  our_balance: number; their_balance: number; difference: number; matched: number;
  unmatched_ours: Array<{ id: string; voucher_no: string; date: string; reference: string | null; amount: number; side: string }>;
  unmatched_theirs: Array<{ id: string; date: string | null; doc_no: string | null; description: string | null; debit: number; credit: number }>;
};

export default async function StatementPage({ params }: { params: Promise<{ statementId: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Statements are visible to the owner and people with accounts access." />;
  const { statementId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(statementId)) notFound();
  const supabase = await createClient();
  const [{ data: statement }, { data: comparison }] = await Promise.all([
    supabase.from("supplier_statements").select("*, parties(legal_name), billing_firms(name)").eq("id", statementId).maybeSingle(),
    supabase.rpc("statement_comparison", { p_statement: statementId }),
  ]);
  if (!statement || !comparison) notFound();
  const result = comparison as unknown as Comparison;
  const difference = Number(result.difference);
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/statements" session={session} />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-semibold text-muted" href="/app/accounts/statements">← Statements</Link>
        <h1 className="mt-2 text-3xl font-semibold">{statement.parties?.legal_name}</h1>
        <p className="mt-2 text-sm text-muted">{statement.billing_firms?.name} · {shortDate(statement.period_from)} – {shortDate(statement.period_to)}</p>
      </section>
      <Panel title="Balance at the statement date">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl border border-border bg-background p-3"><p className="text-xs font-semibold uppercase text-muted">Our ledger balance</p><p className="mt-1 text-lg font-semibold">{money(result.our_balance)}</p></div>
          <div className="rounded-2xl border border-border bg-background p-3"><p className="text-xs font-semibold uppercase text-muted">Their statement</p><p className="mt-1 text-lg font-semibold">{money(result.their_balance)}</p></div>
          <div className="rounded-2xl border border-border bg-background p-3"><p className="text-xs font-semibold uppercase text-muted">Difference to resolve</p><p className="mt-1 text-lg font-semibold">{money(difference)}</p></div>
        </div>
        {difference ? <Notice>The difference stays here until each unmatched line is explained: post the missing entry, or record a dispute from the entry it concerns.</Notice> : <p className="mt-3"><Badge tone="good">Agrees with our ledger</Badge></p>}
        <p className="mt-2 text-xs text-muted">{result.matched} lines matched by document number and amount.</p>
      </Panel>
      <Panel title="On their statement, not in our books">
        {result.unmatched_theirs.length ? (
          <ul className="divide-y divide-border text-sm">
            {result.unmatched_theirs.map((line) => <li className="flex justify-between gap-2 py-1.5" key={line.id}><span>{shortDate(line.date)} · {line.doc_no ?? "—"} · {line.description ?? ""}</span><span>{Number(line.debit) ? `bill ${money(line.debit)}` : `credit ${money(line.credit)}`}</span></li>)}
          </ul>
        ) : <Empty>Nothing.</Empty>}
      </Panel>
      <Panel title="In our books, not on their statement">
        {result.unmatched_ours.length ? (
          <ul className="divide-y divide-border text-sm">
            {result.unmatched_ours.map((item) => <li className="flex justify-between gap-2 py-1.5" key={item.id}><Link className="underline" href={`/app/accounts/vouchers/${item.id}`}>{item.voucher_no}{item.reference ? ` · ${item.reference}` : ""}</Link><span>{shortDate(item.date)} · {item.side === "credit" ? "bill" : "payment/note"} {money(item.amount)}</span></li>)}
          </ul>
        ) : <Empty>Nothing.</Empty>}
      </Panel>
    </div>
  );
}
