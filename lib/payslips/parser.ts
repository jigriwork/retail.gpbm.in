import * as XLSX from "xlsx";

import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import { numberOrNull, numberOrZero } from "@/lib/payslips/utils";

type Store = Tables<"stores">;
export type ParsedPayslipRow = TablesInsert<"payslip_rows">;

const columnAliases = {
  name: ["name", "staff name", "employee name"],
  salary_amount: ["salary amount", "salary", "monthly salary", "salary amt"],
  divided_by_days: ["divided by days", "one day salary", "per day salary", "day salary"],
  abs_days: ["abs days", "absent days", "abs", "absent"],
  abs_amount: ["abs amount", "absent amount", "absent deduction"],
  sunday_pay: ["sunday pay", "sunday pay rate"],
  sunday_present: ["sunday present", "sundays present", "sunday worked"],
  advance: ["advance", "advance deduction"],
  commission: ["commission", "incentive"],
  total_amount: ["total amount", "net payable", "total", "payable", "net salary"],
  store: ["store", "store name", "branch"],
} as const;

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectStoreFromText(value: unknown, stores: Store[]) {
  const normalized = normalize(value);
  if (!normalized) return null;

  return (
    stores.find((store) => {
      const name = normalize(store.name);
      const code = normalize(store.code);
      const words = normalized.split(" ");

      if (normalized === name || normalized === code) return true;
      if (normalized.includes(name) || words.includes(code)) return true;
      if (name === "go planet" && ["gp", "go planet"].includes(normalized)) return true;
      if (name === "brand mark" && ["bm", "brand mark"].includes(normalized)) return true;

      return false;
    }) ?? null
  );
}

function getValue(row: Record<string, unknown>, aliases: readonly string[]) {
  const entries = Object.entries(row);
  const aliasSet = new Set(aliases.map(normalize));
  const exact = entries.find(([key]) => aliasSet.has(normalize(key)));

  if (exact) return exact[1];

  return entries.find(([key]) => {
    const normalizedKey = normalize(key);
    return aliases.some((alias) => normalizedKey.includes(normalize(alias)));
  })?.[1];
}

function rowHasContent(row: Record<string, unknown>) {
  return Object.values(row).some((value) => String(value ?? "").trim() !== "");
}

export function parsePayslipWorkbook({
  buffer,
  salaryMonth,
  stores,
  fallbackStoreId,
}: {
  buffer: ArrayBuffer;
  salaryMonth: string;
  stores: Store[];
  fallbackStoreId?: string;
}) {
  const workbook = XLSX.read(buffer, { cellDates: true, type: "array" });
  const fallbackStore = stores.find((store) => store.id === fallbackStoreId) ?? null;
  const rows: ParsedPayslipRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });
    const sheetStore = detectStoreFromText(sheetName, stores);

    for (const rawRow of sheetRows) {
      if (!rowHasContent(rawRow)) continue;

      const rowStore =
        detectStoreFromText(getValue(rawRow, columnAliases.store), stores) ??
        sheetStore ??
        fallbackStore;
      const staffName = String(getValue(rawRow, columnAliases.name) ?? "").trim();
      const salaryAmount = numberOrNull(getValue(rawRow, columnAliases.salary_amount));
      const dividedByDays =
        numberOrNull(getValue(rawRow, columnAliases.divided_by_days)) ??
        (salaryAmount ? salaryAmount / 30 : null);
      const absDays = numberOrZero(getValue(rawRow, columnAliases.abs_days));
      const absAmount =
        numberOrNull(getValue(rawRow, columnAliases.abs_amount)) ??
        (dividedByDays ? dividedByDays * absDays : 0);
      const sundayPay = numberOrZero(getValue(rawRow, columnAliases.sunday_pay));
      const sundayPresent = numberOrZero(getValue(rawRow, columnAliases.sunday_present));
      const sundayPayAmount = sundayPay * sundayPresent;
      const advance = numberOrZero(getValue(rawRow, columnAliases.advance));
      const commission = numberOrZero(getValue(rawRow, columnAliases.commission));
      const uploadedTotalAmount = numberOrNull(getValue(rawRow, columnAliases.total_amount));
      const calculatedTotalAmount =
        (salaryAmount ?? 0) - absAmount - advance + sundayPayAmount + commission;
      const netPayable = uploadedTotalAmount ?? calculatedTotalAmount;

      let status: ParsedPayslipRow["status"] = "ready";
      let warningMessage: string | null = null;

      if (!staffName) {
        status = "missing_staff_name";
        warningMessage = "Missing staff name.";
      } else if (salaryAmount === null) {
        status = "missing_salary_amount";
        warningMessage = "Missing salary amount.";
      } else if (!rowStore || !rowStore.firm_name) {
        status = "failed";
        warningMessage = "Missing store/firm mapping. Choose Go Planet or Brand Mark, then upload again.";
      } else if (uploadedTotalAmount !== null && Math.abs(uploadedTotalAmount - calculatedTotalAmount) > 1) {
        status = "total_mismatch";
        warningMessage = `Uploaded Total Amount does not match calculated salary. Uploaded Total: Rs ${uploadedTotalAmount.toFixed(2)}, Calculated Total: Rs ${calculatedTotalAmount.toFixed(2)}. Please review before sharing.`;
      }

      rows.push({
        abs_amount: absAmount,
        abs_days: absDays,
        advance,
        calculated_total_amount: calculatedTotalAmount,
        commission,
        divided_by_days: dividedByDays,
        firm_name: rowStore?.firm_name ?? "",
        net_payable: netPayable,
        raw_data: rawRow as Json,
        salary_amount: salaryAmount,
        salary_month: salaryMonth,
        staff_name: staffName || null,
        status,
        store_id: rowStore?.id ?? null,
        store_name: rowStore?.name ?? "Unknown",
        sunday_pay: sundayPay,
        sunday_pay_amount: sundayPayAmount,
        sunday_present: sundayPresent,
        uploaded_total_amount: uploadedTotalAmount,
        warning_message: warningMessage,
      });
    }
  }

  return rows;
}
