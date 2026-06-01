import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, ClipboardCheck, ListTodo, MessageSquareText, PackageSearch } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
import { getDefaultWeeklyAuditRange, getStoreWeeklyAuditSummary } from "@/lib/audit/weekly";
import { createClient } from "@/lib/supabase/server";

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

function formatNumber(value?: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value ?? 0);
}

function RankingList({
  items,
}: {
  items: Array<{ name: string; totalSale: number; quantity: number }>;
}) {
  if (!items.length) return <p className="text-sm leading-6 text-muted">No data found.</p>;

  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((item, index) => (
        <div className="rounded-2xl border border-border p-3" key={item.name}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">
              {index + 1}. {item.name}
            </p>
            <div className="text-right">
              <p className="font-semibold">{formatMoney(item.totalSale)}</p>
              <p className="text-xs font-medium text-muted">Qty {formatNumber(item.quantity)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function StoreAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ mode?: string; week?: string }>;
}) {
  const { storeId } = await params;
  const { mode, week } = await searchParams;
  const { profile } = await requireProfile();
  const allowed = await canAccessStore(storeId, profile);

  if (!allowed) {
    return <AccessDenied message="This weekly audit is not assigned to your account." />;
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .eq("is_active", true)
    .maybeSingle();

  if (!store) {
    notFound();
  }

  const weekRange = getDefaultWeeklyAuditRange(mode, week);
  const audit = await getStoreWeeklyAuditSummary(store, weekRange);

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/audit">
          Back to audit
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{store.name} weekly audit</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {weekRange.startDate} to {weekRange.endDate}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total sale", formatMoney(audit.sales.totalNetSale)],
          ["Quantity", formatNumber(audit.sales.totalQuantity)],
          ["Bill count", String(audit.sales.billCount)],
          ["Average bill", formatMoney(audit.sales.averageBillValue)],
        ].map(([label, value]) => (
          <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={label}>
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Daily sale breakdown</h2>
            <BarChart3 className="size-5 text-muted" />
          </div>
          <div className="space-y-3">
            {audit.sales.dailyTrend.map((day) => (
              <div className="rounded-2xl border border-border p-3" key={day.date}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{day.date}</p>
                  <p className="font-semibold">{formatMoney(day.totalSale)}</p>
                </div>
              </div>
            ))}
          </div>
          {audit.missingSalesReports.length ? (
            <p className="mt-4 text-sm leading-6 text-danger">
              Missing sales report days: {audit.missingSalesReports.map((item) => item.date).join(", ")}
            </p>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">No missing sales reports.</p>
          )}
        </div>

        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Staff summary</h2>
          {audit.staff.length ? (
            <div className="space-y-2">
              {audit.staff.slice(0, 5).map((staff) => (
                <div className="rounded-2xl border border-border p-3" key={staff.staffName}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{staff.staffName}</p>
                      <p className="mt-1 text-xs font-medium text-muted">
                        Bills {staff.billCount} · Avg {formatMoney(staff.averageBillValue)}
                      </p>
                    </div>
                    <p className="font-semibold">{formatMoney(staff.totalSale)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">No staff names were found in uploaded reports.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Top categories</h2>
          <RankingList items={audit.sales.topCategories} />
        </div>
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Top brands</h2>
          <RankingList items={audit.sales.topBrands} />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Store discipline</h2>
          <ClipboardCheck className="size-5 text-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Rack reviews</p>
            <p className="mt-1 text-xl font-semibold">{audit.reviews.rackCompletedDays}/7</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Cleaning reviews</p>
            <p className="mt-1 text-xl font-semibold">{audit.reviews.cleaningCompletedDays}/7</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Manager update days</p>
            <p className="mt-1 text-xl font-semibold">{audit.checklist.managerUpdateDays}/7</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Checklist estimate</p>
            <p className="mt-1 text-xl font-semibold">{audit.checklist.estimatedCompletionPercent}%</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Manager updates</h2>
            <MessageSquareText className="size-5 text-muted" />
          </div>
          <p className="text-sm leading-6 text-muted">
            Created {audit.updates.createdCount}, resolved {audit.updates.resolvedCount}, open urgent{" "}
            {audit.updates.openUrgentCount}.
          </p>
          <div className="mt-4 space-y-2">
            {audit.updates.latestImportant.length ? (
              audit.updates.latestImportant.map((update) => (
                <div className="rounded-2xl border border-border p-3" key={update.id}>
                  <p className="font-semibold">{update.title}</p>
                  <p className="mt-1 text-xs font-medium text-muted">{update.urgency ?? "normal"}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-muted">No important updates this week.</p>
            )}
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Tasks</h2>
            <ListTodo className="size-5 text-muted" />
          </div>
          <p className="text-sm leading-6 text-muted">
            Created {audit.tasks.createdCount}, completed {audit.tasks.completedCount}, overdue/pending{" "}
            {audit.tasks.overduePendingCount}.
          </p>
        </div>

        <div className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Stock signals</h2>
            <PackageSearch className="size-5 text-muted" />
          </div>
          <div className="space-y-2 text-sm leading-6 text-muted">
            <p>Stock month: {audit.stockSignals.stockMonth ?? "No stock report"}</p>
            <p>Slow stock: {audit.stockSignals.slowStockCount}</p>
            <p>Dead stock: {audit.stockSignals.deadStockCount}</p>
            <p>Fast low stock: {audit.stockSignals.fastMovingLowStockCount}</p>
            <p>High stock low sale: {audit.stockSignals.highStockLowSaleCount}</p>
          </div>
          <Link
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
            href={`/app/reports/stock/analytics?storeId=${store.id}`}
          >
            Open stock analytics
          </Link>
        </div>
      </section>
    </div>
  );
}
