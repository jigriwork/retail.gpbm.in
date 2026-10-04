import "server-only";

import { getStaffSalesSummary } from "@/lib/analytics/sales";
import { incentiveFor, nextSlab, type Scheme, type Slab } from "@/lib/incentives/calc";
import { monthEnd, monthStart } from "@/lib/money/format";
import { createClient } from "@/lib/supabase/server";

export type IncentiveRow = {
  staffName: string; netSale: number; returns: number; bills: number; items: number; averageBill: number; itemsPerBill: number;
  target: number | null; achievedPct: number | null; incentive: number; next: { rate: number; gap: number } | null;
};

/** The scheme in force for a store and month: a store's own scheme wins over an all-stores one. */
export async function schemeFor(storeId: string, month: string) {
  const supabase = await createClient();
  const start = monthStart(month);
  const { data } = await supabase.from("incentive_schemes").select("*")
    .lte("valid_from", start).order("valid_from", { ascending: false }).limit(200);
  const rows = (data ?? []).filter((row) => (!row.valid_to || row.valid_to >= start) && (row.store_id === storeId || row.store_id === null));
  return rows.find((row) => row.store_id === storeId) ?? rows.find((row) => row.store_id === null) ?? null;
}

export async function listSchemes() {
  const supabase = await createClient();
  const { data } = await supabase.from("incentive_schemes").select("*, stores(name)").order("valid_from", { ascending: false }).limit(50);
  return data ?? [];
}

export async function staffIncentives(storeId: string, month: string) {
  const supabase = await createClient();
  const start = monthStart(month);
  const [staff, scheme, { data: targets }] = await Promise.all([
    getStaffSalesSummary({ storeIds: [storeId], dateRange: { startDate: start, endDate: monthEnd(month) } }),
    schemeFor(storeId, month),
    supabase.from("staff_targets").select("staff_name,target").eq("store_id", storeId).eq("month", start),
  ]);
  const targetByName = new Map((targets ?? []).map((row) => [row.staff_name.trim().toUpperCase(), Number(row.target)]));
  const rules: Scheme | null = scheme ? { basis: scheme.basis as Scheme["basis"], payout: scheme.payout as Scheme["payout"], slabs: scheme.slabs as unknown as Slab[], min_bills: scheme.min_bills } : null;
  const rows: IncentiveRow[] = staff
    .filter((item) => item.staffName && item.staffName !== "Unspecified")
    .map((item) => {
      const target = targetByName.get(item.staffName.trim().toUpperCase()) ?? null;
      const input = { bills: item.billCount, netSale: item.totalSale, target };
      return {
        staffName: item.staffName, netSale: item.totalSale, returns: item.returnAmount, bills: item.billCount, items: item.quantitySold,
        averageBill: item.averageBillValue, itemsPerBill: item.billCount ? item.quantitySold / item.billCount : 0,
        target, achievedPct: target ? (item.totalSale / target) * 100 : null,
        incentive: rules ? incentiveFor(rules, input) : 0, next: rules ? nextSlab(rules, input) : null,
      };
    });
  const unassigned = staff.find((item) => !item.staffName || item.staffName === "Unspecified");
  return { rows, scheme, unassignedSale: unassigned?.totalSale ?? 0 };
}
