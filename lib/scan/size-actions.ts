"use server";

import { requireProfile } from "@/lib/auth/session";
import { compareSizes } from "@/lib/scan/sizes";
import { createClient } from "@/lib/supabase/server";

export type SizeItem = {
  brand: string | null;
  item: string;
  mrp: number | null;
  scanned_size: string | null;
  stores: Array<{ sizes: Array<{ on_hand: number; size: string }>; store: string }>;
};

/** Every size of the scanned item in stock, in the stores this person may see (all roles). */
export async function checkSizes(code: string): Promise<{ items: SizeItem[]; message?: string }> {
  const { profile } = await requireProfile();
  if (!["owner", "manager", "cashier", "staff"].includes(profile.role)) return { items: [], message: "Size check is not available for this account." };
  const clean = code.trim().slice(0, 60);
  if (clean.length < 3) return { items: [], message: "Scan or type the barcode on the tag." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_sizes", { p_code: clean });
  if (error) return { items: [], message: error.code === "P0001" ? error.message : "Sizes could not be checked. Please retry." };
  const items = (data ?? []) as unknown as SizeItem[];
  for (const item of items) for (const store of item.stores) store.sizes.sort((a, b) => compareSizes(a.size, b.size));
  return { items };
}
