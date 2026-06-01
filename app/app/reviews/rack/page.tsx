import Link from "next/link";

import { ReviewForm } from "@/components/reviews/review-form";
import { saveRackReview } from "@/lib/reviews/actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getRackReview } from "@/lib/reviews/queries";
import { getIndiaToday } from "@/lib/tasks/dates";

export default async function RackReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; date?: string }>;
}) {
  const { storeId, date } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const defaultStoreId = stores.some((store) => store.id === storeId) ? storeId : stores[0]?.id;
  const reviewDate = date ?? getIndiaToday();
  const existingReview = defaultStoreId ? await getRackReview(defaultStoreId, reviewDate) : null;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reviews">
          Back to reviews
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Rack review</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Go Planet needs practical rack readiness. Brand Mark needs premium display and complete presentation.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {stores.length ? (
          <ReviewForm
            action={saveRackReview}
            defaultStoreId={defaultStoreId}
            existingReview={existingReview}
            kind="rack"
            stores={stores}
          />
        ) : (
          <p className="text-sm leading-6 text-muted">
            No active assigned store is available for rack review.
          </p>
        )}
      </section>
    </div>
  );
}
