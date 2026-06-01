import Link from "next/link";

import { ReviewForm } from "@/components/reviews/review-form";
import { saveCleaningReview } from "@/lib/reviews/actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getCleaningReview } from "@/lib/reviews/queries";
import { getIndiaToday } from "@/lib/tasks/dates";

export default async function CleaningReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; date?: string }>;
}) {
  const { storeId, date } = await searchParams;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const defaultStoreId = stores.some((store) => store.id === storeId) ? storeId : stores[0]?.id;
  const reviewDate = date ?? getIndiaToday();
  const existingReview = defaultStoreId
    ? await getCleaningReview(defaultStoreId, reviewDate)
    : null;

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/reviews">
          Back to reviews
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Cleaning review</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Keep the store clean, comfortable, fresh and ready for customers.
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        {stores.length ? (
          <ReviewForm
            action={saveCleaningReview}
            defaultStoreId={defaultStoreId}
            existingReview={existingReview}
            kind="cleaning"
            stores={stores}
          />
        ) : (
          <p className="text-sm leading-6 text-muted">
            No active assigned store is available for cleaning review.
          </p>
        )}
      </section>
    </div>
  );
}
