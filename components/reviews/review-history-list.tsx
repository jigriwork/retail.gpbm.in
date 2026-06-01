import type { CleaningReview, RackReview } from "@/lib/reviews/queries";

function submitter(review: RackReview | CleaningReview) {
  return review.reviewed_profile?.full_name ?? review.reviewed_profile?.email ?? "Submitted";
}

export function ReviewHistoryList({
  reviews,
  emptyText,
}: {
  reviews: Array<RackReview | CleaningReview>;
  emptyText: string;
}) {
  if (!reviews.length) {
    return (
      <div className="rounded-[1.35rem] border border-border bg-card p-5 text-sm leading-6 text-muted shadow-sm">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <article
          className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm"
          key={review.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{review.review_date ?? "No date"}</p>
              <p className="mt-1 text-sm text-muted">{submitter(review)}</p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-success">
              Done
            </span>
          </div>
          {review.remarks ? (
            <p className="mt-3 text-sm leading-6 text-muted">{review.remarks}</p>
          ) : null}
          {review.photo_path ? (
            <p className="mt-3 text-xs font-medium text-muted">Photo attached</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
