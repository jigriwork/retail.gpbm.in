import Link from "next/link";
import { Shirt, SprayCan } from "lucide-react";

import { ReviewStatusCard } from "@/components/reviews/review-status-card";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getReviewStatuses } from "@/lib/reviews/queries";

export default async function ReviewsPage() {
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const statuses = await getReviewStatuses(stores);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Reviews</p>
        <h1 className="mt-2 text-3xl font-semibold">Store discipline</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Complete daily rack/display and cleaning reviews for active stores.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
          href="/app/reviews/rack"
        >
          <Shirt className="mb-5 size-5 text-muted" />
          <h2 className="text-2xl font-semibold">Rack Review</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Arrangement, display, dust, lighting and premium presentation.
          </p>
        </Link>
        <Link
          className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm transition hover:border-foreground"
          href="/app/reviews/cleaning"
        >
          <SprayCan className="mb-5 size-5 text-muted" />
          <h2 className="text-2xl font-semibold">Cleaning Review</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Entry, floor, trial room, counters, mirrors, comfort and grooming.
          </p>
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Today rack status</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {statuses.map((status) => (
            <ReviewStatusCard
              href={`/app/reviews/rack?storeId=${status.store.id}`}
              key={`rack-${status.store.id}`}
              review={status.rackReview}
              storeName={status.store.name}
              title="Rack review"
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Today cleaning status</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {statuses.map((status) => (
            <ReviewStatusCard
              href={`/app/reviews/cleaning?storeId=${status.store.id}`}
              key={`cleaning-${status.store.id}`}
              review={status.cleaningReview}
              storeName={status.store.name}
              title="Cleaning review"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
