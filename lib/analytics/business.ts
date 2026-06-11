import { staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";
import type { Store } from "@/lib/auth/session";

export type BusinessPeriod = "today" | "yesterday" | "week" | "month" | "year" | "custom";
export type MatchConfidence = "barcode" | "sku" | "strong item match" | "brand-item" | "weak item" | "none";

export type BusinessFilters = {
  storeIds: string[];
  period: BusinessPeriod;
  startDate: string;
  endDate: string;
  brand: string;
  category: string;
  itemSearch: string;
  size: string;
};

type SalesRow = {
  store_id: string | null;
  sale_date: string | null;
  bill_no: string | null;
  item_name: string | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  quantity: number | null;
  net_sale: number | null;
  staff_name: string | null;
};

type StockRow = {
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

export type BusinessRank = {
  name: string;
  netSales: number;
  soldQuantity: number;
  returnAmount: number;
  returnQuantity: number;
  billCount: number;
  stockQuantity: number;
  stockMrpValue: number | null;
  uniqueItems: number;
  uniqueSizes: number;
  uniqueBrands: number;
  topBrand: string | null;
  topCategory: string | null;
  topStaff: string | null;
  movementStatus: string;
};

export type BusinessItem = {
  key: string;
  itemName: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  sku: string | null;
  netSales: number;
  soldQuantity: number;
  returnQuantity: number;
  returnAmount: number;
  stockQuantity: number;
  stockMrpValue: number | null;
  sizesAvailable: string[];
  sizesSold: string[];
  staff: string[];
  matchConfidence: MatchConfidence;
};

export type BusinessSignalRow = {
  key: string;
  signal: string;
  suggestedAction: string;
  brand: string | null;
  itemName: string;
  category: string | null;
  size: string;
  soldQuantity: number;
  stockQuantity: number;
  returnQuantity: number;
  netSales: number;
  mrpValue: number | null;
  latestStockMonth: string | null;
  matchConfidence: MatchConfidence;
};

export type SizeSummary = {
  size: string;
  stockQuantity: number;
  soldQuantity: number;
  returnQuantity: number;
  netSoldQuantity: number;
  netSales: number;
  brandsCount: number;
  itemsCount: number;
};

export type StaffSummary = {
  staffName: string;
  netSales: number;
  soldQuantity: number;
  billCount: number;
  returnAmount: number;
  topBrand: string | null;
  topCategory: string | null;
  sourceBreakdown: Array<{ sourceName: string; netSales: number; quantity: number }>;
};

export type DailyTrend = {
  date: string;
  netSales: number;
  soldQuantity: number;
};

export type BusinessReport = {
  filters: BusinessFilters;
  options: {
    brands: string[];
    categories: string[];
    sizes: string[];
  };
  latestStockMonths: Array<{ storeId: string; storeName: string; month: string | null }>;
  stockWarning: string | null;
  summary: {
    netSales: number;
    soldQuantity: number;
    billCount: number;
    averageBillValue: number;
    returnAmount: number;
    returnQuantity: number;
    returnRows: number;
    stockQuantity: number;
    stockMrpValue: number | null;
    uniqueItems: number;
    uniqueSizes: number;
    latestStockMonthLabel: string;
    sellThrough: number | null;
    fastMovingCount: number;
    slowMovingCount: number;
    noSaleStockCount: number;
    salesSizeMissingRows: number;
  };
  brandRows: BusinessRank[];
  categoryRows: BusinessRank[];
  itemRows: BusinessItem[];
  restockRows: BusinessSignalRow[];
  slowRows: BusinessSignalRow[];
  lowStockRows: BusinessSignalRow[];
  sizeRows: SizeSummary[];
  staffRows: StaffSummary[];
  dailyTrend: DailyTrend[];
};

export const businessSignalThresholds = {
  lowAndMovingSoldQuantity: 3,
  lowAndMovingStockQuantity: 5,
  noSaleStockQuantity: 1,
  outOfStockQuantity: 0,
  overstockSoldQuantity: 1,
  overstockStockQuantity: 10,
  restockSoonSoldQuantity: 3,
  restockSoonStockQuantity: 5,
  restockUrgentSoldQuantity: 5,
  restockUrgentStockQuantity: 2,
  veryLowStockQuantity: 2,
  watchStockQuantity: 5,
} as const;

const salesSelect =
  "store_id,sale_date,bill_no,item_name,sku,barcode,brand,category,size,color,quantity,net_sale,staff_name";
const stockSelect = "store_id,stock_month,item_name,sku,barcode,brand,category,size,color,quantity,mrp";

function parseIndiaDate(dateText: string) {
  return new Date(`${dateText}T00:00:00+05:30`);
}

function formatIndiaDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(date);
}

function weekStart(dateText: string) {
  const date = parseIndiaDate(dateText);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return formatIndiaDate(date);
}

export function getBusinessDateRange(period: BusinessPeriod, start?: string, end?: string) {
  const today = getIndiaToday();

  if (period === "today") return { startDate: today, endDate: today };
  if (period === "yesterday") {
    const yesterday = addDays(today, -1);
    return { startDate: yesterday, endDate: yesterday };
  }
  if (period === "week") return { startDate: weekStart(today), endDate: today };
  if (period === "year") return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today };
  if (period === "custom" && start && end && start <= end) {
    return { startDate: start, endDate: end > today ? today : end };
  }

  return { startDate: getIndiaMonthStart(today), endDate: today };
}

function clean(value: string | null | undefined, fallback = "Unspecified") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function cleanNullable(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

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

function matchesSearch(row: { item_name: string | null; sku: string | null; barcode: string | null; brand: string | null }, search: string) {
  if (!search) return true;
  const text = [row.item_name, row.sku, row.barcode, row.brand].filter(Boolean).join(" ").toLowerCase();
  return text.includes(search.toLowerCase());
}

function identityKeys(row: {
  store_id: string | null;
  barcode: string | null;
  sku: string | null;
  item_name: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
}) {
  const storeId = row.store_id ?? "store";
  const keys: Array<{ key: string; confidence: MatchConfidence }> = [];
  const barcode = compact(row.barcode);
  const sku = compact(row.sku);
  const item = normalize(row.item_name);
  const brand = normalize(row.brand);
  const size = normalize(row.size);
  const color = normalize(row.color);

  if (barcode) keys.push({ key: `${storeId}:barcode:${barcode}`, confidence: "barcode" });
  if (sku) keys.push({ key: `${storeId}:sku:${sku}`, confidence: "sku" });
  if (item && brand && size && color) {
    keys.push({ key: `${storeId}:strong:${item}|${brand}|${size}|${color}`, confidence: "strong item match" });
  }
  if (item && brand) keys.push({ key: `${storeId}:brand-item:${item}|${brand}`, confidence: "brand-item" });
  if (item) keys.push({ key: `${storeId}:weak-item:${item}`, confidence: "weak item" });

  return keys;
}

function primaryIdentity(row: Parameters<typeof identityKeys>[0]) {
  return identityKeys(row)[0] ?? { key: `${row.store_id ?? "store"}:none:${Math.random()}`, confidence: "none" as const };
}

function confidenceRank(confidence: MatchConfidence) {
  return {
    barcode: 5,
    sku: 4,
    "strong item match": 3,
    "brand-item": 2,
    "weak item": 1,
    none: 0,
  }[confidence];
}

function addNumber(map: Map<string, number>, key: string | null, value: number) {
  const name = clean(key);
  map.set(name, (map.get(name) ?? 0) + value);
}

function topName(map: Map<string, number>) {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function uniqueBillKey(row: SalesRow) {
  return row.bill_no ? `${row.store_id ?? "store"}:${row.sale_date ?? "date"}:${row.bill_no.trim()}` : null;
}

function itemLabel(row: { item_name: string | null; barcode: string | null; sku: string | null }) {
  return cleanNullable(row.item_name) ?? cleanNullable(row.barcode) ?? clean(row.sku, "Unnamed item");
}

function productSizeKey(identityKey: string, size: string) {
  return `${identityKey}:size:${normalize(size) || "unspecified"}`;
}

function restockSignal(soldQuantity: number, stockQuantity: number) {
  if (
    soldQuantity >= businessSignalThresholds.restockUrgentSoldQuantity &&
    stockQuantity <= businessSignalThresholds.restockUrgentStockQuantity
  ) {
    return "Restock Urgent";
  }

  if (
    soldQuantity >= businessSignalThresholds.restockSoonSoldQuantity &&
    stockQuantity <= businessSignalThresholds.restockSoonStockQuantity
  ) {
    return "Restock Soon";
  }

  if (soldQuantity > 0 && stockQuantity > businessSignalThresholds.watchStockQuantity) {
    return "Watch";
  }

  if (
    soldQuantity <= businessSignalThresholds.overstockSoldQuantity &&
    stockQuantity >= businessSignalThresholds.overstockStockQuantity
  ) {
    return "Do Not Reorder / Push Offer";
  }

  if (soldQuantity === 0 && stockQuantity > 0) {
    return "No Sale Stock";
  }

  return "Balanced";
}

function slowSuggestedAction(soldQuantity: number, stockQuantity: number) {
  if (stockQuantity <= 0) return "Review after next stock upload";
  if (soldQuantity === 0) return "Check display";
  if (
    stockQuantity >= businessSignalThresholds.overstockStockQuantity &&
    soldQuantity <= businessSignalThresholds.overstockSoldQuantity
  ) {
    return "Put in offer";
  }
  if (stockQuantity >= businessSignalThresholds.overstockStockQuantity) return "Avoid reorder";
  return "Push staff";
}

function lowStockSignal(stockQuantity: number, soldQuantity: number) {
  if (stockQuantity === businessSignalThresholds.outOfStockQuantity) return "Out of Stock";
  if (stockQuantity <= businessSignalThresholds.veryLowStockQuantity) return "Very Low";
  if (
    stockQuantity <= businessSignalThresholds.lowAndMovingStockQuantity &&
    soldQuantity >= businessSignalThresholds.lowAndMovingSoldQuantity
  ) {
    return "Low and Moving";
  }
  return "OK";
}

async function getLatestStockMonths(stores: Array<Pick<Store, "id" | "name">>) {
  if (!stores.length) return new Map<string, string | null>();

  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("store_id,period_month")
    .eq("report_type", "stock")
    .in(
      "store_id",
      stores.map((store) => store.id),
    )
    .not("period_month", "is", null)
    .order("period_month", { ascending: false });

  const latest = new Map<string, string | null>(stores.map((store) => [store.id, null]));
  for (const row of data ?? []) {
    if (row.store_id && !latest.get(row.store_id)) {
      latest.set(row.store_id, row.period_month);
    }
  }

  return latest;
}

async function getAliasMap(storeIds: string[]) {
  if (!storeIds.length) return new Map<string, string>();

  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_name_aliases")
    .select("store_id,normalized_source_name,canonical_staff_name")
    .in("store_id", storeIds)
    .eq("source_type", "sales_report")
    .eq("is_active", true);

  return new Map((data ?? []).map((alias) => [`${alias.store_id}:${alias.normalized_source_name}`, alias.canonical_staff_name]));
}

function mappedStaff(row: SalesRow, aliases: Map<string, string>) {
  if (!row.store_id || !row.staff_name?.trim()) return clean(row.staff_name);
  return aliases.get(`${row.store_id}:${staffNameKey(row.staff_name)}`) ?? clean(row.staff_name);
}

async function getSalesRows(filters: BusinessFilters) {
  if (!filters.storeIds.length) return [];

  const supabase = await createClient();
  let query = supabase
    .from("sales_rows")
    .select(salesSelect)
    .in("store_id", filters.storeIds)
    .gte("sale_date", filters.startDate)
    .lte("sale_date", filters.endDate);

  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.size) query = query.eq("size", filters.size);

  const { data } = await query;
  return ((data ?? []) as SalesRow[]).filter((row) => matchesSearch(row, filters.itemSearch));
}

async function getStockRows(filters: BusinessFilters, latestMonths: Map<string, string | null>) {
  const months = [...new Set([...latestMonths.values()].filter((month): month is string => Boolean(month)))];
  if (!filters.storeIds.length || !months.length) return [];

  const supabase = await createClient();
  let query = supabase.from("stock_rows").select(stockSelect).in("store_id", filters.storeIds).in("stock_month", months);

  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.size) query = query.eq("size", filters.size);

  const { data } = await query;
  return ((data ?? []) as StockRow[])
    .filter((row) => row.store_id && row.stock_month === latestMonths.get(row.store_id))
    .filter((row) => matchesSearch(row, filters.itemSearch));
}

function movementStatus(soldQuantity: number, stockQuantity: number) {
  if (stockQuantity > 0 && soldQuantity <= 0) return "No sale stock";
  if (soldQuantity >= 3 && stockQuantity <= Math.max(soldQuantity * 0.5, 2)) return "Fast moving";
  if (stockQuantity >= 10 && soldQuantity <= Math.max(stockQuantity * 0.05, 1)) return "Slow moving";
  return "Moving";
}

function emptyRank(name: string): BusinessRank {
  return {
    name,
    billCount: 0,
    movementStatus: "No data",
    netSales: 0,
    returnAmount: 0,
    returnQuantity: 0,
    soldQuantity: 0,
    stockMrpValue: 0,
    stockQuantity: 0,
    topBrand: null,
    topCategory: null,
    topStaff: null,
    uniqueBrands: 0,
    uniqueItems: 0,
    uniqueSizes: 0,
  };
}

export async function getBusinessReport(
  filters: BusinessFilters,
  stores: Array<Pick<Store, "id" | "name" | "code">>,
): Promise<BusinessReport> {
  const latestStockMap = await getLatestStockMonths(stores);
  const [salesRows, stockRows, aliases] = await Promise.all([
    getSalesRows(filters),
    getStockRows(filters, latestStockMap),
    getAliasMap(filters.storeIds),
  ]);

  const brandMap = new Map<string, BusinessRank>();
  const categoryMap = new Map<string, BusinessRank>();
  const sizeMap = new Map<string, SizeSummary>();
  const staffMap = new Map<string, StaffSummary & { bills: Set<string>; brands: Map<string, number>; categories: Map<string, number>; sources: Map<string, { sourceName: string; netSales: number; quantity: number }> }>();
  const itemMap = new Map<string, BusinessItem>();
  const signalMap = new Map<string, BusinessSignalRow>();
  const itemIndex = new Map<string, string>();
  const dailyMap = new Map<string, DailyTrend>();
  const bills = new Set<string>();
  const allItems = new Set<string>();
  const allSizes = new Set<string>();
  const brandOptions = new Set<string>();
  const categoryOptions = new Set<string>();
  const sizeOptions = new Set<string>();

  let netSales = 0;
  let soldQuantity = 0;
  let returnAmount = 0;
  let returnQuantity = 0;
  let returnRows = 0;
  let stockQuantity = 0;
  let stockMrpValue = 0;
  let hasStockMrp = false;
  let salesSizeMissingRows = 0;

  for (const row of stockRows) {
    const quantity = Number(row.quantity ?? 0);
    const mrpValue = row.mrp !== null && row.quantity !== null ? Number(row.mrp) * quantity : null;
    stockQuantity += quantity;
    if (mrpValue !== null) {
      stockMrpValue += mrpValue;
      hasStockMrp = true;
    }

    const brand = clean(row.brand);
    const category = clean(row.category);
    const item = itemLabel(row);
    const size = clean(row.size);
    brandOptions.add(brand);
    categoryOptions.add(category);
    if (row.size?.trim()) sizeOptions.add(size);
    allItems.add(`${row.store_id}:${item}`);
    if (row.size?.trim()) allSizes.add(size);

    const brandRank = brandMap.get(brand) ?? emptyRank(brand);
    brandRank.stockQuantity += quantity;
    brandRank.stockMrpValue = brandRank.stockMrpValue === null || mrpValue === null ? null : (brandRank.stockMrpValue ?? 0) + mrpValue;
    brandRank.uniqueItems += 0;
    brandMap.set(brand, brandRank);

    const categoryRank = categoryMap.get(category) ?? emptyRank(category);
    categoryRank.stockQuantity += quantity;
    categoryRank.stockMrpValue = categoryRank.stockMrpValue === null || mrpValue === null ? null : (categoryRank.stockMrpValue ?? 0) + mrpValue;
    categoryMap.set(category, categoryRank);

    const sizeBucket = sizeMap.get(size) ?? {
      brandsCount: 0,
      itemsCount: 0,
      netSales: 0,
      netSoldQuantity: 0,
      returnQuantity: 0,
      size,
      soldQuantity: 0,
      stockQuantity: 0,
    };
    sizeBucket.stockQuantity += quantity;
    sizeMap.set(size, sizeBucket);

    const identity = primaryIdentity(row);
    const signalKey = productSizeKey(identity.key, size);
    const signalRow = signalMap.get(signalKey) ?? {
      brand: cleanNullable(row.brand),
      category: cleanNullable(row.category),
      itemName: clean(row.item_name, "Unnamed item"),
      key: signalKey,
      latestStockMonth: row.stock_month,
      matchConfidence: identity.confidence,
      mrpValue: 0,
      netSales: 0,
      returnQuantity: 0,
      signal: "Balanced",
      size,
      soldQuantity: 0,
      stockQuantity: 0,
      suggestedAction: "Watch",
    };
    signalRow.stockQuantity += quantity;
    signalRow.mrpValue = signalRow.mrpValue === null || mrpValue === null ? null : (signalRow.mrpValue ?? 0) + mrpValue;
    signalMap.set(signalKey, signalRow);

    const itemBucket = itemMap.get(identity.key) ?? {
      barcode: cleanNullable(row.barcode),
      brand: cleanNullable(row.brand),
      category: cleanNullable(row.category),
      itemName: clean(row.item_name, "Unnamed item"),
      key: identity.key,
      matchConfidence: identity.confidence,
      netSales: 0,
      returnAmount: 0,
      returnQuantity: 0,
      sizesAvailable: [],
      sizesSold: [],
      sku: cleanNullable(row.sku),
      soldQuantity: 0,
      staff: [],
      stockMrpValue: 0,
      stockQuantity: 0,
    };
    itemBucket.stockQuantity += quantity;
    itemBucket.stockMrpValue = itemBucket.stockMrpValue === null || mrpValue === null ? null : (itemBucket.stockMrpValue ?? 0) + mrpValue;
    if (row.size?.trim() && !itemBucket.sizesAvailable.includes(size)) itemBucket.sizesAvailable.push(size);
    itemMap.set(identity.key, itemBucket);
    for (const key of identityKeys(row)) itemIndex.set(key.key, identity.key);
  }

  const brandItems = new Map<string, Set<string>>();
  const brandSizes = new Map<string, Set<string>>();
  const brandCategories = new Map<string, Map<string, number>>();
  const brandStaff = new Map<string, Map<string, number>>();
  const categoryItems = new Map<string, Set<string>>();
  const categoryBrands = new Map<string, Set<string>>();
  const categorySizes = new Map<string, Set<string>>();
  const categoryBrandSales = new Map<string, Map<string, number>>();
  const categoryStaff = new Map<string, Map<string, number>>();
  const sizeBrands = new Map<string, Set<string>>();
  const sizeItems = new Map<string, Set<string>>();

  for (const row of salesRows) {
    const sale = Number(row.net_sale ?? 0);
    const quantity = Number(row.quantity ?? 0);
    const absReturnAmount = sale < 0 ? Math.abs(sale) : 0;
    const absReturnQuantity = quantity < 0 ? Math.abs(quantity) : 0;
    const brand = clean(row.brand);
    const category = clean(row.category);
    const item = itemLabel(row);
    const size = clean(row.size);
    const staffName = mappedStaff(row, aliases);
    const billKey = uniqueBillKey(row);

    netSales += sale;
    soldQuantity += quantity;
    if (sale < 0 || quantity < 0) returnRows += 1;
    returnAmount += absReturnAmount;
    returnQuantity += absReturnQuantity;
    if (billKey) bills.add(billKey);
    if (!row.size?.trim()) salesSizeMissingRows += 1;

    brandOptions.add(brand);
    categoryOptions.add(category);
    if (row.size?.trim()) sizeOptions.add(size);
    allItems.add(`${row.store_id}:${item}`);
    if (row.size?.trim()) allSizes.add(size);

    const day = row.sale_date ?? filters.startDate;
    const daily = dailyMap.get(day) ?? { date: day, netSales: 0, soldQuantity: 0 };
    daily.netSales += sale;
    daily.soldQuantity += quantity;
    dailyMap.set(day, daily);

    const brandRank = brandMap.get(brand) ?? emptyRank(brand);
    brandRank.netSales += sale;
    brandRank.soldQuantity += quantity;
    brandRank.returnAmount += absReturnAmount;
    brandRank.returnQuantity += absReturnQuantity;
    brandRank.billCount += billKey ? 0 : 0;
    brandMap.set(brand, brandRank);

    const categoryRank = categoryMap.get(category) ?? emptyRank(category);
    categoryRank.netSales += sale;
    categoryRank.soldQuantity += quantity;
    categoryRank.returnAmount += absReturnAmount;
    categoryRank.returnQuantity += absReturnQuantity;
    categoryMap.set(category, categoryRank);

    const sizeBucket = sizeMap.get(size) ?? {
      brandsCount: 0,
      itemsCount: 0,
      netSales: 0,
      netSoldQuantity: 0,
      returnQuantity: 0,
      size,
      soldQuantity: 0,
      stockQuantity: 0,
    };
    sizeBucket.soldQuantity += quantity;
    sizeBucket.returnQuantity += absReturnQuantity;
    sizeBucket.netSoldQuantity += quantity;
    sizeBucket.netSales += sale;
    sizeMap.set(size, sizeBucket);

    const staffBucket =
      staffMap.get(staffName) ??
      {
        billCount: 0,
        bills: new Set<string>(),
        brands: new Map<string, number>(),
        categories: new Map<string, number>(),
        netSales: 0,
        returnAmount: 0,
        soldQuantity: 0,
        sourceBreakdown: [],
        sources: new Map<string, { sourceName: string; netSales: number; quantity: number }>(),
        staffName,
        topBrand: null,
        topCategory: null,
      };
    staffBucket.netSales += sale;
    staffBucket.soldQuantity += quantity;
    staffBucket.returnAmount += absReturnAmount;
    if (billKey) staffBucket.bills.add(billKey);
    addNumber(staffBucket.brands, brand, sale);
    addNumber(staffBucket.categories, category, sale);
    const source = staffBucket.sources.get(clean(row.staff_name)) ?? { sourceName: clean(row.staff_name), netSales: 0, quantity: 0 };
    source.netSales += sale;
    source.quantity += quantity;
    staffBucket.sources.set(source.sourceName, source);
    staffMap.set(staffName, staffBucket);

    const match = identityKeys(row).find((key) => itemIndex.has(key.key));
    const identity = match ? { key: itemIndex.get(match.key)!, confidence: match.confidence } : primaryIdentity(row);
    const signalKey = productSizeKey(identity.key, size);
    const signalRow = signalMap.get(signalKey) ?? {
      brand: cleanNullable(row.brand),
      category: cleanNullable(row.category),
      itemName: clean(row.item_name, "Unnamed item"),
      key: signalKey,
      latestStockMonth: null,
      matchConfidence: identity.confidence,
      mrpValue: 0,
      netSales: 0,
      returnQuantity: 0,
      signal: "Balanced",
      size,
      soldQuantity: 0,
      stockQuantity: 0,
      suggestedAction: "Watch",
    };
    signalRow.netSales += sale;
    signalRow.soldQuantity += quantity;
    signalRow.returnQuantity += absReturnQuantity;
    if (confidenceRank(identity.confidence) > confidenceRank(signalRow.matchConfidence)) {
      signalRow.matchConfidence = identity.confidence;
    }
    signalMap.set(signalKey, signalRow);

    const itemBucket = itemMap.get(identity.key) ?? {
      barcode: cleanNullable(row.barcode),
      brand: cleanNullable(row.brand),
      category: cleanNullable(row.category),
      itemName: clean(row.item_name, "Unnamed item"),
      key: identity.key,
      matchConfidence: identity.confidence,
      netSales: 0,
      returnAmount: 0,
      returnQuantity: 0,
      sizesAvailable: [],
      sizesSold: [],
      sku: cleanNullable(row.sku),
      soldQuantity: 0,
      staff: [],
      stockMrpValue: 0,
      stockQuantity: 0,
    };
    itemBucket.netSales += sale;
    itemBucket.soldQuantity += quantity;
    itemBucket.returnAmount += absReturnAmount;
    itemBucket.returnQuantity += absReturnQuantity;
    if (row.size?.trim() && !itemBucket.sizesSold.includes(size)) itemBucket.sizesSold.push(size);
    if (!itemBucket.staff.includes(staffName)) itemBucket.staff.push(staffName);
    if (confidenceRank(identity.confidence) > confidenceRank(itemBucket.matchConfidence)) {
      itemBucket.matchConfidence = identity.confidence;
    }
    itemMap.set(identity.key, itemBucket);

    const brandItemSet = brandItems.get(brand) ?? new Set<string>();
    brandItemSet.add(item);
    brandItems.set(brand, brandItemSet);
    const brandSizeSet = brandSizes.get(brand) ?? new Set<string>();
    if (row.size?.trim()) brandSizeSet.add(size);
    brandSizes.set(brand, brandSizeSet);
    const brandCategoryMap = brandCategories.get(brand) ?? new Map<string, number>();
    addNumber(brandCategoryMap, category, sale);
    brandCategories.set(brand, brandCategoryMap);
    const brandStaffMap = brandStaff.get(brand) ?? new Map<string, number>();
    addNumber(brandStaffMap, staffName, sale);
    brandStaff.set(brand, brandStaffMap);

    const categoryItemSet = categoryItems.get(category) ?? new Set<string>();
    categoryItemSet.add(item);
    categoryItems.set(category, categoryItemSet);
    const categoryBrandSet = categoryBrands.get(category) ?? new Set<string>();
    categoryBrandSet.add(brand);
    categoryBrands.set(category, categoryBrandSet);
    const categorySizeSet = categorySizes.get(category) ?? new Set<string>();
    if (row.size?.trim()) categorySizeSet.add(size);
    categorySizes.set(category, categorySizeSet);
    const categoryBrandMap = categoryBrandSales.get(category) ?? new Map<string, number>();
    addNumber(categoryBrandMap, brand, sale);
    categoryBrandSales.set(category, categoryBrandMap);
    const categoryStaffMap = categoryStaff.get(category) ?? new Map<string, number>();
    addNumber(categoryStaffMap, staffName, sale);
    categoryStaff.set(category, categoryStaffMap);

    const sizeBrandSet = sizeBrands.get(size) ?? new Set<string>();
    sizeBrandSet.add(brand);
    sizeBrands.set(size, sizeBrandSet);
    const sizeItemSet = sizeItems.get(size) ?? new Set<string>();
    sizeItemSet.add(item);
    sizeItems.set(size, sizeItemSet);
  }

  for (const item of itemMap.values()) {
    const brand = clean(item.brand);
    const category = clean(item.category);
    const itemName = item.itemName;
    const sizeList = [...item.sizesAvailable, ...item.sizesSold];

    if (item.stockQuantity > 0) {
      const brandItemSet = brandItems.get(brand) ?? new Set<string>();
      brandItemSet.add(itemName);
      brandItems.set(brand, brandItemSet);
      const categoryItemSet = categoryItems.get(category) ?? new Set<string>();
      categoryItemSet.add(itemName);
      categoryItems.set(category, categoryItemSet);
    }

    for (const size of sizeList) {
      const brandSizeSet = brandSizes.get(brand) ?? new Set<string>();
      brandSizeSet.add(size);
      brandSizes.set(brand, brandSizeSet);
      const categorySizeSet = categorySizes.get(category) ?? new Set<string>();
      categorySizeSet.add(size);
      categorySizes.set(category, categorySizeSet);
    }
  }

  for (const [brand, rank] of brandMap) {
    rank.billCount = new Set(salesRows.filter((row) => clean(row.brand) === brand).map(uniqueBillKey).filter(Boolean)).size;
    rank.uniqueItems = brandItems.get(brand)?.size ?? 0;
    rank.uniqueSizes = brandSizes.get(brand)?.size ?? 0;
    rank.topCategory = topName(brandCategories.get(brand) ?? new Map());
    rank.topStaff = topName(brandStaff.get(brand) ?? new Map());
    rank.movementStatus = movementStatus(rank.soldQuantity, rank.stockQuantity);
  }

  for (const [category, rank] of categoryMap) {
    rank.billCount = new Set(salesRows.filter((row) => clean(row.category) === category).map(uniqueBillKey).filter(Boolean)).size;
    rank.uniqueItems = categoryItems.get(category)?.size ?? 0;
    rank.uniqueBrands = categoryBrands.get(category)?.size ?? 0;
    rank.uniqueSizes = categorySizes.get(category)?.size ?? 0;
    rank.topBrand = topName(categoryBrandSales.get(category) ?? new Map());
    rank.topStaff = topName(categoryStaff.get(category) ?? new Map());
    rank.movementStatus = movementStatus(rank.soldQuantity, rank.stockQuantity);
  }

  for (const [size, summary] of sizeMap) {
    summary.brandsCount = sizeBrands.get(size)?.size ?? 0;
    summary.itemsCount = sizeItems.get(size)?.size ?? 0;
  }

  const itemRows = [...itemMap.values()]
    .sort((a, b) => b.netSales + b.stockQuantity - (a.netSales + a.stockQuantity))
    .slice(0, 50);

  const signalRows = [...signalMap.values()]
    .map((row) => ({
      ...row,
      signal: restockSignal(row.soldQuantity, row.stockQuantity),
      suggestedAction: slowSuggestedAction(row.soldQuantity, row.stockQuantity),
    }))
    .sort((a, b) => b.soldQuantity + b.stockQuantity - (a.soldQuantity + a.stockQuantity));
  const restockRows = signalRows
    .filter((row) => ["Restock Urgent", "Restock Soon", "Watch", "Do Not Reorder / Push Offer", "No Sale Stock"].includes(row.signal))
    .slice(0, 50);
  const slowRows = signalRows
    .filter(
      (row) =>
        (row.stockQuantity >= businessSignalThresholds.overstockStockQuantity &&
          row.soldQuantity <= businessSignalThresholds.overstockSoldQuantity) ||
        (row.stockQuantity > 0 && row.soldQuantity === 0),
    )
    .slice(0, 50);
  const lowStockRows = signalRows
    .map((row) => ({ ...row, signal: lowStockSignal(row.stockQuantity, row.soldQuantity) }))
    .filter((row) => ["Very Low", "Low and Moving", "Out of Stock"].includes(row.signal))
    .slice(0, 50);

  const fastMovingCount = [...itemMap.values()].filter((item) => movementStatus(item.soldQuantity, item.stockQuantity) === "Fast moving").length;
  const slowMovingCount = [...itemMap.values()].filter((item) => movementStatus(item.soldQuantity, item.stockQuantity) === "Slow moving").length;
  const noSaleStockCount = [...itemMap.values()].filter((item) => movementStatus(item.soldQuantity, item.stockQuantity) === "No sale stock").length;

  const latestStockMonths = stores.map((store) => ({
    month: latestStockMap.get(store.id) ?? null,
    storeId: store.id,
    storeName: store.name,
  }));
  const missingStockStores = latestStockMonths.filter((item) => !item.month);

  return {
    brandRows: [...brandMap.values()].sort((a, b) => b.netSales + b.stockQuantity - (a.netSales + a.stockQuantity)).slice(0, 50),
    categoryRows: [...categoryMap.values()].sort((a, b) => b.netSales + b.stockQuantity - (a.netSales + a.stockQuantity)).slice(0, 50),
    dailyTrend: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    filters,
    itemRows,
    latestStockMonths,
    options: {
      brands: [...brandOptions].filter((value) => value !== "Unspecified").sort().slice(0, 250),
      categories: [...categoryOptions].filter((value) => value !== "Unspecified").sort().slice(0, 250),
      sizes: [...sizeOptions].sort().slice(0, 250),
    },
    lowStockRows,
    restockRows,
    slowRows,
    sizeRows: [...sizeMap.values()].sort((a, b) => b.stockQuantity + b.soldQuantity - (a.stockQuantity + a.soldQuantity)).slice(0, 80),
    staffRows: [...staffMap.values()]
      .map((staff) => ({
        billCount: staff.bills.size,
        netSales: staff.netSales,
        returnAmount: staff.returnAmount,
        soldQuantity: staff.soldQuantity,
        sourceBreakdown: [...staff.sources.values()].sort((a, b) => b.netSales - a.netSales),
        staffName: staff.staffName,
        topBrand: topName(staff.brands),
        topCategory: topName(staff.categories),
      }))
      .sort((a, b) => b.netSales - a.netSales)
      .slice(0, 50),
    stockWarning: missingStockStores.length
      ? `No latest stock report found for ${missingStockStores.map((item) => item.storeName).join(", ")}.`
      : null,
    summary: {
      averageBillValue: bills.size > 0 ? netSales / bills.size : 0,
      billCount: bills.size,
      fastMovingCount,
      latestStockMonthLabel: latestStockMonths.map((item) => `${item.storeName}: ${item.month ?? "none"}`).join(", "),
      netSales,
      noSaleStockCount,
      returnAmount,
      returnQuantity,
      returnRows,
      salesSizeMissingRows,
      sellThrough: stockQuantity > 0 ? soldQuantity / stockQuantity : null,
      slowMovingCount,
      soldQuantity,
      stockMrpValue: hasStockMrp ? stockMrpValue : null,
      stockQuantity,
      uniqueItems: allItems.size,
      uniqueSizes: allSizes.size,
    },
  };
}
