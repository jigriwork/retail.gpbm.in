import Link from "next/link";
import { UserRoundCheck } from "lucide-react";

import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import {
  getDateRangeForPeriod,
  getStaffSalesSummary,
  type SalesPeriod,
} from "@/lib/analytics/sales";

const periodLabels: Array<{ value: SalesPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

function formatNumber(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function safePeriod(value?: string): SalesPeriod {
  return periodLabels.some((period) => period.value === value) ? (value as SalesPeriod) : "yesterday";
}

export default async function StaffSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; period?: string }>;
}) {
  const { storeId, period: rawPeriod } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const period = safePeriod(rawPeriod);
  const dateRange = getDateRangeForPeriod(period);
  const selectedStores =
    storeId && stores.some((store) => store.id === storeId)
      ? stores.filter((store) => store.id === storeId)
      : stores;
  const staffRows = await getStaffSalesSummary({
    storeIds: selectedStores.map((store) => store.id),
    dateRange,
  });

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Staff wise sales</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Ranking by uploaded sales rows with bill count, quantity and staff leaders.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Store</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={storeId ?? "all"}
              name="storeId"
            >
              <option value="all">All accessible stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">Period</span>
            <select
              className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
              defaultValue={period}
              name="period"
            >
              {periodLabels.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className="mt-7 h-12 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85">
            Apply
          </button>
        </form>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Period</p>
            <h2 className="mt-2 text-2xl font-semibold">
              {dateRange.startDate} to {dateRange.endDate}
            </h2>
          </div>
          <UserRoundCheck className="size-5 text-muted" />
        </div>
      </section>

      {staffRows.length ? (
        <section className="space-y-3">
          {staffRows.map((staff, index) => (
            <article
              className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm"
              key={staff.staffName}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-semibold">
                    {index + 1}. {staff.staffName}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {staff.topCategory ? `Top category: ${staff.topCategory}` : "No category found"}
                  </p>
                </div>
                <p className="text-2xl font-semibold">{formatMoney(staff.totalSale)}</p>
              </div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Bills</p>
                  <p className="mt-1 font-semibold">{staff.billCount}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Quantity</p>
                  <p className="mt-1 font-semibold">{formatNumber(staff.quantitySold)}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Average bill</p>
                  <p className="mt-1 font-semibold">{formatMoney(staff.averageBillValue)}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Top brand</p>
                  <p className="mt-1 font-semibold">{staff.topBrand ?? "No brand"}</p>
                </div>
                <div className="rounded-2xl border border-border p-3">
                  <p className="text-xs font-medium text-muted">Top category</p>
                  <p className="mt-1 font-semibold">{staff.topCategory ?? "No category"}</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-[1.35rem] border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-2xl font-semibold">Staff names were not found in uploaded reports.</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Staff-wise sales will appear when uploaded sales files include a staff column.
          </p>
        </section>
      )}
    </div>
  );
}
