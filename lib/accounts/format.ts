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

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
  summary_only: "Summary only (no bills)",
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
