import { addDays, getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";

export type ManagerUpdate = {
  id: string;
  store_id: string | null;
  created_by: string | null;
  title: string;
  details: string | null;
  category: string | null;
  urgency: string | null;
  status: string | null;
  photo_path: string | null;
  created_task_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  stores: { id: string; name: string; code: string } | null;
  created_profile: { id: string; full_name: string | null; email: string | null } | null;
  created_task: { id: string; title: string; status: string | null; due_date: string | null } | null;
};

export type UpdateFilters = {
  storeId?: string;
  status?: string;
  urgency?: string;
  category?: string;
  period?: string;
  limit?: number;
};

const updateSelect = `
  *,
  stores(id,name,code),
  created_profile:profiles!manager_updates_created_by_fkey(id,full_name,email),
  created_task:tasks!manager_updates_created_task_id_fkey(id,title,status,due_date)
`;

function normalizeFilter(value?: string) {
  return value && value !== "all" ? value : undefined;
}

export async function getManagerUpdates(filters: UpdateFilters = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("manager_updates")
    .select(updateSelect)
    .order("created_at", { ascending: false });

  const storeId = normalizeFilter(filters.storeId);
  const status = normalizeFilter(filters.status);
  const urgency = normalizeFilter(filters.urgency);
  const category = normalizeFilter(filters.category);
  const period = normalizeFilter(filters.period);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (urgency) {
    query = query.eq("urgency", urgency);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (period === "today") {
    query = query.gte("created_at", `${getIndiaToday()}T00:00:00+05:30`);
  } else if (period === "week") {
    query = query.gte("created_at", `${addDays(getIndiaToday(), -6)}T00:00:00+05:30`);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data } = await query;
  return (data ?? []) as ManagerUpdate[];
}

export async function getManagerUpdate(updateId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("manager_updates")
    .select(updateSelect)
    .eq("id", updateId)
    .maybeSingle();

  return data as ManagerUpdate | null;
}

export async function getStoreUpdateSummary(storeId: string) {
  const updates = await getManagerUpdates({ storeId, limit: 20 });
  const openUpdates = updates.filter((update) => {
    const status = update.status ?? "open";
    return status !== "resolved" && status !== "cancelled";
  });

  return {
    latest: updates.slice(0, 5),
    openCount: openUpdates.length,
    urgentCount: openUpdates.filter((update) => update.urgency === "urgent").length,
  };
}

export async function getTodayUpdateSummary(
  stores: Array<{ id: string; name: string; code: string }>,
) {
  const updates = await getManagerUpdates({ status: "open", limit: 50 });
  const openUpdates = updates.filter((update) => update.status === "open" || !update.status);
  const urgentOpen = openUpdates.filter((update) => update.urgency === "urgent");
  const storeCounts = stores.map((store) => ({
    store,
    count: openUpdates.filter((update) => update.store_id === store.id).length,
  }));

  return {
    openUrgentCount: urgentOpen.length,
    latestOpen: openUpdates.slice(0, 3),
    storeCounts,
  };
}

export async function getUpdatePhotoUrl(photoPath: string | null) {
  if (!photoPath) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("review-photos")
    .createSignedUrl(photoPath, 60 * 10);

  return data?.signedUrl ?? null;
}
