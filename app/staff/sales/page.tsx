import { PeriodPicker } from "@/components/reports/period-picker";
import { resolveRange } from "@/lib/reports/period";
import { getMySalesSummary } from "@/lib/staff/portal";

function money(value: number) { return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value); }

export default async function MySalesPage({ searchParams }: { searchParams: Promise<{ end?: string; period?: string; start?: string }> }) {
  const range = resolveRange(await searchParams, "month", { maxDays: 366 });
  const sales = await getMySalesSummary(range.startDate, range.endDate);
  const days = [...sales.daily].sort((left, right) => right.sale_date.localeCompare(left.sale_date));
  const average = sales.summary.bill_count ? sales.summary.value / sales.summary.bill_count : 0;
  return (
    <div className="space-y-5">
      <div><p className="text-sm font-medium text-muted">Private</p><h1 className="mt-2 text-3xl font-semibold">My Sales</h1></div>
      {!sales.linkage_verified ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
          <p className="font-semibold text-warning">Your sales name is not linked yet</p>
          <p className="mt-2 text-sm leading-6 text-muted">Ask the manager or owner to match your name on the sales bills under Staff → Match staff names.</p>
        </div>
      ) : (
        <>
          <PeriodPicker path="/staff/sales" presets={["today", "yesterday", "week", "month", "last-month", "last30"]} range={range} />
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sales" value={money(sales.summary.value)} />
            <Stat label="Bills" value={String(sales.summary.bill_count)} />
            <Stat label="Pieces" value={String(Number(sales.summary.quantity))} />
            <Stat label="Average bill" value={money(average)} />
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Day by day</h2>
            {days.length ? days.map((day) => (
              <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4" key={day.sale_date}>
                <div>
                  <p className="font-semibold">{new Date(`${day.sale_date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" })}</p>
                  <p className="text-xs text-muted">{day.bill_count} bills · {Number(day.quantity)} pcs</p>
                </div>
                <p className="font-semibold">{money(day.value)}</p>
              </div>
            )) : <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">No sales in this period.</p>}
          </section>
          <p className="text-xs text-muted">Each day&apos;s sales appear after the store uploads that day&apos;s sales report (usually the same night).</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
