import Link from "next/link";

export const inputClass = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary";
export const areaClass = "min-h-20 w-full rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-primary";

export function Field({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs leading-5 text-muted">{hint}</span> : null}
    </label>
  );
}

export function Check({ defaultChecked, label, name }: { defaultChecked?: boolean; label: string; name: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input className="size-4 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

export function Panel({ action, children, description, title }: { action?: React.ReactNode; children: React.ReactNode; description?: string; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "good" | "warn" | "bad" }) {
  const tones = {
    bad: "border-danger/30 bg-danger/5 text-danger",
    good: "border-success/30 bg-success/5 text-success",
    muted: "border-border text-muted",
    warn: "border-accent/40 bg-accent-soft text-accent-ink",
  };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Notice({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "info" }) {
  return (
    <p className={tone === "warn"
      ? "rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm leading-6 text-accent-ink"
      : "rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-muted"}>
      {children}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function Pager({ base, page, pageSize, total, query = {} }: { base: string; page: number; pageSize: number; total: number; query?: Record<string, string> }) {
  if (total <= pageSize) return null;
  const href = (target: number) => `${base}?${new URLSearchParams({ ...query, page: String(target) })}`;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 0 ? <Link className="font-semibold text-primary" href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-muted">{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}</span>
      {(page + 1) * pageSize < total ? <Link className="font-semibold text-primary" href={href(page + 1)}>Next →</Link> : <span />}
    </div>
  );
}
