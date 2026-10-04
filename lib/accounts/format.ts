// Shared by server and client code: no server-only imports.

export function indiaToday() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹ with paise; amounts arrive from Postgres numeric as strings or numbers. */
export function money(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(number) ? rupees.format(number) : "—";
}

/** Tally-style supplier balance: Cr = we owe the supplier, Dr = the supplier owes us. */
export function drCr(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number === 0) return money(0);
  return `${money(Math.abs(number))} ${number > 0 ? "Cr" : "Dr"}`;
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Indian financial year label, e.g. 2026-10-03 -> "2026-27" (same rule as SQL financial_year). */
export function financialYear(date: string) {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function isoDateOrNull(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null;
}

export const documentKinds = [
  { value: "purchase_invoice", label: "Supplier invoice (PDF/photo)" },
  { value: "purchase_export", label: "Logic purchase export" },
  { value: "item_sheet", label: "Barcode item sheet" },
  { value: "credit_note", label: "Credit note" },
  { value: "debit_note", label: "Debit note" },
  { value: "payment_proof", label: "Payment proof" },
  { value: "supplier_statement", label: "Company statement" },
  { value: "return_dispatch", label: "Stock return dispatch" },
  { value: "return_acknowledgement", label: "Return acknowledgement" },
  { value: "terms_agreement", label: "Terms / MOU" },
  { value: "opening_balance_evidence", label: "Opening balance evidence" },
  { value: "gst_return", label: "GST return (GSTR-2B JSON)" },
  { value: "other", label: "Other" },
] as const;

/** Kinds a manager without a financial grant may submit for their store. */
export const managerDocumentKinds = ["purchase_invoice", "purchase_export", "item_sheet", "return_dispatch"];

export function labelFor(options: ReadonlyArray<{ value: string; label: string }>, value: string | null | undefined) {
  return options.find((option) => option.value === value)?.label ?? value ?? "—";
}

export const settlementBases = [
  { value: "to_confirm", label: "To confirm" },
  { value: "purchase", label: "Pay against purchases" },
  { value: "sales", label: "Pay against sold stock" },
] as const;

export const paymentCycles = [
  { value: "to_confirm", label: "To confirm" },
  { value: "per_invoice", label: "Per invoice" },
  { value: "monthly", label: "Monthly" },
  { value: "season", label: "Per season" },
  { value: "other", label: "Other" },
] as const;

export const coverageLabels: Record<string, string> = {
  bill_level: "Bill-level report",
  summary_only: "Summary only (no bills): replace with BILL WISE SALES REPORT",
  mixed: "Bills + summary lines",
  missing: "No report",
  zero_confirmed: "No sales (confirmed)",
  empty: "Empty report",
};

export function normalizeGstin(value: string) {
  const gstin = value.toUpperCase().replace(/\s+/g, "");
  return gstin ? gstin : null;
}

export function validGstin(value: string | null) {
  return value === null || /^[0-9]{2}[A-Z0-9]{13}$/.test(value);
}

export const importFields = [
  { value: "brand", label: "Brand" }, { value: "article", label: "Article / style" }, { value: "description", label: "Description" },
  { value: "barcode", label: "Barcode" }, { value: "lot_code", label: "Logic lot code" }, { value: "size", label: "Size" }, { value: "colour", label: "Colour" }, { value: "hsn", label: "HSN" },
  { value: "quantity", label: "Quantity (required)" }, { value: "mrp", label: "MRP (per piece)" }, { value: "unit_rate", label: "Purchase rate (per piece)" },
  { value: "taxable_amount", label: "Taxable amount (line)" }, { value: "gst_rate", label: "GST % (numeric only)" }, { value: "cgst_amount", label: "CGST amount" },
  { value: "sgst_amount", label: "SGST amount" }, { value: "igst_amount", label: "IGST amount" }, { value: "line_total", label: "Line total" },
] as const;
export type ImportField = (typeof importFields)[number]["value"];
export type ColumnMap = Partial<Record<ImportField, string>>;

export const voucherTypes = [
  { value: "purchase", label: "Purchase" }, { value: "payment", label: "Payment" }, { value: "receipt", label: "Refund received" },
  { value: "credit_note", label: "Credit note" }, { value: "debit_note", label: "Debit note" }, { value: "opening", label: "Opening balance" },
  { value: "journal", label: "Journal" },
] as const;

export const noteReasons = [
  { value: "return", label: "Stock return" }, { value: "margin", label: "Margin / sales settlement" }, { value: "promotion", label: "Promotion share" },
  { value: "rate_difference", label: "Rate difference" }, { value: "shortage", label: "Shortage / damage" }, { value: "other", label: "Other" },
] as const;

export const paymentModes = [
  { value: "bank", label: "Bank transfer" }, { value: "upi", label: "UPI" }, { value: "cheque", label: "Cheque" }, { value: "cash", label: "Cash" }, { value: "other", label: "Other" },
] as const;
