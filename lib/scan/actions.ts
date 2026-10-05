"use server";

import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type LookupItem = {
  brand: string | null; category: string | null; item: string | null; last_sale: string | null; lot_code: string; mrp: number | null;
  on_hand: number | null; size: string | null; snapshot_date: string | null; sold_30: number | null; sold_90: number | null; store: string;
};

/** Owner and managers: an item's stock and recent sales in the stores they may see. */
export async function lookupItem(code: string): Promise<{ items: LookupItem[]; message?: string }> {
  const { profile } = await requireProfile();
  if (!["owner", "manager"].includes(profile.role)) return { items: [], message: "Item lookup is for the owner and managers." };
  const clean = code.trim().slice(0, 60);
  if (clean.length < 3) return { items: [], message: "Scan or type a barcode or lot code." };
  // Reads the saved stock position (rebuilt in the background every 30 minutes) so each scan is instant.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_lookup", { p_code: clean });
  if (error) return { items: [], message: error.code === "P0001" ? error.message : "The item could not be looked up. Please retry." };
  return { items: (data ?? []) as unknown as LookupItem[] };
}
