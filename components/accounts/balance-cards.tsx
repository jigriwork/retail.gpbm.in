import Link from "next/link";

import { drCr, money } from "@/lib/accounts/format";
import type { PartyBalance } from "@/lib/accounts/ledger-queries";

/** The labelled figures for one supplier in one firm. Each opens its entries. */
export function BalanceCards({ balance, firmId, partyId }: { balance?: PartyBalance; firmId: string; partyId: string }) {
  const ledger = `/app/accounts/parties/${partyId}/ledger?firm=${firmId}`;
  const cards = [
    { href: ledger, hint: "Cr = we owe them · Dr = they owe us", label: "Ledger balance", value: balance?.ledger_balance, ledger: true },
    { href: `${ledger}&view=due`, hint: "Bills due today or earlier", label: "Due for payment", value: balance?.due_now },
    { href: `${ledger}&view=due`, hint: "Past the due date", label: "Overdue", value: balance?.overdue },
    { href: `${ledger}&view=open`, hint: "Open bills with no due date yet", label: "Due date not set", value: balance?.due_unknown },
    { href: `${ledger}&view=open`, hint: "Paid through company workings", label: "Against sold stock", value: balance?.sales_basis_open },
    { href: `${ledger}&view=credits`, hint: "Payments not set against bills", label: "Advance paid", value: balance?.advance },
    { href: `${ledger}&view=credits`, hint: "Credit/debit notes not set against bills", label: "Notes not adjusted", value: balance?.unadjusted_notes },
    { href: `${ledger}&view=notes`, hint: "Posted credit notes", label: "CN received", value: balance?.cn_received },
    { href: "/app/accounts/reconciliation", hint: "Open disputes", label: "Difference to resolve", value: balance?.disputed },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cards.map((card) => (
        <Link className="rounded-2xl border border-border bg-background p-3 transition hover:border-primary" href={card.href} key={card.label}>
          <p className="text-xs font-semibold uppercase text-muted">{card.label}</p>
          <p className="mt-1 text-lg font-semibold">{"ledger" in card ? drCr(card.value) : money(card.value ?? 0)}</p>
          <p className="text-xs text-muted">{card.hint}</p>
        </Link>
      ))}
    </div>
  );
}
