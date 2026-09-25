import "server-only";

import { addDays } from "@/lib/tasks/dates";
import { buildFreshness, type DataFreshness } from "@/lib/analytics/freshness";
import { measureDataOperation } from "@/lib/observability/performance";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { Store } from "@/lib/auth/session";
import type { DateRange, SalesSummary, StaffSalesSummary } from "@/lib/analytics/sales";
import type { StockAnalyticsFilters, StockItemSummary, StockSummary } from "@/lib/analytics/stock";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid analytics response.");
  return value as JsonRecord;
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid analytics response list.");
  return value.map(record);
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

export async function phase1AnalyticsRpc(
  name: "sales_analytics_summary_v2" | "staff_sales_summary_v2" | "stock_analytics_summary_v2" | "weekly_audit_summary_v2",
  args: Record<string, unknown>,
) {
  const client = await createClient();
  return measureDataOperation(`rpc.${name}`, async () => {
    const { data, error } = await client.rpc(name, args as never);
    if (error || !data) throw new Error(`${name} is unavailable. Please retry.`);
    return data as Json;
  });
}

function ranked(rows: unknown) {
  return records(rows).map((row) => ({ name: text(row.name), totalSale: number(row.total_sale), quantity: number(row.quantity) }));
}

export type SalesSummaryV2Result = { summary: SalesSummary; freshness: DataFreshness };

export function decodeSalesSummaryV2(
  rawPayload: unknown,
  dateRange: DateRange,
  stores: Array<Pick<Store, "id" | "name" | "code" | "monthly_target_enabled" | "monthly_target">>,
): Promise<SalesSummaryV2Result> {
  const payload = record(rawPayload);
  const rawSummary = record(payload.summary);
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const dailyByDate = new Map(records(payload.daily_trend).map((row) => [text(row.date), row]));
  const dailyTrend = [];
  for (let date = dateRange.startDate; date <= dateRange.endDate; date = addDays(date, 1)) {
    const row = dailyByDate.get(date);
    dailyTrend.push({ date, totalSale: number(row?.total_sale), quantity: number(row?.quantity) });
  }

  return Promise.resolve({
    summary: {
      totalNetSale: number(rawSummary.total_net_sale),
      totalQuantity: number(rawSummary.total_quantity),
      billCount: number(rawSummary.bill_count),
      averageBillValue: number(rawSummary.average_bill_value),
      staffCount: number(rawSummary.staff_count),
      brandCount: number(rawSummary.brand_count),
      categoryCount: number(rawSummary.category_count),
      rowCount: number(rawSummary.row_count),
      topStaff: ranked(payload.top_staff),
      topBrands: ranked(payload.top_brands),
      topCategories: ranked(payload.top_categories),
      topItems: ranked(payload.top_items),
      dailyTrend,
      storeSummaries: records(payload.store_summaries).flatMap((row) => {
        const store = storeById.get(text(row.store_id));
        return store ? [{
          store,
          totalNetSale: number(row.total_net_sale),
          totalQuantity: number(row.total_quantity),
          billCount: number(row.bill_count),
          averageBillValue: number(row.average_bill_value),
          rowCount: number(row.row_count),
        }] : [];
      }),
    },
    freshness: buildFreshness(record(payload.freshness)),
  });
}

export async function loadSalesSummaryV2(
  storeIds: string[],
  dateRange: DateRange,
  stores: Array<Pick<Store, "id" | "name" | "code" | "monthly_target_enabled" | "monthly_target">>,
): Promise<SalesSummaryV2Result> {
  const payload = await phase1AnalyticsRpc("sales_analytics_summary_v2", {
    p_store_ids: storeIds,
    p_start: dateRange.startDate,
    p_end: dateRange.endDate,
    p_top_limit: 5,
  });
  return decodeSalesSummaryV2(payload, dateRange, stores);
}

export type StaffSalesV2Result = { staff: StaffSalesSummary[]; freshness: DataFreshness };

export function decodeStaffSalesSummaryV2(rawPayload: unknown): StaffSalesV2Result {
  const payload = record(rawPayload);

  return {
    staff: records(payload.staff).map((row) => ({
      staffName: text(row.staff_name),
      totalSale: number(row.total_sale),
      returnAmount: number(row.return_amount),
      billCount: number(row.bill_count),
      quantitySold: number(row.quantity_sold),
      averageBillValue: number(row.average_bill_value),
      topCategory: nullableText(row.top_category),
      topBrand: nullableText(row.top_brand),
      sourceBreakdown: records(row.source_breakdown).map((source) => ({
        sourceName: text(source.source_name),
        totalSale: number(source.total_sale),
        quantity: number(source.quantity),
      })),
    })),
    freshness: buildFreshness(record(payload.freshness)),
  };
}

export async function loadStaffSalesSummaryV2(storeIds: string[], dateRange: DateRange): Promise<StaffSalesV2Result> {
  const payload = await phase1AnalyticsRpc("staff_sales_summary_v2", {
    p_store_ids: storeIds,
    p_start: dateRange.startDate,
    p_end: dateRange.endDate,
    p_top_limit: 250,
  });
  return decodeStaffSalesSummaryV2(payload);
}

function stockItem(row: JsonRecord): StockItemSummary {
  const quality = text(row.match_quality);
  return {
    key: text(row.key),
    storeId: text(row.store_id),
    storeName: text(row.store_name),
    itemName: text(row.item_name),
    brand: nullableText(row.brand),
    category: nullableText(row.category),
    sku: nullableText(row.sku),
    barcode: nullableText(row.barcode),
    size: nullableText(row.size),
    color: nullableText(row.color),
    stockQuantity: number(row.stock_quantity),
    stockMrpValue: row.stock_mrp_value === null ? null : number(row.stock_mrp_value),
    salesQuantity: number(row.sales_quantity),
    salesValue: number(row.sales_value),
    matchQuality: (["barcode", "sku", "strong-item", "brand-item", "weak-item"] as const).includes(quality as never)
      ? quality as StockItemSummary["matchQuality"]
      : "none",
  };
}

export function decodeStockStoreSummaryV2(
  rawRow: unknown,
  lookbackDays: StockAnalyticsFilters["lookbackDays"],
): StockSummary & { freshness: DataFreshness } {
  const row = record(rawRow);
  const counts = record(row.candidate_counts);
  const ranks = (value: unknown) => records(value).map((rank) => ({
    name: text(rank.name),
    quantity: number(rank.quantity),
    mrpValue: rank.mrp_value === null ? null : number(rank.mrp_value),
  }));

  return {
    stockMonth: text(row.stock_month),
    lookbackDays,
    totalStockQuantity: number(row.total_stock_quantity),
    totalStockMrpValue: row.total_stock_mrp_value === null ? null : number(row.total_stock_mrp_value),
    itemCount: number(row.item_count),
    brandCount: number(row.brand_count),
    categoryCount: number(row.category_count),
    topBrands: ranks(row.top_brands),
    topCategories: ranks(row.top_categories),
    topItems: records(row.top_items).map(stockItem),
    slowStockCandidates: records(row.slow_stock_candidates).map(stockItem),
    deadStockCandidates: records(row.dead_stock_candidates).map(stockItem),
    fastMovingLowStockCandidates: records(row.fast_moving_low_stock_candidates).map(stockItem),
    highStockLowSaleCandidates: records(row.high_stock_low_sale_candidates).map(stockItem),
    candidateCounts: {
      slow: number(counts.slow), dead: number(counts.dead), fastLow: number(counts.fast_low), highLow: number(counts.high_low),
    },
    dataQualityNote: row.data_quality_note === true,
    freshness: buildFreshness(record(row.freshness)),
  };
}

export async function loadStockSummaryV2(filters: StockAnalyticsFilters): Promise<StockSummary & { freshness: DataFreshness }> {
  const payload = record(await phase1AnalyticsRpc("stock_analytics_summary_v2", {
    p_store_ids: filters.storeIds,
    p_stock_month: filters.stockMonth,
    p_lookback_days: filters.lookbackDays,
    p_top_limit: 10,
  }));
  const storePayloads = records(payload.stores);
  if (storePayloads.length !== 1) throw new Error("Stock summary requires one store at a time.");
  return decodeStockStoreSummaryV2(storePayloads[0], filters.lookbackDays);
}

export function phase1Record(value: unknown) {
  return record(value);
}

export function phase1Records(value: unknown) {
  return records(value);
}

export function phase1Number(value: unknown) {
  return number(value);
}

export function phase1Text(value: unknown) {
  return text(value);
}

export function phase1TextList(value: unknown) {
  return Array.isArray(value) ? value.map(text) : [];
}
