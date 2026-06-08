import * as XLSX from "xlsx";

export type ParsedStockRow = {
  storeName: string | null;
  itemName: string | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  quantity: number | null;
  mrp: number | null;
  costPrice: number | null;
  supplier: string | null;
  purchaseDate: string | null;
  ageingDays: number | null;
  rawData: Record<string, unknown>;
};

export type StockSummary = {
  totalQuantity: number;
  totalStockValueMrp: number | null;
  brandsFound: string[];
  categoriesFound: string[];
  brandSummary: Record<string, number>;
  categorySummary: Record<string, number>;
  topBrands: Array<{ name: string; quantity: number }>;
  topCategories: Array<{ name: string; quantity: number }>;
  itemCount: number;
  rowCount: number;
};

export type StockParseResult = {
  rows: ParsedStockRow[];
  sheetName: string | null;
  headerRowNumber: number | null;
  skippedTotalRows: number;
  titleRowsSkipped: number;
  headerFound: boolean;
};

const headerAliases = {
  storeName: ["godown name", "store", "store name", "branch", "location"],
  itemName: ["item", "item name", "product", "product name", "description"],
  sku: ["sku", "item code", "itemcode", "product code", "style code"],
  barcode: ["barcode", "addl item code", "additional item code", "alt item code"],
  brand: ["brand", "brand name", "company", "company name"],
  category: ["category", "department", "section", "group", "group1.grp1"],
  size: ["size", "pack / size", "pack size"],
  color: ["color", "colour"],
  quantity: [
    "quantity",
    "qty",
    "stock",
    "closing stock",
    "closing qty",
    "balance qty",
    "pcs",
    "pieces",
  ],
  mrp: ["mrp", "m.r.p", "rate", "price", "selling price"],
  costPrice: ["cost", "cost price", "purchase price", "wsp"],
  supplier: ["supplier", "vendor"],
  purchaseDate: ["purchase date", "pur date", "inward date", "grn date"],
  ageingDays: ["ageing", "aging", "age", "days"],
} satisfies Record<keyof Omit<ParsedStockRow, "rawData">, string[]>;

const headerScanRowLimit = 20;
const minimumHeaderMatches = 4;
const stockIdentityFields = ["itemName", "sku", "barcode", "brand", "category"] as const;
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

function integerValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.round(parsed);
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
  const map = new Map<keyof Omit<ParsedStockRow, "rawData">, string>();

  for (const [field, aliases] of Object.entries(headerAliases) as Array<
    [keyof Omit<ParsedStockRow, "rawData">, string[]]
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
  map: Map<keyof Omit<ParsedStockRow, "rawData">, string>,
  field: keyof Omit<ParsedStockRow, "rawData">,
) {
  const header = map.get(field);
  return header ? row[header] : null;
}

function isClearTotalRow(row: ParsedStockRow) {
  const identityText = [
    row.storeName,
    row.itemName,
    row.sku,
    row.barcode,
    row.brand,
    row.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!totalRowPattern.test(identityText)) {
    return false;
  }

  return stockIdentityFields.every((field) => {
    const value = row[field];
    return !value || totalRowPattern.test(value);
  });
}

function parseStockRow(
  row: Record<string, unknown>,
  columnMap: Map<keyof Omit<ParsedStockRow, "rawData">, string>,
): ParsedStockRow {
  return {
    storeName: stringValue(valueFor(row, columnMap, "storeName")),
    itemName: stringValue(valueFor(row, columnMap, "itemName")),
    sku: stringValue(valueFor(row, columnMap, "sku")),
    barcode: stringValue(valueFor(row, columnMap, "barcode")),
    brand: stringValue(valueFor(row, columnMap, "brand")),
    category: stringValue(valueFor(row, columnMap, "category")),
    size: stringValue(valueFor(row, columnMap, "size")),
    color: stringValue(valueFor(row, columnMap, "color")),
    quantity: numberValue(valueFor(row, columnMap, "quantity")),
    mrp: numberValue(valueFor(row, columnMap, "mrp")),
    costPrice: numberValue(valueFor(row, columnMap, "costPrice")),
    supplier: stringValue(valueFor(row, columnMap, "supplier")),
    purchaseDate: dateValue(valueFor(row, columnMap, "purchaseDate")),
    ageingDays: integerValue(valueFor(row, columnMap, "ageingDays")),
    rawData: row,
  };
}

export async function parseStockFileDetailed(file: File): Promise<StockParseResult> {
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
  const parsedRows: ParsedStockRow[] = [];
  let skippedTotalRows = 0;

  for (const values of sheetRows.slice(headerRow.index + 1)) {
    const rawData = rowArrayToRecord(headers, values);

    if (isEmptyRow(rawData)) {
      continue;
    }

    const row = parseStockRow(rawData, columnMap);

    if (isClearTotalRow(row)) {
      skippedTotalRows += 1;
      continue;
    }

    parsedRows.push(row);
  }

  return {
    rows: parsedRows,
    sheetName,
    headerRowNumber: headerRow.index + 1,
    skippedTotalRows,
    titleRowsSkipped: headerRow.index,
    headerFound: true,
  };
}

export async function parseStockFile(file: File) {
  const result = await parseStockFileDetailed(file);
  return result.rows;
}

function addQuantity(bucket: Map<string, number>, key: string | null, quantity: number) {
  if (!key) {
    return;
  }

  const cleanKey = normalizeName(key);
  bucket.set(cleanKey, (bucket.get(cleanKey) ?? 0) + quantity);
}

function topFromBucket(bucket: Map<string, number>) {
  return [...bucket.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, quantity]) => ({ name, quantity }));
}

export function summarizeStockRows(rows: ParsedStockRow[]): StockSummary {
  const items = new Set<string>();
  const brands = new Set<string>();
  const categories = new Set<string>();
  const brandQuantities = new Map<string, number>();
  const categoryQuantities = new Map<string, number>();
  let totalQuantity = 0;
  let totalStockValueMrp = 0;
  let hasMrpValue = false;

  for (const row of rows) {
    const quantity = row.quantity ?? 0;
    totalQuantity += quantity;

    if (row.itemName) {
      items.add(normalizeName(row.itemName));
    }

    if (row.brand) {
      brands.add(normalizeName(row.brand));
    }

    if (row.category) {
      categories.add(normalizeName(row.category));
    }

    if (row.mrp !== null && row.quantity !== null) {
      totalStockValueMrp += row.quantity * row.mrp;
      hasMrpValue = true;
    }

    addQuantity(brandQuantities, row.brand, quantity);
    addQuantity(categoryQuantities, row.category, quantity);
  }

  return {
    totalQuantity,
    totalStockValueMrp: hasMrpValue ? totalStockValueMrp : null,
    brandsFound: [...brands].sort(),
    categoriesFound: [...categories].sort(),
    brandSummary: Object.fromEntries(brandQuantities),
    categorySummary: Object.fromEntries(categoryQuantities),
    topBrands: topFromBucket(brandQuantities),
    topCategories: topFromBucket(categoryQuantities),
    itemCount: items.size,
    rowCount: rows.length,
  };
}
