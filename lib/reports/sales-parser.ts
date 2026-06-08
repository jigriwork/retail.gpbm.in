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

export type SalesParseResult = {
  rows: ParsedSalesRow[];
  sheetName: string | null;
  headerRowNumber: number | null;
  skippedTotalRows: number;
  titleRowsSkipped: number;
  headerFound: boolean;
};

const headerAliases = {
  storeName: ["godown name", "store", "store name", "branch", "location"],
  saleDate: ["bill date", "date", "sale date", "invoice date"],
  billNo: ["bill no", "bill no.", "bill number", "invoice", "invoice no", "invoice number", "receipt no"],
  itemName: ["item", "item name", "product", "product name", "description"],
  sku: ["sku", "item code", "product code"],
  barcode: ["barcode"],
  brand: ["brand", "brand name", "company", "company name"],
  category: ["category", "department", "section", "group", "group1.grp1"],
  size: ["size"],
  color: ["color", "colour"],
  quantity: ["sale qty", "sale quantity", "quantity", "qty", "pcs", "pieces"],
  mrp: ["mrp", "m.r.p", "m.r.p.", "rate", "price"],
  discount: ["discount", "disc", "discount amount"],
  netSale: [
    "net amount",
    "net amt",
    "net sale",
    "sale amount",
    "sales amount",
    "amount",
    "net amount",
    "total amount",
    "total",
    "final amount",
    "taxable value",
  ],
  staffName: ["agent name", "staff", "staff name", "salesman", "sales person", "salesperson", "sold by", "user name"],
  customerName: ["customer", "customer name", "party name"],
  customerPhone: ["rcu mobile no.", "rcu mobile no", "mobile", "phone", "customer phone", "contact"],
} satisfies Record<keyof Omit<ParsedSalesRow, "rawData">, string[]>;

const headerScanRowLimit = 20;
const minimumHeaderMatches = 4;
const salesIdentityFields = ["billNo", "itemName", "brand", "category", "staffName"] as const;
const totalRowPattern = /\b(grand\s+totals?|godown\s+wise\s+totals?|godown\s+totals?|sub\s*totals?|totals?)\b/i;

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

function hasUsefulHeader(value: unknown) {
  return Boolean(stringValue(value));
}

function uniqueHeaders(values: unknown[]) {
  const seen = new Map<string, number>();

  return values.map((value, index) => {
    const header = stringValue(value) ?? `Column ${index + 1}`;
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header}_${count}`;
  });
}

function buildColumnMap(headers: unknown[]) {
  const unique = uniqueHeaders(headers);
  const normalizedHeaders = unique.map(normalizeHeader);
  const map = new Map<keyof Omit<ParsedSalesRow, "rawData">, string>();

  for (const [field, aliases] of Object.entries(headerAliases) as Array<
    [keyof Omit<ParsedSalesRow, "rawData">, string[]]
  >) {
    const aliasSet = new Set(aliases.map(normalizeHeader));
    const index = normalizedHeaders.findIndex((header) => aliasSet.has(header));

    if (index >= 0) {
      map.set(field, unique[index]);
    }
  }

  return map;
}

function findHeaderRow(rows: unknown[][]) {
  let best: { index: number; score: number } | null = null;

  for (let index = 0; index < Math.min(rows.length, headerScanRowLimit); index += 1) {
    const row = rows[index] ?? [];

    if (!row.some(hasUsefulHeader)) {
      continue;
    }

    const score = buildColumnMap(row).size;

    if (!best || score > best.score) {
      best = { index, score };
    }
  }

  return best && best.score >= minimumHeaderMatches ? best : null;
}

function rowArrayToRecord(headers: unknown[], values: unknown[]) {
  const unique = uniqueHeaders(headers);

  return Object.fromEntries(
    unique.map((header, index) => [header, values[index] ?? null]),
  ) as Record<string, unknown>;
}

function valueFor(
  row: Record<string, unknown>,
  map: Map<keyof Omit<ParsedSalesRow, "rawData">, string>,
  field: keyof Omit<ParsedSalesRow, "rawData">,
) {
  const header = map.get(field);
  return header ? row[header] : null;
}

function isClearTotalRow(row: ParsedSalesRow) {
  const identityText = [
    row.storeName,
    row.billNo,
    row.itemName,
    row.brand,
    row.category,
    row.staffName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!totalRowPattern.test(identityText)) {
    return false;
  }

  return salesIdentityFields.every((field) => {
    const value = row[field];
    return !value || totalRowPattern.test(value);
  });
}

function parseSalesRow(
  row: Record<string, unknown>,
  columnMap: Map<keyof Omit<ParsedSalesRow, "rawData">, string>,
): ParsedSalesRow {
  return {
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
  };
}

export async function parseSalesFileDetailed(file: File): Promise<SalesParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    cellDates: true,
    raw: false,
    type: "array",
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return {
      rows: [],
      sheetName: null,
      headerRowNumber: null,
      skippedTotalRows: 0,
      titleRowsSkipped: 0,
      headerFound: false,
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    defval: null,
    header: 1,
    raw: false,
    blankrows: false,
  });
  const headerRow = findHeaderRow(sheetRows);

  if (!headerRow) {
    return {
      rows: [],
      sheetName,
      headerRowNumber: null,
      skippedTotalRows: 0,
      titleRowsSkipped: sheetRows.some((row) => row.some(hasUsefulHeader)) ? 1 : 0,
      headerFound: false,
    };
  }

  const headers = sheetRows[headerRow.index] ?? [];
  const columnMap = buildColumnMap(headers);
  const parsedRows: ParsedSalesRow[] = [];
  let skippedTotalRows = 0;

  for (const values of sheetRows.slice(headerRow.index + 1)) {
    const rawData = rowArrayToRecord(headers, values);

    if (isEmptyRow(rawData)) {
      continue;
    }

    const row = parseSalesRow(rawData, columnMap);

    if (isClearTotalRow(row)) {
      skippedTotalRows += 1;
      continue;
    }

    parsedRows.push(row);
  }

  return {
    rows: parsedRows,
    sheetName,
    headerRowNumber: headerRow.index + (range?.s.r ?? 0) + 1,
    skippedTotalRows,
    titleRowsSkipped: headerRow.index,
    headerFound: true,
  };
}

export async function parseSalesFile(file: File) {
  const result = await parseSalesFileDetailed(file);
  return result.rows;
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
  const storeName = normalizeHeader(store.name);
  const storeCode = normalizeHeader(store.code);

  if (normalized === storeName || normalized === storeCode) {
    return true;
  }

  if (storeName.length > 2 && normalized.includes(storeName)) {
    return true;
  }

  return new RegExp(`(^|[^a-z0-9])${storeCode}([^a-z0-9]|$)`, "i").test(input);
}
