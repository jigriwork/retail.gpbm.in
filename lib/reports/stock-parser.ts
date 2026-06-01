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

const headerAliases = {
  storeName: ["store", "store name", "branch", "location"],
  itemName: ["item", "item name", "product", "product name", "description"],
  sku: ["sku", "item code", "product code", "style code"],
  barcode: ["barcode"],
  brand: ["brand", "brand name"],
  category: ["category", "department", "section", "group"],
  size: ["size"],
  color: ["color", "colour"],
  quantity: ["quantity", "qty", "stock", "closing stock", "balance qty", "pcs", "pieces"],
  mrp: ["mrp", "rate", "price", "selling price"],
  costPrice: ["cost", "cost price", "purchase price", "wsp"],
  supplier: ["supplier", "vendor"],
  purchaseDate: ["purchase date", "inward date", "grn date"],
  ageingDays: ["ageing", "aging", "age", "days"],
} satisfies Record<keyof Omit<ParsedStockRow, "rawData">, string[]>;

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

function buildColumnMap(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const map = new Map<keyof Omit<ParsedStockRow, "rawData">, string>();

  for (const [field, aliases] of Object.entries(headerAliases) as Array<
    [keyof Omit<ParsedStockRow, "rawData">, string[]]
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
  map: Map<keyof Omit<ParsedStockRow, "rawData">, string>,
  field: keyof Omit<ParsedStockRow, "rawData">,
) {
  const header = map.get(field);
  return header ? row[header] : null;
}

export async function parseStockFile(file: File) {
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
    }));
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
