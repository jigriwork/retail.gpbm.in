import { addDays, getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/auth/session";

export type StockLookbackDays = 7 | 15 | 30 | 60 | 90;

export type StockAnalyticsFilters = {
  storeIds: string[];
  stockMonth: string;
  lookbackDays: StockLookbackDays;
  stores: Array<Pick<Store, "id" | "name" | "code" | "slow_stock_days" | "dead_stock_days">>;
};

export type StockRowForAnalytics = {
  store_id: string | null;
  stock_month: string | null;
  item_name: string | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  quantity: number | null;
  mrp: number | null;
};

export type SalesRowForMovement = {
  store_id: string | null;
  sale_date: string | null;
  item_name: string | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  quantity: number | null;
  net_sale: number | null;
};

export type StockItemSummary = {
  key: string;
  storeId: string;
  storeName: string;
  itemName: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  stockQuantity: number;
  stockMrpValue: number | null;
  salesQuantity: number;
  salesValue: number;
  matchQuality: "barcode" | "sku" | "strong-item" | "brand-item" | "weak-item" | "none";
};

export type StockRank = {
  name: string;
  quantity: number;
  mrpValue: number | null;
};

export type StockSummary = {
  stockMonth: string;
  lookbackDays: StockLookbackDays;
  totalStockQuantity: number;
  totalStockMrpValue: number | null;
  itemCount: number;
  brandCount: number;
  categoryCount: number;
  topBrands: StockRank[];
  topCategories: StockRank[];
  topItems: StockItemSummary[];
  slowStockCandidates: StockItemSummary[];
  deadStockCandidates: StockItemSummary[];
  fastMovingLowStockCandidates: StockItemSummary[];
  highStockLowSaleCandidates: StockItemSummary[];
  dataQualityNote: boolean;
};

const stockSelect =
  "store_id,stock_month,item_name,sku,barcode,brand,category,size,color,quantity,mrp";
const salesSelect =
  "store_id,sale_date,item_name,sku,barcode,brand,category,size,color,quantity,net_sale";

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");
}

function compact(value: string | null | undefined) {
  return normalize(value).replace(/\s/g, "");
}

function clean(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function storeThresholds(store: Pick<Store, "code" | "slow_stock_days" | "dead_stock_days">) {
  const fallbackSlow = store.code === "BM" ? 45 : 30;
  const fallbackDead = store.code === "BM" ? 90 : 60;

  return {
    slowDays: store.slow_stock_days ?? fallbackSlow,
    deadDays: store.dead_stock_days ?? fallbackDead,
  };
}

function identityKeys(row: {
  barcode: string | null;
  sku: string | null;
  item_name: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
}) {
  const keys: Array<{ key: string; quality: StockItemSummary["matchQuality"] }> = [];
  const barcode = compact(row.barcode);
  const sku = compact(row.sku);
  const item = normalize(row.item_name);
  const brand = normalize(row.brand);
  const size = normalize(row.size);
  const color = normalize(row.color);

  if (barcode) keys.push({ key: `barcode:${barcode}`, quality: "barcode" });
  if (sku) keys.push({ key: `sku:${sku}`, quality: "sku" });
  if (item && brand && size && color) {
    keys.push({ key: `strong:${item}|${brand}|${size}|${color}`, quality: "strong-item" });
  }
  if (item && brand) keys.push({ key: `brand-item:${item}|${brand}`, quality: "brand-item" });
  // Weak fallback: item-name-only matching is intentionally last because product names can repeat.
  if (item) keys.push({ key: `weak-item:${item}`, quality: "weak-item" });

  return keys;
}

function primaryStockKey(row: StockRowForAnalytics) {
  return (
    identityKeys(row)[0]?.key ??
    `unknown:${row.store_id}:${normalize(row.item_name)}:${normalize(row.brand)}:${normalize(row.category)}`
  );
}

async function getStockRows(filters: StockAnalyticsFilters) {
  if (!filters.storeIds.length) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_rows")
    .select(stockSelect)
    .in("store_id", filters.storeIds)
    .eq("stock_month", filters.stockMonth);

  return (data ?? []) as StockRowForAnalytics[];
}

async function getSalesRows(filters: StockAnalyticsFilters, lookbackDays: number = filters.lookbackDays) {
  if (!filters.storeIds.length) return [];

  const today = getIndiaToday();
  const startDate = addDays(today, -(lookbackDays - 1));
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_rows")
    .select(salesSelect)
    .in("store_id", filters.storeIds)
    .gte("sale_date", startDate)
    .lte("sale_date", today);

  return (data ?? []) as SalesRowForMovement[];
}

export async function getLatestStockMonth(storeId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("reports")
    .select("period_month")
    .eq("report_type", "stock")
    .not("period_month", "is", null)
    .order("period_month", { ascending: false })
    .limit(1);

  if (storeId) {
    query = query.eq("store_id", storeId);
  }

  const { data } = await query.maybeSingle();
  return data?.period_month ?? null;
}

function addRank(bucket: Map<string, StockRank>, key: string | null, quantity: number, mrpValue: number | null) {
  const name = clean(key) ?? "Unspecified";
  const current = bucket.get(name) ?? { name, quantity: 0, mrpValue: 0 };
  current.quantity += quantity;
  current.mrpValue =
    current.mrpValue === null || mrpValue === null ? null : (current.mrpValue ?? 0) + mrpValue;
  bucket.set(name, current);
}

function topRanks(bucket: Map<string, StockRank>, limit = 8) {
  return [...bucket.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

function buildSalesMovementMap(salesRows: SalesRowForMovement[]) {
  const movement = new Map<string, { quantity: number; value: number }>();

  for (const row of salesRows) {
    const quantity = Number(row.quantity ?? 0);
    const value = Number(row.net_sale ?? 0);

    for (const identity of identityKeys(row)) {
      const current = movement.get(identity.key) ?? { quantity: 0, value: 0 };
      current.quantity += quantity;
      current.value += value;
      movement.set(identity.key, current);
    }
  }

  return movement;
}

function summarizeItems(
  stockRows: StockRowForAnalytics[],
  salesRows: SalesRowForMovement[],
  stores: StockAnalyticsFilters["stores"],
) {
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const stockItems = new Map<string, StockItemSummary>();
  const movement = buildSalesMovementMap(salesRows);

  for (const row of stockRows) {
    if (!row.store_id) continue;

    const key = `${row.store_id}:${primaryStockKey(row)}`;
    const store = storeById.get(row.store_id);
    const quantity = Number(row.quantity ?? 0);
    const mrpValue = row.mrp !== null && row.quantity !== null ? row.mrp * row.quantity : null;
    const current =
      stockItems.get(key) ??
      ({
        key,
        storeId: row.store_id,
        storeName: store?.name ?? "Store",
        itemName: clean(row.item_name) ?? "Unnamed item",
        brand: clean(row.brand),
        category: clean(row.category),
        sku: clean(row.sku),
        barcode: clean(row.barcode),
        size: clean(row.size),
        color: clean(row.color),
        stockQuantity: 0,
        stockMrpValue: 0,
        salesQuantity: 0,
        salesValue: 0,
        matchQuality: "none",
      } satisfies StockItemSummary);

    current.stockQuantity += quantity;
    current.stockMrpValue =
      current.stockMrpValue === null || mrpValue === null
        ? null
        : (current.stockMrpValue ?? 0) + mrpValue;

    for (const identity of identityKeys(row)) {
      const sale = movement.get(identity.key);
      if (sale) {
        current.salesQuantity = sale.quantity;
        current.salesValue = sale.value;
        current.matchQuality = identity.quality;
        break;
      }
    }

    stockItems.set(key, current);
  }

  return [...stockItems.values()];
}

export async function getStockItemSummary(filters: StockAnalyticsFilters) {
  const [stockRows, salesRows] = await Promise.all([getStockRows(filters), getSalesRows(filters)]);
  return summarizeItems(stockRows, salesRows, filters.stores);
}

export async function getSalesMovementForStockItems(filters: StockAnalyticsFilters) {
  return getStockItemSummary(filters);
}

export async function getStockBrandSummary(filters: StockAnalyticsFilters) {
  const items = await getStockItemSummary(filters);
  const brands = new Map<string, StockRank>();

  for (const item of items) {
    addRank(brands, item.brand, item.stockQuantity, item.stockMrpValue);
  }

  return topRanks(brands);
}

export async function getStockCategorySummary(filters: StockAnalyticsFilters) {
  const items = await getStockItemSummary(filters);
  const categories = new Map<string, StockRank>();

  for (const item of items) {
    addRank(categories, item.category, item.stockQuantity, item.stockMrpValue);
  }

  return topRanks(categories);
}

export async function getSlowStockCandidates(filters: StockAnalyticsFilters) {
  const items = await getStockItemSummary(filters);
  const maxSlowDays = Math.max(...filters.stores.map((store) => storeThresholds(store).slowDays), 30);
  const slowSalesRows = await getSalesRows(filters, maxSlowDays);
  const slowItems = summarizeItems(await getStockRows(filters), slowSalesRows, filters.stores);

  return slowItems
    .filter((item) => item.stockQuantity > 0 && item.salesQuantity <= Math.max(item.stockQuantity * 0.05, 1))
    .sort((a, b) => b.stockQuantity - a.stockQuantity)
    .slice(0, 10)
    .map((item) => items.find((current) => current.key === item.key) ?? item);
}

export async function getDeadStockCandidates(filters: StockAnalyticsFilters) {
  const maxDeadDays = Math.max(...filters.stores.map((store) => storeThresholds(store).deadDays), 60);
  const [stockRows, deadSalesRows] = await Promise.all([getStockRows(filters), getSalesRows(filters, maxDeadDays)]);
  const items = summarizeItems(stockRows, deadSalesRows, filters.stores);

  return items
    .filter((item) => item.stockQuantity > 0 && item.salesQuantity === 0)
    .sort((a, b) => b.stockQuantity - a.stockQuantity)
    .slice(0, 10);
}

export async function getFastMovingLowStockCandidates(filters: StockAnalyticsFilters) {
  const items = await getStockItemSummary(filters);

  return items
    .filter((item) => item.salesQuantity >= 3 && item.stockQuantity <= Math.max(item.salesQuantity * 0.5, 2))
    .sort((a, b) => b.salesQuantity - a.salesQuantity)
    .slice(0, 10);
}

export async function getHighStockLowSaleCandidates(filters: StockAnalyticsFilters) {
  const items = await getStockItemSummary(filters);

  return items
    .filter((item) => item.stockQuantity >= 10 && item.salesQuantity <= Math.max(item.stockQuantity * 0.05, 1))
    .sort((a, b) => b.stockQuantity - a.stockQuantity)
    .slice(0, 10);
}

export async function getStockSummary(filters: StockAnalyticsFilters): Promise<StockSummary> {
  const items = await getStockItemSummary(filters);
  const brands = new Map<string, StockRank>();
  const categories = new Map<string, StockRank>();
  let totalStockQuantity = 0;
  let totalStockMrpValue = 0;
  let hasMrpValue = false;
  let dataQualityNote = false;

  for (const item of items) {
    totalStockQuantity += item.stockQuantity;

    if (item.stockMrpValue !== null) {
      totalStockMrpValue += item.stockMrpValue;
      hasMrpValue = true;
    }

    if (!item.sku && !item.barcode) {
      dataQualityNote = true;
    }

    addRank(brands, item.brand, item.stockQuantity, item.stockMrpValue);
    addRank(categories, item.category, item.stockQuantity, item.stockMrpValue);
  }

  const [slow, dead, fastLow, highLow] = await Promise.all([
    getSlowStockCandidates(filters),
    getDeadStockCandidates(filters),
    getFastMovingLowStockCandidates(filters),
    getHighStockLowSaleCandidates(filters),
  ]);

  return {
    stockMonth: filters.stockMonth,
    lookbackDays: filters.lookbackDays,
    totalStockQuantity,
    totalStockMrpValue: hasMrpValue ? totalStockMrpValue : null,
    itemCount: items.length,
    brandCount: new Set(items.map((item) => item.brand).filter(Boolean)).size,
    categoryCount: new Set(items.map((item) => item.category).filter(Boolean)).size,
    topBrands: topRanks(brands),
    topCategories: topRanks(categories),
    topItems: [...items].sort((a, b) => b.stockQuantity - a.stockQuantity).slice(0, 10),
    slowStockCandidates: slow,
    deadStockCandidates: dead,
    fastMovingLowStockCandidates: fastLow,
    highStockLowSaleCandidates: highLow,
    dataQualityNote,
  };
}
