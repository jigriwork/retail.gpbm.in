import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { AccountsNav } from "@/components/accounts/accounts-nav";
import { BalanceCards } from "@/components/accounts/balance-cards";
import { Badge, Empty, inputClass, Pager, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { financialYear, indiaToday, labelFor, money, shortDate, voucherTypes } from "@/lib/accounts/format";
import { openBills, openCredits, partyBalances, partyLedger } from "@/lib/accounts/ledger-queries";
import { getParty, listFirms } from "@/lib/accounts/queries";

export default async function PartyLedgerPage({ params, searchParams }: {
  params: Promise<{ partyId: string }>;
  searchParams: Promise<{ firm?: string; from?: string; to?: string; page?: string; view?: string }>;
}) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Ledgers are visible to the owner and people with accounts access." />;
  const [{ partyId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(partyId)) notFound();
  const [{ party }, firms] = await Promise.all([getParty(partyId), listFirms()]);
  if (!party) notFound();
  const firm = firms.find((item) => item.id === query.firm) ?? firms[0];
  if (!firm) return <AccessDenied message="No billing firm is visible to you." />;
  const today = indiaToday();
  const fyStart = `${financialYear(today).slice(0, 4)}-04-01`;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") ? query.from! : fyStart;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") ? query.to! : today;
  const page = Math.max(0, Number(query.page) || 0);
  const view = ["ledger", "open", "due", "credits", "notes"].includes(query.view ?? "") ? query.view! : "ledger";
  const [[balance], rows, bills, credits] = await Promise.all([
    partyBalances(firm.id, party.id),
    view === "ledger" || view === "notes" ? partyLedger(firm.id, party.id, from, to, page) : Promise.resolve([]),
    view === "open" || view === "due" ? openBills(firm.id, party.id) : Promise.resolve([]),
    view === "credits" ? openCredits(firm.id, party.id) : Promise.resolve([]),
  ]);
  const shownRows = view === "notes" ? rows.filter((row) => row.voucher_type === "credit_note" || row.voucher_type === "debit_note") : rows;
  const shownBills = view === "due" ? bills.filter((bill) => bill.due_date && bill.due_date <= today) : bills;
  const total = rows[0]?.total_rows ?? 0;
  const tab = (value: string, label: string) => (
    <Link className={value === view ? "rounded-full bg-primary px-3 py-1.5 text-white" : "rounded-full border border-border px-3 py-1.5 text-muted"} href={`?firm=${firm.id}&view=${value}`}>{label}</Link>
  );

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/parties" session={session} />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-semibold text-muted" href={`/app/accounts/parties/${party.id}`}>← {party.legal_name}</Link>
        <h1 className="mt-2 text-3xl font-semibold">Ledger · {firm.name}</h1>
        <p className="mt-1 text-sm text-muted">Each billing firm has its own books; switch firm to see the other ledger.</p>
        <form className="mt-3 flex flex-wrap gap-2">
          <input name="view" type="hidden" value={view} />
          <select className={`${inputClass} max-w-48`} defaultValue={firm.id} name="firm">{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input className={`${inputClass} max-w-40`} defaultValue={from} name="from" type="date" />
          <input className={`${inputClass} max-w-40`} defaultValue={to} name="to" type="date" />
          <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
        </form>
      </section>
      <BalanceCards balance={balance} firmId={firm.id} partyId={party.id} />
      <div className="flex flex-wrap gap-1 text-xs font-semibold">
        {tab("ledger", "Ledger")}{tab("open", "Open bills")}{tab("due", "Due now")}{tab("credits", "Advances & unadjusted notes")}{tab("notes", "Credit/debit notes")}
      </div>
      {view === "ledger" || view === "notes" ? (
        <Panel title={`${shortDate(from)} to ${shortDate(to)}`}>
          {shownRows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr><th className="py-1 pr-3">Date</th><th className="pr-3">Entry</th><th className="pr-3 text-right">Debit (paid/notes)</th><th className="pr-3 text-right">Credit (bills)</th><th className="text-right">Balance</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {page === 0 && view === "ledger" ? <tr><td className="py-1.5 pr-3 text-muted" colSpan={4}>Opening balance on {shortDate(from)}</td><td className="text-right font-semibold">{money(rows[0]?.opening_balance ?? 0)}</td></tr> : null}
                  {shownRows.map((row) => (
                    <tr key={row.voucher_id}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{shortDate(row.voucher_date)}</td>
                      <td className="pr-3">
                        <Link className="font-semibold underline" href={`/app/accounts/vouchers/${row.voucher_id}`}>{row.voucher_no}</Link> · {labelFor(voucherTypes, row.voucher_type)}
                        {row.reference_no ? ` · ${row.reference_no}` : ""}{row.status === "reversed" ? <> <Badge>reversed</Badge></> : null}
                      </td>
                      <td className="pr-3 text-right">{Number(row.debit) ? money(row.debit) : ""}</td>
                      <td className="pr-3 text-right">{Number(row.credit) ? money(row.credit) : ""}</td>
                      <td className="text-right font-semibold">{money(row.running_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No entries in this period.</Empty>}
          <Pager base={`/app/accounts/parties/${party.id}/ledger`} page={page} pageSize={50} query={{ firm: firm.id, from, to, view }} total={Number(total)} />
        </Panel>
      ) : null}
      {view === "open" || view === "due" ? (
        <Panel title={view === "due" ? "Bills due today or earlier" : "Open bills"}>
          {shownBills.length ? (
            <ul className="divide-y divide-border text-sm">
              {shownBills.map((bill) => (
                <li className="flex flex-wrap justify-between gap-2 py-2" key={bill.id}>
                  <Link className="font-semibold underline" href={`/app/accounts/vouchers/${bill.id}`}>{bill.reference_no ?? bill.voucher_no}</Link>
                  <span className="text-muted">{shortDate(bill.voucher_date)} · {bill.due_date ? `due ${shortDate(bill.due_date)}` : bill.settlement_basis === "sales" ? "against sold stock" : "due date not set"} · open <strong className="text-foreground">{money(bill.open)}</strong> of {money(bill.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing open.</Empty>}
        </Panel>
      ) : null}
      {view === "credits" ? (
        <Panel title="Advances and unadjusted notes">
          {credits.length ? (
            <ul className="divide-y divide-border text-sm">
              {credits.map((item) => (
                <li className="flex flex-wrap justify-between gap-2 py-2" key={item.id}>
                  <Link className="font-semibold underline" href={`/app/accounts/vouchers/${item.id}`}>{item.voucher_no}</Link>
                  <span className="text-muted">{labelFor(voucherTypes, item.voucher_type)} · {shortDate(item.voucher_date)} · not adjusted <strong className="text-foreground">{money(item.open)}</strong></span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing unadjusted.</Empty>}
        </Panel>
      ) : null}
    </div>
  );
}
