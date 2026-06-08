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

function storeLabel(profileRole: string | null | undefined, storeName?: string) {
  if (!storeName) {
    return profileRole === "owner" ? "All" : "All assigned stores";
  }

  return storeName;
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
  const totalSales = staffRows.reduce((sum, staff) => sum + staff.totalSale, 0);
  const totalQuantity = staffRows.reduce((sum, staff) => sum + staff.quantitySold, 0);
  const totalBills = staffRows.reduce((sum, staff) => sum + staff.billCount, 0);
  const totalReturns = staffRows.reduce((sum, staff) => sum + staff.returnAmount, 0);

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reports">
          Back to reports
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Staff wise sales</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          All staff sales from uploaded sales rows, combined through active staff aliases.
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
              <option value="all">{storeLabel(profile?.role)}</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {storeLabel(profile?.role, store.name)}
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
            <p className="mt-2 text-sm text-muted">
              Showing {selectedStores.map((store) => store.name).join(", ") || "no active stores"}.
            </p>
          </div>
          <UserRoundCheck className="size-5 text-muted" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Staff</p>
            <p className="mt-1 text-xl font-semibold">{staffRows.length}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Total Sales</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(totalSales)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Quantity</p>
            <p className="mt-1 text-xl font-semibold">{formatNumber(totalQuantity)}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Distinct Bills</p>
            <p className="mt-1 text-xl font-semibold">{totalBills}</p>
          </div>
        </div>
        {totalReturns > 0 ? (
          <p className="mt-3 text-sm font-medium text-muted">
            Return amount found in negative sales rows: {formatMoney(totalReturns)}
          </p>
        ) : null}
      </section>

      {staffRows.length ? (
        <section className="overflow-hidden rounded-[1.35rem] border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Staff Name</th>
                  <th className="px-4 py-3 font-semibold">Total Sales</th>
                  <th className="px-4 py-3 font-semibold">Quantity</th>
                  <th className="px-4 py-3 font-semibold">Distinct Bills</th>
                  <th className="px-4 py-3 font-semibold">Average Bill Value</th>
                  <th className="px-4 py-3 font-semibold">Return Amount</th>
                  <th className="px-4 py-3 font-semibold">Top Brand</th>
                  <th className="px-4 py-3 font-semibold">Top Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staffRows.map((staff, index) => (
                  <tr key={staff.staffName}>
                    <td className="px-4 py-4 font-semibold">
                      {index + 1}. {staff.staffName}
                      {staff.sourceBreakdown.length > 1 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {staff.sourceBreakdown.map((source) => (
                            <span
                              className="rounded-full border border-border px-2 py-1 text-xs font-medium text-muted"
                              key={source.sourceName}
                            >
                              {source.sourceName}: {formatMoney(source.totalSale)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-semibold">{formatMoney(staff.totalSale)}</td>
                    <td className="px-4 py-4">{formatNumber(staff.quantitySold)}</td>
                    <td className="px-4 py-4">{staff.billCount}</td>
                    <td className="px-4 py-4">{formatMoney(staff.averageBillValue)}</td>
                    <td className="px-4 py-4">{formatMoney(staff.returnAmount)}</td>
                    <td className="px-4 py-4">{staff.topBrand ?? "No brand"}</td>
                    <td className="px-4 py-4">{staff.topCategory ?? "No category"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
