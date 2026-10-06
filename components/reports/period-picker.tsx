import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { type PickedRange, rangeLabel, rangePresets, type RangePreset } from "@/lib/reports/period";

/**
 * Quick periods (one tap) and From/To dates (always visible). `keep` carries
 * the page's other filters (store, brand…); `children` adds more fields to
 * the dates form, e.g. a store choice.
 */
export function PeriodPicker({ children, keep = {}, path, presets, range }: {
  children?: React.ReactNode;
  keep?: Record<string, string | undefined>;
  path: string;
  presets?: RangePreset[];
  range: PickedRange;
}) {
  const kept = Object.entries(keep).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const shown = presets ? rangePresets.filter((item) => presets.includes(item.value)) : rangePresets;
  return (
    <section className="space-y-3 rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-primary" /> {rangeLabel(range)}</p>
      <nav aria-label="Period" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {shown.map((item) => (
          <Link
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${range.preset === item.value ? "bg-primary text-white" : "border border-border bg-background"}`}
            href={`${path}?${new URLSearchParams([...kept, ["period", item.value]])}`}
            key={item.value}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form action={path} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        {kept.filter(([name]) => !["start", "end", "period"].includes(name)).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
        {children}
        <label className="block text-xs font-medium text-muted">From
          <input className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" defaultValue={range.startDate} name="start" type="date" />
        </label>
        <label className="block text-xs font-medium text-muted">To
          <input className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" defaultValue={range.endDate} name="end" type="date" />
        </label>
        <button className="col-span-2 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white sm:col-span-1" type="submit">Show</button>
      </form>
    </section>
  );
}
