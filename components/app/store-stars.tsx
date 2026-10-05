import { createClient } from "@/lib/supabase/server";

type Person = { bills: number | null; name: string; sale: number | null; value?: number | null };
export type WeekStars = {
  best_bill: Person | null;
  from: string;
  most_items: Person | null;
  staff_count: number;
  to: string;
  top: Person[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function titleName(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim().replace(/(^|[\s.&(-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}

const rupees = (value: number | null | undefined) => `₹${Math.round(Number(value ?? 0)).toLocaleString("en-IN")}`;
const medals = ["🥇", "🥈", "🥉"];

/** The stars of a week: top 3 sellers, best average bill, most items per bill. */
export function StarsList({ amounts, stars }: { amounts: boolean; stars: WeekStars }) {
  if (!stars.staff_count) return <p className="text-sm text-muted">No bill-wise sales in the last 7 days yet.</p>;
  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-1.5">
        {stars.top.map((person, index) => (
          <li className={`flex items-baseline justify-between gap-3 ${index === 0 ? "text-base font-semibold" : ""}`} key={person.name}>
            <span>{medals[index]} {titleName(person.name)}</span>
            {amounts && person.sale !== null ? <span className="tabular-nums text-muted">{rupees(person.sale)}{person.bills ? ` · ${person.bills} bills` : ""}</span> : null}
          </li>
        ))}
      </ol>
      <div className="grid gap-2 sm:grid-cols-2">
        {stars.best_bill ? (
          <p className="rounded-2xl border border-border bg-background px-3 py-2">
            <span className="block text-xs text-muted">Best average bill</span>
            <span className="font-semibold">{titleName(stars.best_bill.name)}</span>{amounts && stars.best_bill.value !== null && stars.best_bill.value !== undefined ? ` · ${rupees(stars.best_bill.value)}` : ""}
          </p>
        ) : null}
        {stars.most_items ? (
          <p className="rounded-2xl border border-border bg-background px-3 py-2">
            <span className="block text-xs text-muted">Most items per bill</span>
            <span className="font-semibold">{titleName(stars.most_items.name)}</span> · {Number(stars.most_items.value ?? 0)} per bill
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Owner and managers: the store's stars of the last 7 days (amounts hidden on a manager's phone). */
export async function StoreStarsCard({ amounts, storeId, storeName }: { amounts: boolean; storeId: string; storeName: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_week_stars", { p_store: storeId });
  if (error || !data) return null;
  const stars = data as unknown as WeekStars;
  return (
    <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted">{storeName} · {shortDay(stars.from)} – {shortDay(stars.to)}</p>
      <h2 className="mt-1 text-lg font-semibold">⭐ Stars of the week</h2>
      <p className="mb-3 text-xs text-muted">Tell them on the shop floor: a word of praise goes a long way.</p>
      <StarsList amounts={amounts} stars={stars} />
    </section>
  );
}
