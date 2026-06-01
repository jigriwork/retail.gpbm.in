"use client";

import { useActionState } from "react";
import { Camera, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/auth/session";
import type { ReviewActionState } from "@/lib/reviews/actions";
import type { CleaningReview, RackReview, ReviewKind } from "@/lib/reviews/queries";
import { getIndiaToday } from "@/lib/tasks/dates";

type ReviewField = {
  name: string;
  label: string;
  hint: string;
};

const rackFields: ReviewField[] = [
  { name: "rack_arranged", label: "Racks arranged", hint: "Sections look store-ready." },
  { name: "sizes_arranged", label: "Sizes arranged", hint: "Size flow is easy to shop." },
  { name: "new_stock_displayed", label: "New stock displayed", hint: "Fresh stock is visible." },
  { name: "brand_display_proper", label: "Brand display proper", hint: "Brand blocks look clear." },
  { name: "dust_free", label: "Dust free", hint: "Racks and products are clean." },
  { name: "lighting_ok", label: "Lighting ok", hint: "Display lighting supports sales." },
  { name: "premium_display_ok", label: "Premium display ok", hint: "Key pieces look complete." },
];

const cleaningFields: ReviewField[] = [
  { name: "entry_clean", label: "Entry clean", hint: "First impression is clear." },
  { name: "floor_clean", label: "Floor clean", hint: "Customer path is clean." },
  { name: "trial_room_clean", label: "Trial room clean", hint: "Trial area feels ready." },
  { name: "billing_counter_clean", label: "Billing counter clean", hint: "Counter is organized." },
  { name: "racks_clean", label: "Racks clean", hint: "Racks are wiped and tidy." },
  { name: "mirrors_clean", label: "Mirrors clean", hint: "Mirrors are usable." },
  { name: "lights_working", label: "Lights working", hint: "No dull display areas." },
  { name: "ac_fan_working", label: "AC/fan working", hint: "Store comfort is okay." },
  { name: "staff_grooming_ok", label: "Staff grooming ok", hint: "Team presentation is sharp." },
  { name: "store_smell_fresh", label: "Store smell fresh", hint: "Store feels fresh." },
];

const initialState: ReviewActionState = {
  ok: false,
  message: "",
};

function fieldDefault(review: RackReview | CleaningReview | null, fieldName: string) {
  if (!review) {
    return false;
  }

  return Boolean((review as unknown as Record<string, unknown>)[fieldName]);
}

function submittedBy(review: RackReview | CleaningReview | null) {
  if (!review) {
    return null;
  }

  return review.reviewed_profile?.full_name ?? review.reviewed_profile?.email ?? "Submitted";
}

export function ReviewForm({
  action,
  defaultStoreId,
  existingReview,
  kind,
  stores,
}: {
  action: (previous: ReviewActionState, formData: FormData) => Promise<ReviewActionState>;
  defaultStoreId?: string;
  existingReview: RackReview | CleaningReview | null;
  kind: ReviewKind;
  stores: Store[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const fields = kind === "rack" ? rackFields : cleaningFields;
  const title = kind === "rack" ? "Rack review" : "Cleaning review";
  const reviewDate = existingReview?.review_date ?? getIndiaToday();
  const brandMark = stores.find((store) => store.id === defaultStoreId)?.code === "BM";

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Store</span>
          <select
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={defaultStoreId ?? stores[0]?.id ?? ""}
            name="storeId"
            required
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Review date</span>
          <input
            className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm outline-none focus:border-foreground"
            defaultValue={reviewDate}
            name="reviewDate"
            required
            type="date"
          />
        </label>
      </div>

      {existingReview ? (
        <div className="rounded-2xl border border-border bg-background p-4 text-sm leading-6 text-muted">
          Existing {title.toLowerCase()} found for this date. Submitted by{" "}
          <span className="font-semibold text-foreground">{submittedBy(existingReview)}</span>.
          Saving will update this review.
        </div>
      ) : null}

      <div className="rounded-[1.35rem] border border-border bg-card p-4">
        <h2 className="text-xl font-semibold">{title} checklist</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {kind === "rack"
            ? brandMark
              ? "Premium display, brand presentation, lighting and complete look matter most here."
              : "Keep racks practical, arranged, dust-free and ready for fast shopping."
            : brandMark
              ? "The store should feel polished from entry to trial room."
              : "Keep the full store clean, comfortable and ready for daily traffic."}
        </p>
        <div className="mt-4 grid gap-3">
          {fields.map((field) => (
            <label
              className="flex items-start gap-3 rounded-2xl border border-border p-4"
              key={field.name}
            >
              <input
                className="mt-1 size-5 accent-black"
                defaultChecked={fieldDefault(existingReview, field.name)}
                name={field.name}
                type="checkbox"
              />
              <span>
                <span className="block font-semibold">{field.label}</span>
                <span className="mt-1 block text-sm leading-5 text-muted">{field.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Remarks</span>
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-foreground"
          defaultValue={existingReview?.remarks ?? ""}
          name="remarks"
          placeholder="Optional store note"
        />
      </label>

      <label className="block rounded-[1.35rem] border border-dashed border-border bg-card p-5">
        <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Camera className="size-4" />
          Optional photo
        </span>
        <input
          accept="image/*"
          className="block w-full text-sm text-muted file:mr-4 file:h-10 file:rounded-xl file:border-0 file:bg-foreground file:px-4 file:text-sm file:font-semibold file:text-background"
          name="photo"
          type="file"
        />
        {existingReview?.photo_path ? (
          <span className="mt-3 block text-xs leading-5 text-muted">
            A photo is already attached. Uploading a new one will replace the stored path.
          </span>
        ) : null}
      </label>

      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}

      <Button disabled={pending} size="lg">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        {existingReview ? `Update ${title.toLowerCase()}` : `Submit ${title.toLowerCase()}`}
      </Button>
    </form>
  );
}
