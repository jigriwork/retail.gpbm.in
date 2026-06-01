import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";

import type { CleaningReview, RackReview } from "@/lib/reviews/queries";

function displayTime(value: string | null) {
  if (!value) {
    return "No time";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function submitter(review: RackReview | CleaningReview | null) {
  if (!review) {
    return "Not submitted";
  }

  return review.reviewed_profile?.full_name ?? review.reviewed_profile?.email ?? "Submitted";
}

export function ReviewStatusCard({
  href,
  review,
  storeName,
  title,
}: {
  href: string;
  review: RackReview | CleaningReview | null;
  storeName: string;
  title: string;
}) {
  const done = Boolean(review);

  return (
    <article className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{storeName}</p>
          <p className="mt-1 text-sm text-muted">{title}</p>
        </div>
        <span
          className={
            done
              ? "inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-success"
              : "inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-danger"
          }
        >
          {done ? <CheckCircle2 className="size-3" /> : <CircleAlert className="size-3" />}
          {done ? "Done" : "Missing"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Submitted by</p>
          <p className="mt-1 font-semibold">{submitter(review)}</p>
        </div>
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs font-medium text-muted">Submitted time</p>
          <p className="mt-1 font-semibold">{displayTime(review?.created_at ?? null)}</p>
        </div>
      </div>
      <Link
        className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
        href={href}
      >
        {done ? "Review" : "Submit"}
      </Link>
    </article>
  );
}
