import Link from "next/link";
import { Search } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { PeriodPicker } from "@/components/reports/period-picker";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { isLimitedView } from "@/lib/auth/view";
import { rangeLabel, resolveRange } from "@/lib/reports/period";
import { compareSizes } from "@/lib/scan/sizes";
import { createClient } from "@/lib/supabase/server";

type SizeQty = { qty: number; size: string };
type Report = {
  brands: Array<{ brand: string; net: number; on_hand: number; sold: number; unsold_items: number; unsold_pcs: number }>;
  in_stock: number;
  items: Array<{ bills: number; item: string; last_sale: string | null; net: number; on_hand: number; sizes_left: SizeQty[] | null; sizes_sold: SizeQty[] | null; sold: number }> | null;
  snapshot_date: string | null;
  summary: { bills: number; items: number; net: number; sold: number };
  top: Array<{ brand: string; item: string; net: number; sold: number }> | null;
  unsold: Array<{ item: string; last_sale: string | null; mrp: number | null; on_hand: number; sizes_left: SizeQty[] | null }> | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (value: string | null) => (value ? `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1]}${value.slice(0, 4) !== new Date().getFullYear().toString() ? ` ${value.slice(0, 4)}` : ""}` : "");
const pcs = (value: number) => `${Number(value).toLocaleString("en-IN")} pc${Number(value) === 1 ? "" : "s"}`;
const money = (value: number) => new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(Number(value) || 0);

/** What sold and what did not, for any period: brands, then items with sizes. */
export default async function SoldPage({ searchParams }: { searchParams: Promise<{ brand?: string; end?: string; period?: string; q?: string; start?: string; store?: string }> }) {
  const { profile } = await requireProfile();
  if (!profile || !["owner", "manager"].includes(profile.role)) return <AccessDenied message="This report is for the owner and store managers." />;
  const params = await searchParams;
  const stores = (await getAccessibleStores(profile)).filter((store) => store.is_active);
  const store = stores.find((item) => item.id === params.store) ?? stores[0];
  if (!store) return <AccessDenied message="No store is assigned to you." />;
  const range = resolveRange(params, "month");
  const brand = params.brand?.trim().slice(0, 80) || "";
  const query = params.q?.trim().toLowerCase().slice(0, 60) || "";
  // Managers on a phone see pieces only, never rupees.
  const showMoney = !(await isLimitedView(profile));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sold_report", { p_brand: brand || undefined, p_from: range.startDate, p_store: store.id, p_to: range.endDate });
  const report = data as unknown as Report | null;
  const keep = { brand: brand || undefined, store: store.id };
  const href = (extra: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ end: range.endDate, start: range.startDate, store: store.id, ...extra })) if (value) search.set(key, value);
    return `/app/reports/sold?${search}`;
  };
  const match = (text: string) => !query || text.toLowerCase().includes(query);

  return (
    <div className="space-y-4">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-medium text-muted" href={brand ? href({ brand: undefined }) : "/app/reports"}>← {brand ? "All brands" : "Reports"}</Link>
        <h1 className="mt-2 text-3xl font-semibold">{brand ? brand : "What sold"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{brand ? "Items of this brand that sold (with sizes), and items in stock that did not sell in this period." : "Pieces sold in the period by brand, and what is still in stock without a sale. Tap a brand for its items and sizes."}</p>
        {stores.length > 1 ? (
          <nav className="mt-3 flex flex-wrap gap-2">
            {stores.map((item) => (
              <Link className={`rounded-full px-3 py-1.5 text-xs font-semibold ${item.id === store.id ? "bg-primary text-white" : "border border-border"}`} href={href({ brand: brand || undefined, store: item.id })} key={item.id}>{item.name}</Link>
            ))}
          </nav>
        ) : null}
      </section>

      <PeriodPicker keep={keep} path="/app/reports/sold" range={range} />

      {error || !report ? (
        <p className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm font-semibold text-danger">{error?.code === "P0001" ? error.message : "Could not load the report. Please try again."}</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Pieces sold" value={pcs(report.summary.sold)} />
            <Stat label="Bills" value={Number(report.summary.bills).toLocaleString("en-IN")} />
            {showMoney ? <Stat label="Sales" value={money(report.summary.net)} /> : <Stat label="Items sold" value={Number(report.summary.items).toLocaleString("en-IN")} />}
            <Stat label="In stock now" value={pcs(report.in_stock)} />
          </section>
          {report.snapshot_date ? <p className="text-xs text-muted">Stock now = stock report of {day(report.snapshot_date)} less pieces sold since. Sales: {rangeLabel(range)}.</p> : <p className="text-xs text-warning">No stock report uploaded for {store.name} yet, so stock shows 0.</p>}

          {brand ? (
            <>
              <form action="/app/reports/sold" className="relative">
                {Object.entries({ brand, end: range.endDate, start: range.startDate, store: store.id }).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input className="h-11 w-full rounded-2xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus:border-primary" defaultValue={params.q ?? ""} name="q" placeholder="Search an item of this brand" type="search" />
              </form>
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Sold ({(report.items ?? []).filter((item) => match(item.item)).length} items)</h2>
                {(report.items ?? []).filter((item) => match(item.item)).map((item) => (
                  <div className="rounded-2xl border border-border bg-card p-3 shadow-sm" key={item.item}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-semibold">{item.item}</p>
                      <p className="shrink-0 text-right text-sm font-semibold">{pcs(item.sold)}{showMoney ? <span className="block text-xs font-medium text-muted">{money(item.net)}</span> : null}</p>
                    </div>
                    <Sizes label="Sold" sizes={item.sizes_sold} tone="sold" />
                    <Sizes label="Left" sizes={item.sizes_left} tone="left" />
                    <p className="mt-1 text-xs text-muted">Last sold {day(item.last_sale)} · {item.bills} bill{Number(item.bills) === 1 ? "" : "s"}</p>
                  </div>
                ))}
                {!(report.items ?? []).length ? <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">Nothing of {brand} sold in this period.</p> : null}
              </section>
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">In stock, not sold ({(report.unsold ?? []).filter((item) => match(item.item)).length} items)</h2>
                {(report.unsold ?? []).filter((item) => match(item.item)).map((item) => (
                  <div className="rounded-2xl border border-border bg-card p-3" key={item.item}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-semibold">{item.item}</p>
                      <p className="shrink-0 text-sm font-semibold">{pcs(item.on_hand)}</p>
                    </div>
                    <Sizes label="In stock" sizes={item.sizes_left} tone="left" />
                    <p className="mt-1 text-xs text-muted">{item.last_sale ? `Last sold ${day(item.last_sale)}` : "No sale recorded yet"}{item.mrp ? ` · MRP ${money(item.mrp)}` : ""}</p>
                  </div>
                ))}
                {!(report.unsold ?? []).length ? <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">Every item of {brand} in stock sold at least once in this period.</p> : null}
              </section>
            </>
          ) : (
            <>
              <section className="rounded-[1.35rem] border border-border bg-card p-3 shadow-sm">
                <h2 className="px-1 pb-2 text-lg font-semibold">Brands</h2>
                <ul className="divide-y divide-border/60">
                  {report.brands.map((row) => (
                    <li key={row.brand}>
                      <Link className="flex items-center gap-3 px-1 py-2.5 text-sm active:bg-black/[0.03]" href={href({ brand: row.brand })}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{row.brand}</span>
                          <span className="block text-xs text-muted">{pcs(row.on_hand)} in stock{Number(row.unsold_items) ? ` · ${row.unsold_items} item${Number(row.unsold_items) === 1 ? "" : "s"} not sold (${pcs(row.unsold_pcs)})` : ""}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={`block font-semibold ${Number(row.sold) ? "" : "text-danger"}`}>{Number(row.sold) ? `${pcs(row.sold)} sold` : "none sold"}</span>
                          {showMoney && Number(row.net) ? <span className="block text-xs text-muted">{money(row.net)}</span> : null}
                        </span>
                        <span aria-hidden className="text-muted">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {!report.brands.length ? <p className="p-2 text-sm text-muted">No sales or stock yet.</p> : null}
              </section>
              {(report.top ?? []).length ? (
                <section className="rounded-[1.35rem] border border-border bg-card p-3 shadow-sm">
                  <h2 className="px-1 pb-2 text-lg font-semibold">Best sellers</h2>
                  <ol className="space-y-1 text-sm">
                    {(report.top ?? []).map((row, index) => (
                      <li className="flex items-center gap-3 px-1 py-1" key={`${row.brand}-${row.item}`}>
                        <span className="w-6 shrink-0 text-xs font-bold text-muted">{index + 1}</span>
                        <Link className="min-w-0 flex-1 truncate" href={href({ brand: row.brand })}><span className="font-medium">{row.item}</span> <span className="text-xs text-muted">{row.brand}</span></Link>
                        <span className="shrink-0 font-semibold">{pcs(row.sold)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Sizes({ label, sizes, tone }: { label: string; sizes: SizeQty[] | null; tone: "left" | "sold" }) {
  if (!sizes?.length) return tone === "left" ? <p className="mt-2 text-xs font-semibold text-danger">Nothing left in stock</p> : null;
  const sorted = [...sizes].sort((left, right) => compareSizes(left.size, right.size));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="w-14 text-xs text-muted">{label}</span>
      {sorted.map((size) => (
        <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${tone === "sold" ? "bg-primary-soft text-primary" : "bg-success/15 text-success"}`} key={size.size}>
          {size.size} × {Number(size.qty)}
        </span>
      ))}
    </div>
  );
}
