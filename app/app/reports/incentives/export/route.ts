import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { staffIncentives } from "@/lib/incentives/queries";
import { monthStart } from "@/lib/money/format";

// CSV of one store's month for the payroll sheet's COMMISSION column (owner only).
export async function GET(request: Request) {
  const owner = await requireOwner();
  if (!owner) return new Response("Not allowed", { status: 403 });
  const url = new URL(request.url);
  const stores = await getAccessibleStores(owner.profile);
  const store = stores.find((item) => item.id === url.searchParams.get("store"));
  const month = url.searchParams.get("month") ?? "";
  if (!store || !/^\d{4}-\d{2}$/.test(month)) return new Response("Choose a store and month", { status: 400 });
  const { rows } = await staffIncentives(store.id, monthStart(`${month}-01`));
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) || /^[=+\-@]/.test(text) ? `"${text.replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"` : text;
  };
  const lines = [
    ["Store", "Month", "Salesperson", "Net sale", "Bills", "Average bill", "Items per bill", "Target", "Achieved %", "Incentive"],
    ...rows.map((row) => [store.name, month, row.staffName, row.netSale.toFixed(2), row.bills, row.averageBill.toFixed(2), row.itemsPerBill.toFixed(2),
      row.target?.toFixed(2) ?? "", row.achievedPct?.toFixed(1) ?? "", row.incentive.toFixed(2)]),
  ];
  return new Response(lines.map((line) => line.map(cell).join(",")).join("\n") + "\n", {
    headers: {
      "Content-Disposition": `attachment; filename="incentives-${store.code}-${month}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
