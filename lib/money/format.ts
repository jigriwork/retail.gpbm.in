// Shared labels and date helpers for store money (day close, expenses, profit).

export const expenseCategories = [
  { value: "tea_snacks", label: "Tea & snacks" },
  { value: "transport", label: "Transport & delivery" },
  { value: "repairs", label: "Repairs & maintenance" },
  { value: "packaging", label: "Bags & packaging" },
  { value: "cleaning", label: "Cleaning" },
  { value: "stationery", label: "Stationery & printing" },
  { value: "alteration", label: "Alteration" },
  { value: "electricity", label: "Electricity" },
  { value: "rent", label: "Rent" },
  { value: "internet_phone", label: "Internet & phone" },
  { value: "marketing", label: "Marketing" },
  { value: "staff_welfare", label: "Staff welfare" },
  { value: "other", label: "Other" },
] as const;

// Cash from the counter goes in the cash book, so it is not offered here.
export const paidFromOptions = [
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "owner", label: "Paid by owner" },
] as const;

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: string) {
  return addDays(addDays(monthStart(date), 32).slice(0, 7) + "-01", -1);
}

export function monthLabel(date: string) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC", year: "numeric" }).format(new Date(`${monthStart(date)}T00:00:00Z`));
}

/** "Balanced", "Short ₹120" or "Excess ₹40" for a day close difference (₹10 tolerance). */
export function differenceLabel(difference: number | null | undefined, format: (value: number) => string) {
  if (difference === null || difference === undefined) return { label: "Waiting for sales report", tone: "muted" as const };
  if (Math.abs(difference) <= 10) return { label: "Balanced", tone: "good" as const };
  return difference < 0
    ? { label: `Short ${format(Math.abs(difference))}`, tone: "bad" as const }
    : { label: `Excess ${format(difference)}`, tone: "warn" as const };
}
