import Link from "next/link";

import { ActionForm } from "@/components/accounts/action-form";
import { AccessDenied } from "@/components/app/access-denied";
import { requireProfile } from "@/lib/auth/session";
import { giveNightTask } from "@/lib/owner-night/actions";
import { idleReason, money, type NightPlan, shortDate, staffGroups, title, tomorrowTodos } from "@/lib/owner-night/format";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaToday } from "@/lib/tasks/dates";

const num = (value: unknown) => Number(value ?? 0) || 0;

/** The full 11 PM plan: every idle item with its reason, sizes running out, staff, and tomorrow's actions. */
export default async function NightPlanPage({ searchParams }: { searchParams: Promise<{ day?: string; store?: string }> }) {
  const { profile } = await requireProfile();
  if (profile.role !== "owner") return <AccessDenied message="The night plan is for the owners." />;
  const params = await searchParams;
  const today = getIndiaToday();
  const day = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) && params.day <= today ? params.day : today;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owner_night_plan", { p_day: day });
  if (error || !data) return <AccessDenied message={error?.code === "P0001" ? error.message : "Could not load the night plan. Please retry."} />;
  const raw = data as unknown as NightPlan;
  const plan = { ...raw, stores: [...raw.stores].sort((left, right) => (left.code === "GP" ? -1 : right.code === "GP" ? 1 : left.code.localeCompare(right.code))) };
  const stores = params.store ? plan.stores.filter((store) => store.code === params.store) : plan.stores;
  const todos = tomorrowTodos({ ...plan, stores });
  const people = staffGroups(stores);
  const dayLink = (value: string) => `/app/owner/night?day=${value}${params.store ? `&store=${params.store}` : ""}`;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Owner · sent on WhatsApp every night at 11 PM</p>
        <h1 className="mt-2 text-3xl font-semibold">Plan for tomorrow</h1>
        <p className="mt-2 text-sm leading-6 text-muted">From the sales and stock up to {shortDate(day)}: what to act on tomorrow. Sales figures are in the 9 AM summary.</p>
        <nav className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <Link className="rounded-full border border-border px-3 py-1.5" href={dayLink(addDays(day, -1))}>← {shortDate(addDays(day, -1))}</Link>
          <span className="rounded-full bg-primary px-3 py-1.5 text-white">{shortDate(day)}</span>
          {day < today ? <Link className="rounded-full border border-border px-3 py-1.5" href={dayLink(addDays(day, 1))}>{shortDate(addDays(day, 1))} →</Link> : null}
          <span className="mx-1 text-muted">|</span>
          <Link className={`rounded-full px-3 py-1.5 ${!params.store ? "bg-primary-soft text-primary" : "border border-border"}`} href={`/app/owner/night?day=${day}`}>Both stores</Link>
          {plan.stores.map((store) => (
            <Link className={`rounded-full px-3 py-1.5 ${params.store === store.code ? "bg-primary-soft text-primary" : "border border-border"}`} href={`/app/owner/night?day=${day}&store=${store.code}`} key={store.code}>{store.name}</Link>
          ))}
        </nav>
        <p className="mt-3 text-sm">{plan.stores.map((store) => `${store.name}: ${store.uploaded ? "✅ sales uploaded" : "❌ sales not uploaded"}${store.stock_date ? ` · stock of ${shortDate(store.stock_date)}` : ""}`).join("  ·  ")}</p>
      </section>

      <Section title={`✅ Tomorrow first (${todos.length})`}>
        {todos.length ? (
          <ol className="space-y-2">
            {todos.map((todo, index) => (
              <li className="rounded-2xl border border-border bg-background p-3 text-sm" key={`${todo.store}-${todo.title}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{index + 1}. {todo.store}: {todo.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{todo.detail}</p>
                  </div>
                  <ActionForm action={giveNightTask} className="flex shrink-0" submitLabel="Give to manager as task" variant="secondary">
                    <input name="store" type="hidden" value={todo.store} />
                    <input name="title" type="hidden" value={todo.title} />
                    <input name="detail" type="hidden" value={todo.detail} />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">Nothing urgent.</p>}
      </Section>

      <Section title="🧑‍🤝‍🧑 Staff (last 7 days)">
        <div className="grid gap-3 sm:grid-cols-3">
          <People empty="No one stands out this week." people={people.praise} title="🌟 Praise" />
          <People empty="No one." people={people.talk} title="💬 Talk to" />
          <People empty="Everyone is selling." people={people.check} title="👀 Check" />
        </div>
        {stores.map((store) => (
          <div className="mt-4 overflow-x-auto" key={store.code}>
            <p className="mb-1 text-sm font-semibold">{store.name} · store average bill {money(store.store_avg_bill)}, {num(store.store_items_per_bill)} items per bill</p>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1">Staff</th><th className="text-right">7 days</th><th className="text-right">Bills</th><th className="text-right">Avg bill</th><th className="text-right">Items/bill</th><th className="text-right">Per day vs usual</th></tr></thead>
              <tbody>
                {store.staff.map((person) => {
                  const usual = num(person.usual_per_day);
                  const change = usual > 0 ? Math.round(((num(person.recent_per_day) - usual) / usual) * 100) : null;
                  return (
                    <tr className="border-t border-border/60" key={person.name}>
                      <td className="py-1.5 font-medium">{title(person.name)}</td>
                      <td className="text-right">{money(person.sale7)}</td>
                      <td className="text-right">{num(person.bills7)}</td>
                      <td className="text-right">{num(person.bills7) ? money(person.avg_bill) : "—"}</td>
                      <td className="text-right">{num(person.bills7) ? num(person.items_per_bill) : "—"}</td>
                      <td className={`text-right font-semibold ${change === null ? "" : change >= 0 ? "text-success" : "text-danger"}`}>{change === null ? "new" : `${change > 0 ? "+" : ""}${change}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </Section>

      {stores.map((store) => (
        <Section key={store.code} title={`🧊 ${store.name}: stock with no sale for ${store.idle_days}+ days`}>
          <p className="mb-2 text-sm text-muted">{num(store.idle_total.items)} items · {num(store.idle_total.pcs)} pcs · {money(store.idle_total.value)} at MRP. Biggest first.</p>
          {store.idle.length ? (
            <ul className="space-y-2">
              {store.idle.map((row) => {
                const { action, why } = idleReason(row, day);
                return (
                  <li className="rounded-2xl border border-border bg-background p-3 text-sm" key={`${row.brand}-${row.item}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-semibold">{title(row.brand, true)} · {title(row.item)}</p>
                      <p className="shrink-0 text-right font-semibold">{num(row.pcs)} pcs<span className="block text-xs font-medium text-muted">{money(row.value)}</span></p>
                    </div>
                    <p className="mt-1 text-xs"><b>Why:</b> {why}. <b>Do:</b> {action}.</p>
                    <p className="mt-0.5 text-xs text-muted">Sizes left: {row.sizes_left ?? "—"} · last sale {row.last_sale ? shortDate(row.last_sale) : "never"}</p>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">Nothing idle.</p>}
          {store.running_out.length ? (
            <>
              <h3 className="mb-2 mt-4 font-semibold">📉 Running out</h3>
              <ul className="space-y-1 text-sm">
                {store.running_out.map((row) => (
                  <li key={`${row.brand}-${row.item}-${row.size}`}>
                    <b>{title(row.brand, true)} {title(row.item)} · {row.size}</b>: {num(row.on_hand)} left, {num(row.sold_30)} sold in 30 days{num(row.other_on_hand) > 0 ? ` · ${num(row.other_on_hand)} at ${row.other_stores}: bring them` : " · reorder"}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>
      ))}
    </div>
  );
}

function Section({ children, title: heading }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 text-lg font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

function People({ empty, people, title: heading }: { empty: string; people: Array<{ name: string; note: string; store: string }>; title: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="mb-2 text-sm font-semibold">{heading}</p>
      {people.length ? (
        <ul className="space-y-1.5 text-sm">
          {people.map((person) => <li key={`${person.store}-${person.name}`}><b>{person.name}</b> <span className="text-xs text-muted">({person.store})</span><span className="block text-xs">{person.note}</span></li>)}
        </ul>
      ) : <p className="text-xs text-muted">{empty}</p>}
    </div>
  );
}
