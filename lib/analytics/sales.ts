import { addDays, getIndiaDayOfMonth, getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/auth/session";

export type SalesPeriod = "today" | "yesterday" | "week" | "month" | "custom";

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type SalesAnalyticsFilters = {
  storeIds: string[];
  dateRange: DateRange;
};

export type SalesRowForAnalytics = {
  store_id: string | null;
  sale_date: string | null;
  net_sale: number | null;
  quantity: number | null;
  bill_no: string | null;
  staff_name: string | null;
  brand: string | null;
  category: string | null;
  item_name: string | null;
};

export type RankedSale = {
  name: string;
  totalSale: number;
  quantity: number;
};

export type DailySalePoint = {
  date: string;
  totalSale: number;
  quantity: number;
};

export type StoreSalesSummary = {
  store: Pick<Store, "id" | "name" | "code" | "monthly_target_enabled" | "monthly_target">;
  totalNetSale: number;
  totalQuantity: number;
  billCount: number;
  averageBillValue: number;
  rowCount: number;
};

export type SalesSummary = {
  totalNetSale: number;
  totalQuantity: number;
  billCount: number;
  averageBillValue: number;
  staffCount: number;
  brandCount: number;
  categoryCount: number;
  rowCount: number;
  topStaff: RankedSale[];
  topBrands: RankedSale[];
  topCategories: RankedSale[];
  topItems: RankedSale[];
  dailyTrend: DailySalePoint[];
  storeSummaries: StoreSalesSummary[];
};

export type StaffSalesSummary = {
  staffName: string;
  totalSale: number;
  billCount: number;
  quantitySold: number;
  averageBillValue: number;
  topCategory: string | null;
  topBrand: string | null;
};

export type MissingSalesReportDate = {
  store: Pick<Store, "id" | "name" | "code">;
  date: string;
  status: "missing" | "today-not-uploaded";
};

export type TargetProgress = {
  monthSale: number;
  target: number;
  percentageAchieved: number;
  balance: number;
  daysLeftInMonth: number;
  requiredDailySale: number;
};

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
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return formatIndiaDate(date);
}

function monthEnd(dateText: string) {
  const date = parseIndiaDate(`${dateText.slice(0, 7)}-01`);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return formatIndiaDate(date);
}

function dateList(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function cleanName(value: string | null, fallback: string) {
  const text = value?.trim().replace(/\s+/g, " ");
  return text || fallback;
}

function addRankedSale(bucket: Map<string, RankedSale>, key: string | null, sale: number, quantity: number) {
  const name = cleanName(key, "Unspecified");
  const current = bucket.get(name) ?? { name, totalSale: 0, quantity: 0 };
  current.totalSale += sale;
  current.quantity += quantity;
  bucket.set(name, current);
}

function topRanked(bucket: Map<string, RankedSale>, limit = 5) {
  return [...bucket.values()]
    .sort((left, right) => right.totalSale - left.totalSale)
    .slice(0, limit);
}

function uniqueBillKey(row: SalesRowForAnalytics) {
  if (!row.bill_no) {
    return null;
  }

  return `${row.store_id ?? "store"}:${row.sale_date ?? "date"}:${row.bill_no.trim()}`;
}

export function getDateRangeForPeriod(
  period: SalesPeriod,
  customStart?: string,
  customEnd?: string,
): DateRange {
  const today = getIndiaToday();

  if (period === "today") {
    return { startDate: today, endDate: today };
  }

  if (period === "yesterday") {
    const yesterday = addDays(today, -1);
    return { startDate: yesterday, endDate: yesterday };
  }

  if (period === "week") {
    return { startDate: weekStart(today), endDate: today };
  }

  if (period === "custom" && customStart && customEnd && customStart <= customEnd) {
    return { startDate: customStart, endDate: customEnd > today ? today : customEnd };
  }

  return { startDate: getIndiaMonthStart(today), endDate: today };
}

export function calculateAverageBillValue(totalSale: number, billCount: number) {
  return billCount > 0 ? totalSale / billCount : 0;
}

export function calculateTargetProgress(
  store: Pick<Store, "monthly_target_enabled" | "monthly_target">,
  monthSale: number,
  today = getIndiaToday(),
): TargetProgress | null {
  const target = Number(store.monthly_target ?? 0);

  if (!store.monthly_target_enabled || target <= 0) {
    return null;
  }

  const end = monthEnd(today);
  const daysLeftInMonth = Math.max(dateList(today, end).length, 1);
  const balance = Math.max(target - monthSale, 0);

  return {
    monthSale,
    target,
    percentageAchieved: Math.round((monthSale / target) * 100),
    balance,
    daysLeftInMonth,
    requiredDailySale: balance / daysLeftInMonth,
  };
}

async function getSalesRows(filters: SalesAnalyticsFilters) {
  if (!filters.storeIds.length) {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_rows")
    .select("store_id,sale_date,net_sale,quantity,bill_no,staff_name,brand,category,item_name")
    .in("store_id", filters.storeIds)
    .gte("sale_date", filters.dateRange.startDate)
    .lte("sale_date", filters.dateRange.endDate);

  return (data ?? []) as SalesRowForAnalytics[];
}

export async function getSalesSummary(
  filters: SalesAnalyticsFilters,
  stores: Array<Pick<Store, "id" | "name" | "code" | "monthly_target_enabled" | "monthly_target">>,
): Promise<SalesSummary> {
  const rows = await getSalesRows(filters);
  const bills = new Set<string>();
  const staff = new Set<string>();
  const brands = new Set<string>();
  const categories = new Set<string>();
  const staffSales = new Map<string, RankedSale>();
  const brandSales = new Map<string, RankedSale>();
  const categorySales = new Map<string, RankedSale>();
  const itemSales = new Map<string, RankedSale>();
  const dailySales = new Map<string, DailySalePoint>();
  const storeBuckets = new Map<string, StoreSalesSummary>();
  let totalNetSale = 0;
  let totalQuantity = 0;

  for (const store of stores) {
    storeBuckets.set(store.id, {
      store,
      totalNetSale: 0,
      totalQuantity: 0,
      billCount: 0,
      averageBillValue: 0,
      rowCount: 0,
    });
  }

  const storeBills = new Map<string, Set<string>>();

  for (const row of rows) {
    const sale = Number(row.net_sale ?? 0);
    const quantity = Number(row.quantity ?? 0);
    totalNetSale += sale;
    totalQuantity += quantity;

    const billKey = uniqueBillKey(row);
    if (billKey) {
      bills.add(billKey);
      if (row.store_id) {
        const bucket = storeBills.get(row.store_id) ?? new Set<string>();
        bucket.add(billKey);
        storeBills.set(row.store_id, bucket);
      }
    }

    if (row.staff_name?.trim()) staff.add(cleanName(row.staff_name, "Unspecified"));
    if (row.brand?.trim()) brands.add(cleanName(row.brand, "Unspecified"));
    if (row.category?.trim()) categories.add(cleanName(row.category, "Unspecified"));

    addRankedSale(staffSales, row.staff_name, sale, quantity);
    addRankedSale(brandSales, row.brand, sale, quantity);
    addRankedSale(categorySales, row.category, sale, quantity);
    addRankedSale(itemSales, row.item_name, sale, quantity);

    const date = row.sale_date ?? filters.dateRange.startDate;
    const day = dailySales.get(date) ?? { date, totalSale: 0, quantity: 0 };
    day.totalSale += sale;
    day.quantity += quantity;
    dailySales.set(date, day);

    if (row.store_id && storeBuckets.has(row.store_id)) {
      const storeSummary = storeBuckets.get(row.store_id);
      if (storeSummary) {
        storeSummary.totalNetSale += sale;
        storeSummary.totalQuantity += quantity;
        storeSummary.rowCount += 1;
      }
    }
  }

  for (const [storeId, summary] of storeBuckets) {
    summary.billCount = storeBills.get(storeId)?.size ?? 0;
    summary.averageBillValue = calculateAverageBillValue(summary.totalNetSale, summary.billCount);
  }

  const trendDates = dateList(filters.dateRange.startDate, filters.dateRange.endDate);

  return {
    totalNetSale,
    totalQuantity,
    billCount: bills.size,
    averageBillValue: calculateAverageBillValue(totalNetSale, bills.size),
    staffCount: staff.size,
    brandCount: brands.size,
    categoryCount: categories.size,
    rowCount: rows.length,
    topStaff: topRanked(staffSales),
    topBrands: topRanked(brandSales),
    topCategories: topRanked(categorySales),
    topItems: topRanked(itemSales),
    dailyTrend: trendDates.map((date) => dailySales.get(date) ?? { date, totalSale: 0, quantity: 0 }),
    storeSummaries: [...storeBuckets.values()],
  };
}

export async function getStoreSalesSummary(
  filters: SalesAnalyticsFilters,
  stores: Array<Pick<Store, "id" | "name" | "code" | "monthly_target_enabled" | "monthly_target">>,
) {
  const summary = await getSalesSummary(filters, stores);
  return summary.storeSummaries;
}

export async function getStaffSalesSummary(filters: SalesAnalyticsFilters) {
  const rows = await getSalesRows(filters);
  const staff = new Map<
    string,
    {
      staffName: string;
      totalSale: number;
      quantitySold: number;
      bills: Set<string>;
      categories: Map<string, number>;
      brands: Map<string, number>;
    }
  >();

  for (const row of rows) {
    if (!row.staff_name?.trim()) {
      continue;
    }

    const staffName = cleanName(row.staff_name, "Unspecified");
    const bucket =
      staff.get(staffName) ??
      {
        staffName,
        totalSale: 0,
        quantitySold: 0,
        bills: new Set<string>(),
        categories: new Map<string, number>(),
        brands: new Map<string, number>(),
      };
    const sale = Number(row.net_sale ?? 0);
    const quantity = Number(row.quantity ?? 0);
    bucket.totalSale += sale;
    bucket.quantitySold += quantity;

    const billKey = uniqueBillKey(row);
    if (billKey) {
      bucket.bills.add(billKey);
    }

    if (row.category?.trim()) {
      const category = cleanName(row.category, "Unspecified");
      bucket.categories.set(category, (bucket.categories.get(category) ?? 0) + sale);
    }

    if (row.brand?.trim()) {
      const brand = cleanName(row.brand, "Unspecified");
      bucket.brands.set(brand, (bucket.brands.get(brand) ?? 0) + sale);
    }

    staff.set(staffName, bucket);
  }

  return [...staff.values()]
    .map((item) => {
      const topCategory = [...item.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const topBrand = [...item.brands.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      return {
        staffName: item.staffName,
        totalSale: item.totalSale,
        billCount: item.bills.size,
        quantitySold: item.quantitySold,
        averageBillValue: calculateAverageBillValue(item.totalSale, item.bills.size),
        topCategory,
        topBrand,
      } satisfies StaffSalesSummary;
    })
    .sort((left, right) => right.totalSale - left.totalSale);
}

export async function getMissingSalesReportDates(
  stores: Array<Pick<Store, "id" | "name" | "code">>,
  dateRange: DateRange,
) {
  if (!stores.length) {
    return [];
  }

  const today = getIndiaToday();
  const endDate = dateRange.endDate > today ? today : dateRange.endDate;
  const expectedDates = dateList(dateRange.startDate, endDate);
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("store_id,report_date")
    .eq("report_type", "sales")
    .in(
      "store_id",
      stores.map((store) => store.id),
    )
    .gte("report_date", dateRange.startDate)
    .lte("report_date", endDate);

  const uploaded = new Set(
    (data ?? []).map((report) => `${report.store_id ?? ""}:${report.report_date ?? ""}`),
  );
  const missing: MissingSalesReportDate[] = [];

  for (const store of stores) {
    for (const date of expectedDates) {
      if (!uploaded.has(`${store.id}:${date}`)) {
        missing.push({
          store,
          date,
          status: date === today ? "today-not-uploaded" : "missing",
        });
      }
    }
  }

  return missing;
}

export function currentMonthRange() {
  const today = getIndiaToday();
  return {
    startDate: getIndiaMonthStart(today),
    endDate: today,
  } satisfies DateRange;
}

export function currentWeekRange() {
  const today = getIndiaToday();
  return {
    startDate: weekStart(today),
    endDate: today,
  } satisfies DateRange;
}

export function currentDayOfMonth() {
  return getIndiaDayOfMonth();
}
