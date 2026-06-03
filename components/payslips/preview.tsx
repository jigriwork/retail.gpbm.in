import type { Tables } from "@/lib/supabase/database.types";
import { formatMoney, formatMonth, storePayslipHeading } from "@/lib/payslips/utils";

type Row = Tables<"payslip_rows">;

export function PayslipPreview({ row }: { row: Row }) {
  const sundayVisible = (row.sunday_present ?? 0) > 0 || (row.sunday_pay_amount ?? 0) > 0;
  const rows = [
    ["Firm", row.firm_name],
    ["Store Name", row.store_name],
    ["Salary Month", formatMonth(row.salary_month)],
    ["Name", row.staff_name ?? ""],
    ["Salary Amount", formatMoney(row.salary_amount)],
    ["Divided by Days", formatMoney(row.divided_by_days)],
    ["Absent Days", String(row.abs_days ?? 0)],
    ["Absent Amount", formatMoney(row.abs_amount)],
    ...(sundayVisible
      ? [
          ["Sunday Pay Rate", formatMoney(row.sunday_pay)],
          ["Sunday Present", String(row.sunday_present ?? 0)],
          ["Sunday Pay Amount", formatMoney(row.sunday_pay_amount)],
        ]
      : []),
    ["Advance Deduction", formatMoney(row.advance)],
    ["Commission", formatMoney(row.commission)],
    ["Net Payable", formatMoney(row.net_payable)],
  ];

  return (
    <div className="mx-auto max-w-2xl bg-white p-6 text-black shadow-sm print:shadow-none">
      <h1 className="text-center text-2xl font-bold">{storePayslipHeading(row.store_name)}</h1>
      <p className="mt-2 text-center text-sm">
        {row.store_name} | {formatMonth(row.salary_month)}
      </p>

      <table className="mx-auto mt-8 w-full max-w-xl border-collapse text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th className="w-2/5 border border-black bg-neutral-200 px-3 py-2 text-left font-bold text-red-700">
                {label}
              </th>
              <td className="border border-black px-3 py-2 text-left text-black">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-10 flex flex-wrap justify-center gap-4 text-xs">
        <span>Prepared By __________</span>
        <span>Verified By __________</span>
        <span>Received By __________</span>
      </div>
    </div>
  );
}
