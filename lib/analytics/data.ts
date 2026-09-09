import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SalesRowForAnalytics } from "@/lib/analytics/sales";
import type { SalesRowForMovement, StockRowForAnalytics } from "@/lib/analytics/stock";

type AnalyticsData = {
  sales: Array<SalesRowForAnalytics & SalesRowForMovement & { source_row_count: number }>;
  stock: StockRowForAnalytics[];
  aliases: Array<{ store_id: string; normalized_source_name: string; canonical_staff_name: string }>;
  sales_row_count: number;
  stock_row_count: number;
  net_sale: number;
  stock_quantity: number;
};

const load = cache(async (stores: string, start: string | null, end: string | null, months: string) => {
  const client = await createClient();
  const { data, error } = await client.rpc("analytics_data", {
    p_store_ids: JSON.parse(stores), p_start: start ?? undefined, p_end: end ?? undefined, p_months: JSON.parse(months),
  });
  if (error || !data) throw new Error("Complete analytics are unavailable. Please retry.");
  return data as unknown as AnalyticsData;
});

export function analyticsData(storeIds: string[], start: string | null, end: string | null, months: string[] = []) {
  return load(JSON.stringify([...new Set(storeIds)].sort()), start, end, JSON.stringify([...new Set(months)].sort()));
}
