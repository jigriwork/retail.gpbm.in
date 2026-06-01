import { getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";

export type ReviewKind = "rack" | "cleaning";

export type ReviewProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type RackReview = {
  id: string;
  store_id: string | null;
  reviewed_by: string | null;
  review_date: string | null;
  rack_arranged: boolean | null;
  sizes_arranged: boolean | null;
  new_stock_displayed: boolean | null;
  brand_display_proper: boolean | null;
  dust_free: boolean | null;
  lighting_ok: boolean | null;
  premium_display_ok: boolean | null;
  remarks: string | null;
  photo_path: string | null;
  created_at: string | null;
  reviewed_profile: ReviewProfile | null;
};

export type CleaningReview = {
  id: string;
  store_id: string | null;
  reviewed_by: string | null;
  review_date: string | null;
  entry_clean: boolean | null;
  floor_clean: boolean | null;
  trial_room_clean: boolean | null;
  billing_counter_clean: boolean | null;
  racks_clean: boolean | null;
  mirrors_clean: boolean | null;
  lights_working: boolean | null;
  ac_fan_working: boolean | null;
  staff_grooming_ok: boolean | null;
  store_smell_fresh: boolean | null;
  remarks: string | null;
  photo_path: string | null;
  created_at: string | null;
  reviewed_profile: ReviewProfile | null;
};

export type ReviewStatus = {
  store: { id: string; name: string; code: string; type?: string | null };
  today: string;
  rackReview: RackReview | null;
  cleaningReview: CleaningReview | null;
  recentRackReviews: RackReview[];
  recentCleaningReviews: CleaningReview[];
};

const rackSelect = `
  *,
  reviewed_profile:profiles!rack_reviews_reviewed_by_fkey(id,full_name,email)
`;

const cleaningSelect = `
  *,
  reviewed_profile:profiles!cleaning_reviews_reviewed_by_fkey(id,full_name,email)
`;

export async function getRackReview(storeId: string, reviewDate = getIndiaToday()) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rack_reviews")
    .select(rackSelect)
    .eq("store_id", storeId)
    .eq("review_date", reviewDate)
    .maybeSingle();

  return data as RackReview | null;
}

export async function getCleaningReview(storeId: string, reviewDate = getIndiaToday()) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cleaning_reviews")
    .select(cleaningSelect)
    .eq("store_id", storeId)
    .eq("review_date", reviewDate)
    .maybeSingle();

  return data as CleaningReview | null;
}

export async function getRecentRackReviews(storeId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rack_reviews")
    .select(rackSelect)
    .eq("store_id", storeId)
    .order("review_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as RackReview[];
}

export async function getRecentCleaningReviews(storeId: string, limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cleaning_reviews")
    .select(cleaningSelect)
    .eq("store_id", storeId)
    .order("review_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as CleaningReview[];
}

export async function getReviewStatuses(
  stores: Array<{ id: string; name: string; code: string; type?: string | null }>,
  reviewDate = getIndiaToday(),
) {
  return Promise.all(
    stores.map(async (store) => {
      const [rackReview, cleaningReview, recentRackReviews, recentCleaningReviews] =
        await Promise.all([
          getRackReview(store.id, reviewDate),
          getCleaningReview(store.id, reviewDate),
          getRecentRackReviews(store.id, 5),
          getRecentCleaningReviews(store.id, 5),
        ]);

      return {
        store,
        today: reviewDate,
        rackReview,
        cleaningReview,
        recentRackReviews,
        recentCleaningReviews,
      } satisfies ReviewStatus;
    }),
  );
}
