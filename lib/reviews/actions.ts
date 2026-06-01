"use server";

import { revalidatePath } from "next/cache";

import { canAccessStore, getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getIndiaToday } from "@/lib/tasks/dates";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export type ReviewActionState = {
  ok: boolean;
  message: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value || null;
}

function readBoolean(formData: FormData, key: string) {
  return readString(formData, key) === "on";
}

function slugFileName(fileName: string) {
  const clean = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "review-photo";
}

async function validateReviewAccess(storeId: string) {
  const { profile } = await requireProfile();

  if (!profile || profile.is_active === false) {
    return { ok: false as const, message: "Your account is not active.", profile: null, store: null };
  }

  if (!storeId) {
    return { ok: false as const, message: "Choose a store.", profile, store: null };
  }

  if (profile.role !== "owner" && !(await canAccessStore(storeId, profile))) {
    return {
      ok: false as const,
      message: "You can submit reviews only for your assigned store.",
      profile,
      store: null,
    };
  }

  const stores = await getAccessibleStores(profile);
  const store = stores.find((item) => item.id === storeId);

  if (!store || store.is_active === false) {
    return {
      ok: false as const,
      message: "Choose an active Go Planet or Brand Mark store.",
      profile,
      store: null,
    };
  }

  return { ok: true as const, profile, store };
}

async function uploadReviewPhoto(
  bucketFolder: "rack" | "cleaning",
  storeCode: string,
  reviewDate: string,
  file: FormDataEntryValue | null,
) {
  if (!(file instanceof File) || file.size === 0) {
    return { path: null, error: null };
  }

  const supabase = await createClient();
  const path = [
    bucketFolder,
    storeCode.toLowerCase(),
    reviewDate,
    `${Date.now()}-${slugFileName(file.name)}`,
  ].join("/");
  const { error } = await supabase.storage.from("review-photos").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  return { path, error };
}

async function completeMatchingReviewTasks(
  storeId: string,
  reviewDate: string,
  matchText: "rack" | "cleaning",
) {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title,category,status")
    .eq("store_id", storeId)
    .eq("due_date", reviewDate);

  const matchingIds = (tasks ?? [])
    .filter((task) => task.status !== "done" && task.status !== "cancelled")
    .filter((task) => {
      const haystack = `${task.title ?? ""} ${task.category ?? ""}`.toLowerCase();
      return haystack.includes(matchText);
    })
    .map((task) => task.id);

  if (!matchingIds.length) {
    return;
  }

  await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .in("id", matchingIds);
}

export async function saveRackReview(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const storeId = readString(formData, "storeId");
  const reviewDate = readString(formData, "reviewDate") || getIndiaToday();
  const access = await validateReviewAccess(storeId);

  if (!access.ok) {
    return { ok: false, message: access.message };
  }

  const { path, error: photoError } = await uploadReviewPhoto(
    "rack",
    access.store.code,
    reviewDate,
    formData.get("photo"),
  );

  if (photoError) {
    return { ok: false, message: photoError.message };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("rack_reviews")
    .select("id,photo_path")
    .eq("store_id", storeId)
    .eq("review_date", reviewDate)
    .maybeSingle();
  const update: TablesUpdate<"rack_reviews"> = {
    store_id: storeId,
    reviewed_by: access.profile.id,
    review_date: reviewDate,
    rack_arranged: readBoolean(formData, "rack_arranged"),
    sizes_arranged: readBoolean(formData, "sizes_arranged"),
    new_stock_displayed: readBoolean(formData, "new_stock_displayed"),
    brand_display_proper: readBoolean(formData, "brand_display_proper"),
    dust_free: readBoolean(formData, "dust_free"),
    lighting_ok: readBoolean(formData, "lighting_ok"),
    premium_display_ok: readBoolean(formData, "premium_display_ok"),
    remarks: readNullableString(formData, "remarks"),
    photo_path: path ?? existing?.photo_path ?? null,
  };

  const { error } = existing
    ? await supabase.from("rack_reviews").update(update).eq("id", existing.id)
    : await supabase.from("rack_reviews").insert(update);

  if (error) {
    return { ok: false, message: error.message };
  }

  await completeMatchingReviewTasks(storeId, reviewDate, "rack");
  revalidatePath("/app/reviews");
  revalidatePath("/app/reviews/rack");
  revalidatePath("/app/today");
  revalidatePath(`/app/stores/${storeId}`);

  return { ok: true, message: existing ? "Rack review updated." : "Rack review submitted." };
}

export async function saveCleaningReview(
  _previous: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const storeId = readString(formData, "storeId");
  const reviewDate = readString(formData, "reviewDate") || getIndiaToday();
  const access = await validateReviewAccess(storeId);

  if (!access.ok) {
    return { ok: false, message: access.message };
  }

  const { path, error: photoError } = await uploadReviewPhoto(
    "cleaning",
    access.store.code,
    reviewDate,
    formData.get("photo"),
  );

  if (photoError) {
    return { ok: false, message: photoError.message };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("cleaning_reviews")
    .select("id,photo_path")
    .eq("store_id", storeId)
    .eq("review_date", reviewDate)
    .maybeSingle();
  const update: TablesUpdate<"cleaning_reviews"> = {
    store_id: storeId,
    reviewed_by: access.profile.id,
    review_date: reviewDate,
    entry_clean: readBoolean(formData, "entry_clean"),
    floor_clean: readBoolean(formData, "floor_clean"),
    trial_room_clean: readBoolean(formData, "trial_room_clean"),
    billing_counter_clean: readBoolean(formData, "billing_counter_clean"),
    racks_clean: readBoolean(formData, "racks_clean"),
    mirrors_clean: readBoolean(formData, "mirrors_clean"),
    lights_working: readBoolean(formData, "lights_working"),
    ac_fan_working: readBoolean(formData, "ac_fan_working"),
    staff_grooming_ok: readBoolean(formData, "staff_grooming_ok"),
    store_smell_fresh: readBoolean(formData, "store_smell_fresh"),
    remarks: readNullableString(formData, "remarks"),
    photo_path: path ?? existing?.photo_path ?? null,
  };

  const { error } = existing
    ? await supabase.from("cleaning_reviews").update(update).eq("id", existing.id)
    : await supabase.from("cleaning_reviews").insert(update);

  if (error) {
    return { ok: false, message: error.message };
  }

  await completeMatchingReviewTasks(storeId, reviewDate, "cleaning");
  revalidatePath("/app/reviews");
  revalidatePath("/app/reviews/cleaning");
  revalidatePath("/app/today");
  revalidatePath(`/app/stores/${storeId}`);

  return {
    ok: true,
    message: existing ? "Cleaning review updated." : "Cleaning review submitted.",
  };
}
