import Link from "next/link";

import type { FinanceSession } from "@/lib/accounts/access";

export function AccountsNav({ active, session }: { active: string; session: FinanceSession }) {
  const links = [
    { href: "/app/accounts", label: "Overview", show: session.can.view },
    { href: "/app/accounts/parties", label: "Suppliers", show: session.can.view },
    { href: "/app/accounts/purchases", label: "Purchases", show: session.can.view },
    { href: "/app/accounts/payments", label: "Payments", show: session.can.view },
    { href: "/app/accounts/notes", label: "Credit/debit notes", show: session.can.view },
    { href: "/app/accounts/daybook", label: "Day book", show: session.can.view },
    { href: "/app/accounts/reconciliation", label: "Reconciliation", show: session.can.view },
    { href: "/app/accounts/brands", label: "Brands", show: session.can.view },
    { href: "/app/accounts/terms", label: "Company terms", show: session.can.view },
    { href: "/app/accounts/documents", label: "Documents", show: session.can.view || session.canSubmitDocuments },
    { href: "/app/accounts/inputs", label: "Sales inputs", show: session.can.view },
    { href: "/app/accounts/firms", label: "Firms & stores", show: session.can.view },
    { href: "/app/accounts/access", label: "Access", show: session.isOwner },
  ].filter((link) => link.show);
  return (
    <nav aria-label="Accounts" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {links.map((link) => (
        <Link
          aria-current={link.href === active ? "page" : undefined}
          className={link.href === active
            ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
            : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function AccountsHeader({ description, title }: { description: string; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted">Company accounts</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}
