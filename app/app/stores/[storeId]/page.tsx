import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardList,
  MessageSquareText,
  PackageSearch,
  Shirt,
  Sparkles,
  SprayCan,
  UserRoundCheck,
} from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { StatusCard } from "@/components/app/status-card";
import { SalesReportList } from "@/components/reports/sales-report-list";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { createClient } from "@/lib/supabase/server";

const storeSections = [
  { title: "Stock", body: "Stock workspace placeholder.", icon: PackageSearch },
  { title: "Tasks", body: "Store task shell placeholder.", icon: ClipboardList },
  { title: "Rack Review", body: "Rack review placeholder.", icon: Shirt },
  { title: "Cleaning Review", body: "Cleaning review placeholder.", icon: SprayCan },
  { title: "Staff Sales", body: "Staff sales placeholder.", icon: UserRoundCheck },
  {
    title: "Manager Updates",
    body: "Manager update placeholder.",
    icon: MessageSquareText,
  },
];

function formatMoney(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value ?? 0);
}

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const { profile } = await requireProfile();
  const allowed = await canAccessStore(storeId, profile);

  if (!allowed) {
    return <AccessDenied message="This store is not assigned to your account." />;
  }

  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) {
    notFound();
  }

  const [salesStatus] = await getStoreSalesStatuses([
    { id: store.id, name: store.name, code: store.code },
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">Store detail</p>
            <h1 className="mt-2 text-3xl font-semibold">{store.name}</h1>
          </div>
          <Sparkles className="size-5 text-muted" />
        </div>
        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Code</p>
            <p className="mt-1 font-semibold">{store.code}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Type</p>
            <p className="mt-1 font-semibold capitalize">{store.type ?? "store"}</p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-muted">Target</p>
            <p className="mt-1 font-semibold">
              {store.monthly_target_enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        </div>
      </section>

      {salesStatus ? (
        <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Sales</p>
              <h2 className="mt-2 text-2xl font-semibold">Daily sales status</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Yesterday sales report for {salesStatus.yesterdayDate}:{" "}
                <span
                  className={
                    salesStatus.yesterdayReport
                      ? "font-semibold text-success"
                      : "font-semibold text-danger"
                  }
                >
                  {salesStatus.yesterdayReport ? "uploaded" : "missing"}
                </span>
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-black/85"
              href={`/app/reports/sales?storeId=${store.id}`}
            >
              Upload sales
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Last uploaded date</p>
              <p className="mt-1 font-semibold">
                {salesStatus.latestReport?.report_date ?? "No upload"}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Latest total sale</p>
              <p className="mt-1 font-semibold">
                {formatMoney(salesStatus.latestReport?.summary?.totalNetSale)}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-3">
              <p className="text-xs font-medium text-muted">Latest rows</p>
              <p className="mt-1 font-semibold">
                {salesStatus.latestReport?.row_count ?? 0}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-lg font-semibold">Recent sales reports</h3>
            <SalesReportList
              emptyText="No sales reports uploaded for this store yet."
              reports={salesStatus.recentReports}
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {storeSections.map((section) => (
          <StatusCard {...section} key={section.title} />
        ))}
      </section>
    </div>
  );
}
