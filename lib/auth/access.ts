// Access rules for store managers, shared by the proxy (every request) and by
// pages that trim what they show. Pure functions: no Next or Supabase imports.
//
// - Managers can use the app from 9:30 AM to 11:00 PM India time.
// - On a handheld device a manager gets the everyday store pages only, without
//   sales, stock or salary figures. The app never explains this difference.

const openMinutes = 9 * 60 + 30;
const closeMinutes = 23 * 60;

/** Set by the browser: "c" when the main pointer is a finger (phones, tablets). */
export const pointerCookie = "gpbm_pt";

export function indiaMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

export function isManagerHours(date = new Date()) {
  const minutes = indiaMinutes(date);
  return minutes >= openMinutes && minutes < closeMinutes;
}

export const managerHoursLabel = "9:30 AM to 11:00 PM";

const handheldAgent = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile|webOS/i;

/**
 * Any one signal is enough: the user agent, the browser's mobile hint, or a
 * touch-first pointer reported by the page (which still holds when a phone
 * browser asks for the "desktop site").
 */
export function isHandheld({
  mobileHint,
  pointer,
  userAgent,
}: {
  mobileHint?: string | null;
  pointer?: string | null;
  userAgent?: string | null;
}) {
  return mobileHint === "?1" || pointer === "c" || handheldAgent.test(userAgent ?? "");
}

// Everyday store work. Anything not listed here is left out on a handheld.
const handheldExact = new Set(["/app/reports", "/app/reports/sales", "/app/reports/stock", "/app/stores"]);
const handheldPrefixes = [
  "/app/today",
  "/app/accounts",
  "/app/money",
  "/app/customers",
  "/app/stock-counts",
  "/app/tasks",
  "/app/checklist",
  "/app/updates",
  "/app/sops",
  "/app/reviews",
  "/app/settings",
  "/app/reports/staff-aliases",
  "/app/staff-accounts",
];

/**
 * Cashiers: day close and expenses, daily uploads, stock counts and staff
 * requests (plus their own password page). Store profit stays owner-only.
 */
export function cashierAllows(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/app/money/profit" || path.startsWith("/app/money/profit/")) return false;
  return ["/app/money", "/app/stock-counts", "/app/cashier"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    || path === "/app/settings/account";
}

/** Accountants work only in Accounts (plus their own password page). */
export function accountantAllows(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === "/app/accounts" || path.startsWith("/app/accounts/") || path === "/app/settings/account";
}

export function handheldAllows(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return handheldExact.has(path) || handheldPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
