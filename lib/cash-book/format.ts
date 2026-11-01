// Formatting shared by the server page and the client grid (no imports from either).
import type { CashRow } from "@/lib/cash-book/queries";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Indian digit grouping without the ₹ sign; "—" when there is no figure (never 0). */
export function fmt(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? number.format(parsed) : "—";
}

export function signed(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return `${parsed > 0 ? "+" : ""}${fmt(parsed)}`;
}

export function dayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", weekday: "short", timeZone: "UTC" });
}

export function monthTitle(month: string) {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const missingLabel: Record<string, string> = { book_sales: "Book Sales", card: "Card", upi: "UPI", counted: "Counted cash", opening: "Opening" };

export function statusText(row: Pick<CashRow, "can_close" | "previous_closed" | "source" | "status">) {
  if (row.status === "closed") return row.source === "legacy_import" ? "Imported" : "Closed";
  if (row.status === "reviewed") return "Checked";
  if (row.status === "missing") return "Not entered";
  if (row.status === "future") return "Future";
  if (row.status === "before_start") return "Before start";
  if (row.status === "not_started") return "Not started";
  if (row.status === "no_access") return "No access";
  if (row.can_close) return "Ready to close";
  return row.previous_closed ? "Open" : "Open · previous day open";
}

/** First day of the month n months away from an ISO date (any day of the month). */
export function shiftMonth(month: string, n: number) {
  const value = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return value.toISOString().slice(0, 10);
}
