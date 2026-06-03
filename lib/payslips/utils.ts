import { format } from "date-fns";

export function formatMoney(value?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value ?? 0) ? 0 : 2,
    style: "currency",
  }).format(value ?? 0);
}

export function formatMonth(value: string | Date) {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  return format(date, "MMMM yyyy");
}

export function monthInputToDate(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return "";
  }

  return `${value}-01`;
}

export function salaryMonthFilePart(value: string) {
  return formatMonth(value).replace(/\s+/g, "_");
}

export function cleanFilePart(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function payslipFileName(storeName: string, staffName: string, salaryMonth: string) {
  const store = cleanFilePart(storeName) || "Store";
  const staff = cleanFilePart(staffName) || "Staff";

  return `${store}_${staff}_Payslip_${salaryMonthFilePart(salaryMonth)}.pdf`;
}

export function storePayslipHeading(storeName: string) {
  return `${storeName.toUpperCase()} - Salary Slip`;
}

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return null;
  }

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function numberOrZero(value: unknown) {
  return numberOrNull(value) ?? 0;
}
