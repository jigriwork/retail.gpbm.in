import Link from "next/link";

const links = [
  { href: "/app/today", label: "Today" },
  { href: "/app/owner/review", label: "Weekly review" },
  { href: "/app/owner/decisions", label: "Decisions" },
  { href: "/app/owner/follow-ups", label: "Follow-ups" },
  { href: "/app/sops", label: "SOPs" },
];

export function OwnerToolsNav({ active }: { active: string }) {
  return (
    <nav aria-label="Owner tools" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {links.map((link) => (
        <Link
          aria-current={link.href === active ? "page" : undefined}
          className={
            link.href === active
              ? "shrink-0 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
              : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"
          }
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function PageHeader({ description, eyebrow, title }: { description: string; eyebrow: string; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}
