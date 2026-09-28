import "server-only";

import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type OwnerNote = Tables<"owner_notes">;

export type OwnerNotesResult = {
  available: boolean;
  notes: OwnerNote[];
};

function missingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        error.message?.includes("owner_notes")),
  );
}

export async function getSharedOwnerNotes({
  archived = false,
  search = "",
}: {
  archived?: boolean;
  search?: string;
} = {}): Promise<OwnerNotesResult> {
  const owner = await requireOwner();

  if (!owner) {
    return { available: false, notes: [] };
  }

  const supabase = await createClient();
  let query = supabase
    .from("owner_notes")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(30);

  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  const safeSearch = search
    .trim()
    .slice(0, 80)
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ");
  if (safeSearch) {
    query = query.or(`title.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%`);
  }

  const { data, error } = await query;

  if (missingTable(error)) {
    return { available: false, notes: [] };
  }

  if (error) {
    throw new Error(`Could not load owner notes: ${error.message}`);
  }

  return { available: true, notes: data ?? [] };
}
