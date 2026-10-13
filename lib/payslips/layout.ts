import type { Tables } from "@/lib/supabase/database.types";

// What a salary slip shows, shared by the PDF and the on-screen preview so the
// two never drift apart. Earnings minus deductions equals the sheet's net
// payable (checked on all staff rows, Oct 2026).

type Row = Tables<"payslip_rows">;

export type SlipBrand = { address: string; logo: string | null; name: string };

export function slipBrand(row: Pick<Row, "store_name">): SlipBrand {
  const name = row.store_name ?? "";
  if (/brand\s*mark/i.test(name)) return { address: "Spectrum Center, Old Bus Stand, Berhampur", logo: "/brands/brand-mark.png", name: "Brand Mark" };
  if (/go\s*planet/i.test(name)) return { address: "City Mall, KK Complex, Berhampur", logo: "/brands/go-planet.png", name: "Go Planet" };
  return { address: "", logo: null, name };
}

export function slipLines(row: Row) {
  const amount = (value: number | null | undefined) => Number(value ?? 0);
  const earnings: Array<[string, number]> = [["Basic salary", amount(row.salary_amount)]];
  if (amount(row.sunday_pay_amount) > 0) earnings.push([`Sunday pay (${amount(row.sunday_present)} day${amount(row.sunday_present) === 1 ? "" : "s"})`, amount(row.sunday_pay_amount)]);
  if (amount(row.commission) > 0) earnings.push(["Commission", amount(row.commission)]);
  const deductions: Array<[string, number]> = [];
  if (amount(row.abs_amount) > 0 || amount(row.abs_days) > 0) deductions.push([`Absent (${amount(row.abs_days)} day${amount(row.abs_days) === 1 ? "" : "s"})`, amount(row.abs_amount)]);
  if (amount(row.advance) > 0) deductions.push(["Advance", amount(row.advance)]);
  return {
    deductions,
    earnings,
    net: amount(row.net_payable),
    totalDeductions: deductions.reduce((sum, [, value]) => sum + value, 0),
    totalEarnings: earnings.reduce((sum, [, value]) => sum + value, 0),
  };
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number) {
  return n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
}

function belowThousand(n: number) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [hundred ? `${ones[hundred]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Indian wording: 12,345 → "Twelve Thousand Three Hundred Forty Five Rupees Only". */
export function rupeesInWords(value: number) {
  const whole = Math.round(Math.abs(value));
  if (!whole) return "Zero Rupees Only";
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;
  const words = [
    crore ? `${belowHundred(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    rest ? belowThousand(rest) : "",
  ].filter(Boolean).join(" ");
  return `${value < 0 ? "Minus " : ""}${words} Rupees Only`;
}

export const slipFooter = "This is a computer-generated salary slip and does not require a signature.";
