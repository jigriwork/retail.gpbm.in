import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardList,
  MessageSquareText,
  PackageSearch,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { StatusCard } from "@/components/app/status-card";
import { SalesReportList } from "@/components/reports/sales-report-list";
import { ReviewHistoryList } from "@/components/reviews/review-history-list";
import { ReviewStatusCard } from "@/components/reviews/review-status-card";
import { canAccessStore, requireProfile } from "@/lib/auth/session";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { getReviewStatuses } from "@/lib/reviews/queries";
import { createClient } from "@/lib/supabase/server";

const storeSections = [
  { title: "Stock", body: "Stock workspace placeholder.", icon: PackageSearch },
  { title: "Tasks", body: "Store task shell placeholder.", icon: ClipboardList },
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

  const [salesStatuses, reviewStatuses] = await Promise.all([
    getStoreSalesStatuses([{ id: store.id, name: store.name, code: store.code }]),
    getReviewStatuses([{ id: store.id, name: store.name, code: store.code, type: store.type }]),
  ]);
  const [salesStatus] = salesStatuses;
  const [reviewStatus] = reviewStatuses;

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

      {reviewStatus ? (
        <section className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <ReviewStatusCard
              href={`/app/reviews/rack?storeId=${store.id}`}
              review={reviewStatus.rackReview}
              storeName={store.name}
              title="Today rack review"
            />
            <ReviewStatusCard
              href={`/app/reviews/cleaning?storeId=${store.id}`}
              review={reviewStatus.cleaningReview}
              storeName={store.name}
              title="Today cleaning review"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Recent rack reviews</h3>
              <ReviewHistoryList
                emptyText="No rack reviews submitted for this store yet."
                reviews={reviewStatus.recentRackReviews}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Recent cleaning reviews</h3>
              <ReviewHistoryList
                emptyText="No cleaning reviews submitted for this store yet."
                reviews={reviewStatus.recentCleaningReviews}
              />
            </div>
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
