import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday } from "@/lib/accounts/format";
import { partyBalances, partyNames, type PartyBalance } from "@/lib/accounts/ledger-queries";
import { listFirms, listStoreFirmPeriods, mastersSummary, salesCoverage, storesWithFirmToday } from "@/lib/accounts/queries";
import { money } from "@/lib/accounts/format";

const figureKeys = [
  ["ledger_balance", "Ledger balance"], ["due_now", "Due for payment"], ["overdue", "Overdue"], ["due_unknown", "Due date not set"],
  ["sales_basis_open", "Against sold stock"], ["advance", "Advance paid"], ["unadjusted_notes", "Notes not adjusted"],
  ["cn_received", "CN received"], ["disputed", "Difference to resolve"],
] as const;

/** Sums in paise so rupee totals never drift. */
function totals(rows: PartyBalance[]) {
  return Object.fromEntries(figureKeys.map(([key]) => [key, rows.reduce((sum, row) => sum + Math.round(Number(row[key]) * 100), 0) / 100])) as Record<(typeof figureKeys)[number][0], number>;
}

function Stat({ href, label, value }: { href: string; label: string; value: number | string }) {
  return (
    <Link className="rounded-2xl border border-border bg-background p-4 transition hover:border-primary" href={href}>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Link>
  );
}

export default async function AccountsOverviewPage() {
  const session = await getFinanceSession();
  if (!session.can.view) {
    if (session.canSubmitDocuments) {
      return (
        <div className="space-y-5">
          <AccountsHeader description="Send supplier invoices, purchase files and stock-return dispatch papers for your store. The accountant reviews them." title="Purchase documents" />
          <Link className="inline-flex h-11 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white" href="/app/accounts/documents">Submit a document</Link>
        </div>
      );
    }
    return <AccessDenied message="Company accounts are for the owner and people the owner has given accounts access." />;
  }

  const today = indiaToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [summary, stores, periods, firms, balances] = await Promise.all([mastersSummary(), storesWithFirmToday(), listStoreFirmPeriods(), listFirms(), partyBalances(null)]);
  const names = await partyNames(balances.map((row) => row.party_id));
  const coverage = await Promise.all(stores.map(async (store) => {
    const days = await salesCoverage(store.id, monthStart, today);
    return {
      store,
      billLevel: days.filter((day) => day.status === "bill_level").length,
      gaps: days.filter((day) => ["missing", "summary_only", "mixed", "empty"].includes(day.status)).length,
      days: days.length,
    };
  }));
  const unconfirmed = periods.filter((period) => period.status === "to_confirm");

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts" session={session} />
      <AccountsHeader
        description="Supplier accounts and company settlements for each billing firm. This is for managing suppliers; it does not replace your statutory books or GST filing."
        title="Accounts overview"
      />
      <Notice tone="info">
        Balances come only from posted entries. “CN expected”, “CN pending” and “Return credit pending” appear once company workings and stock returns
        are added; until then they are not shown rather than shown as zero.
      </Notice>
      {firms.map((firm) => {
        const rows = balances.filter((row) => row.firm_id === firm.id);
        const sum = totals(rows);
        const top = [...rows].sort((a, b) => Number(b.due_now) - Number(a.due_now) || Number(b.ledger_balance) - Number(a.ledger_balance)).slice(0, 8);
        return (
          <Panel description="This firm's own books." key={firm.id} title={firm.name}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {figureKeys.map(([key, label]) => (
                <Link className="rounded-2xl border border-border bg-background p-3 transition hover:border-primary" href={key === "disputed" ? "/app/accounts/reconciliation" : `/app/accounts/daybook?firm=${firm.id}`} key={key}>
                  <p className="text-xs font-semibold uppercase text-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{money(sum[key])}</p>
                </Link>
              ))}
            </div>
            {top.length ? (
              <div className="mt-4 divide-y divide-border">
                {top.map((row) => (
                  <Link className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" href={`/app/accounts/parties/${row.party_id}/ledger?firm=${firm.id}`} key={row.party_id}>
                    <span className="font-semibold">{names.get(row.party_id) ?? "Supplier"}</span>
                    <span className="text-muted">balance {money(row.ledger_balance)} · due {money(row.due_now)}{Number(row.overdue) ? <> · <Badge tone="bad">overdue {money(row.overdue)}</Badge></> : null}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-muted">No posted entries yet.</p>}
          </Panel>
        );
      })}
      {firms.length > 1 ? (
        <Panel description="Management view only: the firms' books are not merged." title="All firms together">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {figureKeys.slice(0, 4).map(([key, label]) => (
              <div className="rounded-2xl border border-border bg-background p-3" key={key}>
                <p className="text-xs font-semibold uppercase text-muted">{label}</p>
                <p className="mt-1 text-lg font-semibold">{money(totals(balances)[key])}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      {unconfirmed.length ? (
        <Notice>
          {unconfirmed.length} store billing period{unconfirmed.length > 1 ? "s are" : " is"} still “to confirm” (Brand Mark in September 2026).
          Entries on those dates need the firm chosen from the document until the exact cutover date is confirmed under{" "}
          <Link className="font-semibold underline" href="/app/accounts/firms">Firms &amp; stores</Link>.
        </Notice>
      ) : null}

      <Panel title="Stores and the firm they bill under today">
        <div className="grid gap-3 sm:grid-cols-2">
          {stores.map((store) => (
            <div className="rounded-2xl border border-border bg-background p-4" key={store.id}>
              <p className="font-semibold">{store.name}</p>
              <p className="mt-1 text-sm text-muted">Billed under: {store.firm ? <strong className="text-foreground">{store.firm.name}</strong> : <Badge tone="warn">to confirm</Badge>}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Masters">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat href="/app/accounts/parties" label="Suppliers" value={summary.parties} />
          <Stat href="/app/accounts/brands" label="Brands" value={summary.brands} />
          <Stat href="/app/accounts/parties" label="Agents" value={summary.agents} />
          <Stat href="/app/accounts/terms" label="Supply arrangements" value={summary.arrangements} />
          <Stat href="/app/accounts/terms" label="Terms confirmed" value={`${summary.confirmedTerms} of ${summary.terms}`} />
          <Stat href="/app/accounts/documents" label="Documents" value={summary.documents} />
        </div>
      </Panel>

      <Panel description="Company workings need bill-level sales for every day. Days with no report, or only a summary, make a working incomplete." title="Sales inputs this month">
        <div className="grid gap-3 sm:grid-cols-2">
          {coverage.map((item) => (
            <Link className="rounded-2xl border border-border bg-background p-4 transition hover:border-primary" href={`/app/accounts/inputs?store=${item.store.id}`} key={item.store.id}>
              <p className="font-semibold">{item.store.name}</p>
              <p className="mt-1 text-sm text-muted">{item.billLevel} of {item.days} days with bill-level sales</p>
              {item.gaps ? <p className="mt-2"><Badge tone="warn">{item.gaps} day{item.gaps > 1 ? "s" : ""} incomplete</Badge></p> : <p className="mt-2"><Badge tone="good">Complete so far</Badge></p>}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
