import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { ReceivableStatusActions, SyncNegativePayslipsButton } from "@/components/payslips/receivables-actions";
import { requireProfile } from "@/lib/auth/session";
import {
  computeReceivableSummary,
  getAvailableReceivableMonths,
  getReceivables,
} from "@/lib/payslips/receivables-queries";
import { formatMoney, formatMonth } from "@/lib/payslips/utils";
import { createClient } from "@/lib/supabase/server";

function statusBadge(status: string | null) {
  const s = status ?? "pending";
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    partial: "bg-orange-100 text-orange-800",
    received: "bg-green-100 text-green-800",
    waived: "bg-gray-100 text-gray-600",
    disputed: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${colors[s] ?? "bg-gray-100 text-gray-600"}`}>
      {s}
    </span>
  );
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; store?: string; status?: string; search?: string }>;
}) {
  const { profile } = await requireProfile();

  if (profile?.role !== "owner") {
    return <AccessDenied message="Salary receivables are reserved for the owner account." />;
  }

  const params = await searchParams;
  const availableMonths = await getAvailableReceivableMonths();
  const selectedMonth = params.month ?? availableMonths[0] ?? "";

  // Get active stores for filter
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id,name,code")
    .eq("is_active", true)
    .in("code", ["GP", "BM"])
    .order("name");

  const activeStores = stores ?? [];

  const rows = selectedMonth
    ? await getReceivables({
        salaryMonth: selectedMonth,
        storeId: params.store || undefined,
        status: params.status || undefined,
        search: params.search || undefined,
      })
    : [];

  // Also get unfiltered rows for accurate month summary
  const allMonthRows = selectedMonth
    ? await getReceivables({ salaryMonth: selectedMonth })
    : [];
  const summary = computeReceivableSummary(allMonthRows);

  // Build filter URLs
  function filterUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const month = overrides.month ?? selectedMonth;
    if (month) p.set("month", month);
    const store = "store" in overrides ? overrides.store : params.store;
    if (store) p.set("store", store);
    const status = "status" in overrides ? overrides.status : params.status;
    if (status) p.set("status", status);
    const search = "search" in overrides ? overrides.search : params.search;
    if (search) p.set("search", search);
    return `/app/payslips/receivables?${p.toString()}`;
  }

  const statusOptions = [
    { label: "All", value: "" },
    { label: "Pending", value: "pending" },
    { label: "Partial", value: "partial" },
    { label: "Received", value: "received" },
    { label: "Waived", value: "waived" },
    { label: "Disputed", value: "disputed" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link className="inline-flex items-center gap-1 text-sm font-semibold text-muted" href="/app/payslips">
              <ArrowLeft className="size-4" />
              Back to payslips
            </Link>
            <h1 className="mt-2 text-3xl font-semibold">Salary Receivables</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Staff who owe us money from negative payslips. Track month-wise.
            </p>
          </div>
          <SyncNegativePayslipsButton />
        </div>
      </section>

      {/* Filters */}
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          {/* Month selector */}
          <div>
            <label className="block text-xs font-medium text-muted" htmlFor="month-select">
              Salary Month
            </label>
            {availableMonths.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {availableMonths.map((month) => (
                  <Link
                    className={
                      selectedMonth === month
                        ? "inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background"
                        : "inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                    }
                    href={filterUrl({ month, store: undefined, status: undefined, search: undefined })}
                    key={month}
                  >
                    {formatMonth(month)}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">No months available. Upload salary sheets or sync.</p>
            )}
          </div>
        </div>

        {selectedMonth ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {/* Store filter */}
            <div className="flex flex-wrap gap-1">
              <Link
                className={
                  !params.store
                    ? "inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background"
                    : "inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                }
                href={filterUrl({ store: undefined })}
              >
                All Stores
              </Link>
              {activeStores.map((store) => (
                <Link
                  className={
                    params.store === store.id
                      ? "inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background"
                      : "inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                  }
                  href={filterUrl({ store: store.id })}
                  key={store.id}
                >
                  {store.name}
                </Link>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap gap-1">
              {statusOptions.map((opt) => (
                <Link
                  className={
                    (params.status ?? "") === opt.value
                      ? "inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-semibold text-background"
                      : "inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                  }
                  href={filterUrl({ status: opt.value || undefined })}
                  key={opt.value}
                >
                  {opt.label}
                </Link>
              ))}
            </div>

            {/* Search */}
            <form action="/app/payslips/receivables" className="flex items-end gap-2">
              <input name="month" type="hidden" value={selectedMonth} />
              {params.store ? <input name="store" type="hidden" value={params.store} /> : null}
              {params.status ? <input name="status" type="hidden" value={params.status} /> : null}
              <input
                className="h-9 w-48 rounded-xl border border-border px-3 text-sm"
                defaultValue={params.search ?? ""}
                name="search"
                placeholder="Search staff name…"
                type="text"
              />
              <button
                className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                type="submit"
              >
                Search
              </button>
              {params.search ? (
                <Link
                  className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-xs font-semibold text-danger transition hover:bg-black/[0.03]"
                  href={filterUrl({ search: undefined })}
                >
                  Clear
                </Link>
              ) : null}
            </form>
          </div>
        ) : null}
      </section>

      {/* Summary cards */}
      {selectedMonth ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">
            {formatMonth(selectedMonth)} — Receivable Summary
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Total Receivable</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(summary.totalReceivable)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Pending Receivable</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{formatMoney(summary.pendingReceivable)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Received Amount</p>
              <p className="mt-1 text-2xl font-semibold text-success">{formatMoney(summary.receivedAmount)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Balance Amount</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(summary.balanceAmount)}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Staff Count</p>
              <p className="mt-1 text-2xl font-semibold">{summary.staffCount}</p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Pending Staff</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{summary.pendingStaffCount}</p>
            </div>
            {summary.storeTotals.map((store) => (
              <div className="rounded-2xl border border-border p-3" key={store.storeId}>
                <p className="text-xs font-medium text-muted">{store.storeName}</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(store.total)}</p>
                <p className="text-xs text-muted">Balance {formatMoney(store.balance)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Receivables list */}
      {selectedMonth ? (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">
            Staff will pay us — {formatMonth(selectedMonth)}
            <span className="ml-2 text-sm font-medium text-muted">
              ({rows.length} record{rows.length === 1 ? "" : "s"})
            </span>
          </h2>

          {rows.length ? (
            rows.map((row) => {
              // Warn if net_payable is no longer negative
              const noLongerNegative = row.net_payable >= 0;

              return (
                <div className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm" key={row.id}>
                  {noLongerNegative ? (
                    <div className="mb-3 rounded-xl border border-warning bg-yellow-50 px-3 py-2 text-sm text-warning">
                      ⚠ Payslip amount is no longer negative. Please review.
                    </div>
                  ) : null}
                  <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_0.8fr]">
                    <div>
                      <p className="text-lg font-semibold">{row.staff_name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {row.store_name ?? "Unknown store"} | {row.firm_name ?? "Unknown firm"}
                      </p>
                      <p className="mt-1 text-xs text-muted">{formatMonth(row.salary_month)}</p>
                    </div>
                    <div className="text-sm">
                      <p>Net Payable <span className="font-semibold text-danger">{formatMoney(row.net_payable)}</span></p>
                      <p>Amount Receivable <span className="font-semibold">{formatMoney(row.receivable_amount)}</span></p>
                      <p>Received <span className="font-semibold text-success">{formatMoney(row.received_amount ?? 0)}</span></p>
                      <p>Balance <span className="font-semibold">{formatMoney(row.balance_amount)}</span></p>
                    </div>
                    <div>
                      <div className="mb-2">{statusBadge(row.status)}</div>
                      {row.note ? (
                        <p className="text-xs text-muted">Note: {row.note}</p>
                      ) : null}
                      {row.received_at ? (
                        <p className="text-xs text-muted">
                          Last payment: {new Date(row.received_at).toLocaleDateString("en-IN")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      {row.generated_payslip_id && row.batch_id && row.payslip_row_id ? (
                        <Link
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border px-3 text-xs font-semibold transition hover:bg-black/[0.03]"
                          href={`/app/payslips/${row.batch_id}/rows/${row.payslip_row_id}`}
                        >
                          <Eye className="size-3" />
                          View Payslip
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    <ReceivableStatusActions
                      currentStatus={row.status}
                      receivableAmount={row.receivable_amount}
                      receivableId={row.id}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm text-muted shadow-sm">
              No receivables found for this month and filter selection.
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 text-sm text-muted shadow-sm">
          No salary months available. Upload a salary sheet and generate payslips first, then sync.
        </section>
      )}
    </div>
  );
}
