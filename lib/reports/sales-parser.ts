import * as XLSX from "xlsx";

export type ParsedSalesRow = {
  storeName: string | null;
  saleDate: string | null;
  billNo: string | null;
  itemName: string | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  quantity: number | null;
  mrp: number | null;
  discount: number | null;
  netSale: number | null;
  staffName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  rawData: Record<string, unknown>;
};

export type SalesSummary = {
  totalNetSale: number;
  rowCount: number;
  billCount: number;
  staffNames: string[];
  brandSummary: Record<string, number>;
  categorySummary: Record<string, number>;
  topStaff: Array<{ name: string; sale: number }>;
  topBrands: Array<{ name: string; sale: number }>;
  topCategories: Array<{ name: string; sale: number }>;
};

const headerAliases = {
  storeName: ["store", "store name", "branch", "location"],
  saleDate: ["date", "sale date", "bill date", "invoice date"],
  billNo: ["bill no", "bill number", "invoice", "invoice no", "receipt no"],
  itemName: ["item", "item name", "product", "product name", "description"],
  sku: ["sku", "item code", "product code"],
  barcode: ["barcode"],
  brand: ["brand", "brand name"],
  category: ["category", "department", "section", "group"],
  size: ["size"],
  color: ["color", "colour"],
  quantity: ["quantity", "qty", "pcs", "pieces"],
  mrp: ["mrp", "rate", "price"],
  discount: ["discount", "disc", "discount amount"],
  netSale: [
    "net sale",
    "sale amount",
    "amount",
    "net amount",
    "total",
    "final amount",
    "taxable value",
  ],
  staffName: ["staff", "staff name", "salesman", "sales person", "salesperson", "sold by"],
  customerName: ["customer", "customer name", "party name"],
  customerPhone: ["mobile", "phone", "customer phone", "contact"],
} satisfies Record<keyof Omit<ParsedSalesRow, "rawData">, string[]>;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = stringValue(value);

  if (!text) {
    return null;
  }

  const parsed = Number(text.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
    }
  }

  const text = stringValue(value);

  if (!text) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const indiaMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);

  if (indiaMatch) {
    const [, day, month, rawYear] = indiaMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function isEmptyRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => !stringValue(value));
}

function buildColumnMap(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const map = new Map<keyof Omit<ParsedSalesRow, "rawData">, string>();

  for (const [field, aliases] of Object.entries(headerAliases) as Array<
    [keyof Omit<ParsedSalesRow, "rawData">, string[]]
  >) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    const index = normalizedHeaders.findIndex((header) => aliasSet.has(header));

    if (index >= 0) {
      map.set(field, headers[index]);
    }
  }

  return map;
}

function valueFor(
  row: Record<string, unknown>,
  map: Map<keyof Omit<ParsedSalesRow, "rawData">, string>,
  field: keyof Omit<ParsedSalesRow, "rawData">,
) {
  const header = map.get(field);
  return header ? row[header] : null;
}

export async function parseSalesFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    cellDates: true,
    raw: false,
    type: "array",
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  const firstRow = rows.find((row) => !isEmptyRow(row));

  if (!firstRow) {
    return [];
  }

  const columnMap = buildColumnMap(Object.keys(firstRow));

  return rows
    .filter((row) => !isEmptyRow(row))
    .map((row) => ({
      storeName: stringValue(valueFor(row, columnMap, "storeName")),
      saleDate: dateValue(valueFor(row, columnMap, "saleDate")),
      billNo: stringValue(valueFor(row, columnMap, "billNo")),
      itemName: stringValue(valueFor(row, columnMap, "itemName")),
      sku: stringValue(valueFor(row, columnMap, "sku")),
      barcode: stringValue(valueFor(row, columnMap, "barcode")),
      brand: stringValue(valueFor(row, columnMap, "brand")),
      category: stringValue(valueFor(row, columnMap, "category")),
      size: stringValue(valueFor(row, columnMap, "size")),
      color: stringValue(valueFor(row, columnMap, "color")),
      quantity: numberValue(valueFor(row, columnMap, "quantity")),
      mrp: numberValue(valueFor(row, columnMap, "mrp")),
      discount: numberValue(valueFor(row, columnMap, "discount")),
      netSale: numberValue(valueFor(row, columnMap, "netSale")),
      staffName: stringValue(valueFor(row, columnMap, "staffName")),
      customerName: stringValue(valueFor(row, columnMap, "customerName")),
      customerPhone: stringValue(valueFor(row, columnMap, "customerPhone")),
      rawData: row,
    }));
}

function addSale(bucket: Map<string, number>, key: string | null, sale: number) {
  if (!key) {
    return;
  }

  const cleanKey = normalizeName(key);
  bucket.set(cleanKey, (bucket.get(cleanKey) ?? 0) + sale);
}

function topFromBucket(bucket: Map<string, number>) {
  return [...bucket.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, sale]) => ({ name, sale }));
}

export function summarizeSalesRows(rows: ParsedSalesRow[]): SalesSummary {
  const bills = new Set<string>();
  const staff = new Set<string>();
  const staffSales = new Map<string, number>();
  const brandSales = new Map<string, number>();
  const categorySales = new Map<string, number>();
  let totalNetSale = 0;

  for (const row of rows) {
    const sale = row.netSale ?? 0;
    totalNetSale += sale;

    if (row.billNo) {
      bills.add(normalizeName(row.billNo));
    }

    if (row.staffName) {
      staff.add(normalizeName(row.staffName));
    }

    addSale(staffSales, row.staffName, sale);
    addSale(brandSales, row.brand, sale);
    addSale(categorySales, row.category, sale);
  }

  return {
    totalNetSale,
    rowCount: rows.length,
    billCount: bills.size,
    staffNames: [...staff].sort(),
    brandSummary: Object.fromEntries(brandSales),
    categorySummary: Object.fromEntries(categorySales),
    topStaff: topFromBucket(staffSales),
    topBrands: topFromBucket(brandSales),
    topCategories: topFromBucket(categorySales),
  };
}

export function matchesStoreName(input: string | null, store: { name: string; code: string }) {
  if (!input) {
    return false;
  }

  const normalized = normalizeHeader(input);
  return normalized === normalizeHeader(store.name) || normalized === normalizeHeader(store.code);
}
