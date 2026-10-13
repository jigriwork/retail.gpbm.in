import Image from "next/image";

import { rupeesInWords, slipBrand, slipFooter, slipLines } from "@/lib/payslips/layout";
import { formatMoney, formatMonth } from "@/lib/payslips/utils";
import type { Tables } from "@/lib/supabase/database.types";

type Row = Tables<"payslip_rows">;

/** On-screen copy of the salary slip; same content and layout as the PDF. */
export function PayslipPreview({ row }: { row: Row }) {
  const brand = slipBrand(row);
  const lines = slipLines(row);
  const month = formatMonth(row.salary_month);
  const details: Array<[string, string]> = [
    ["Employee", row.staff_name ?? "—"],
    ["Store", row.store_name ?? brand.name],
    ["Salary month", month],
    ["Days in month", String(row.divided_by_days ?? "—")],
  ];

  return (
    <div className="mx-auto max-w-2xl rounded-2xl bg-white p-5 text-slate-900 shadow-sm sm:p-8 print:shadow-none">
      <div className="flex items-start justify-between gap-4">
        {brand.logo ? (
          <Image alt={brand.name} className="h-12 w-auto sm:h-14" height={56} src={brand.logo} width={160} />
        ) : <p className="text-xl font-bold">{brand.name}</p>}
        <div className="text-right">
          <p className="text-lg font-bold tracking-wide text-indigo-800 sm:text-xl">SALARY SLIP</p>
          <p className="text-sm text-slate-500">{month}</p>
        </div>
      </div>
      <div className="mt-4 border-b border-slate-200 pb-4">
        {brand.legalName ? <p className="text-sm font-semibold">{brand.legalName}</p> : null}
        <p className="text-xs text-slate-500">{[brand.address, brand.gstin ? `GSTIN ${brand.gstin}` : ""].filter(Boolean).join(" · ")}</p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {([
          ["Earnings", lines.earnings, lines.totalEarnings],
          ["Deductions", lines.deductions, lines.totalDeductions],
        ] as const).map(([title, entries, total]) => (
          <table className="w-full border border-slate-200 text-sm" key={title}>
            <thead>
              <tr className="bg-slate-50 text-[0.7rem] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left font-bold">{title}</th>
                <th className="px-3 py-2 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.length ? entries.map(([label, value]) => (
                <tr key={label}>
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(value)}</td>
                </tr>
              )) : <tr><td className="px-3 py-2 text-slate-400" colSpan={2}>None</td></tr>}
              <tr className="border-t border-slate-200 font-bold">
                <td className="px-3 py-2">Total {title.toLowerCase()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-800 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-bold uppercase tracking-wide text-indigo-200">Net payable</p>
          <p className="text-xs">{rupeesInWords(lines.net)}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(lines.net)}</p>
      </div>

      <p className="mt-8 border-t border-slate-200 pt-3 text-xs font-semibold">{slipFooter}</p>
    </div>
  );
}
