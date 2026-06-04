import { createClient } from "@/lib/supabase/server";

export type ReceivableRow = {
  id: string;
  payslip_row_id: string | null;
  generated_payslip_id: string | null;
  batch_id: string | null;
  store_id: string | null;
  staff_name: string;
  normalized_staff_name: string | null;
  firm_name: string | null;
  store_name: string | null;
  salary_month: string;
  net_payable: number;
  receivable_amount: number;
  received_amount: number | null;
  balance_amount: number;
  status: string | null;
  received_at: string | null;
  received_by: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ReceivableSummary = {
  totalReceivable: number;
  pendingReceivable: number;
  receivedAmount: number;
  balanceAmount: number;
  staffCount: number;
  pendingStaffCount: number;
  storeTotals: { storeName: string; storeId: string; total: number; balance: number }[];
};

export async function getAvailableReceivableMonths() {
  const supabase = await createClient();

  // Get months from salary_receivables
  const { data: receivableMonths } = await supabase
    .from("salary_receivables")
    .select("salary_month")
    .order("salary_month", { ascending: false });

  // Get months from payslip_batches as fallback
  const { data: batchMonths } = await supabase
    .from("payslip_batches")
    .select("salary_month")
    .order("salary_month", { ascending: false });

  const monthSet = new Set<string>();
  for (const row of receivableMonths ?? []) {
    monthSet.add(row.salary_month);
  }
  for (const row of batchMonths ?? []) {
    monthSet.add(row.salary_month);
  }

  return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
}

export async function getReceivables(filters: {
  salaryMonth: string;
  storeId?: string;
  status?: string;
  search?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("salary_receivables")
    .select("*")
    .eq("salary_month", filters.salaryMonth)
    .order("store_name")
    .order("staff_name");

  if (filters.storeId) {
    query = query.eq("store_id", filters.storeId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.search) {
    query = query.ilike("staff_name", `%${filters.search}%`);
  }

  const { data } = await query;
  return (data ?? []) as ReceivableRow[];
}

export function computeReceivableSummary(rows: ReceivableRow[]): ReceivableSummary {
  let totalReceivable = 0;
  let pendingReceivable = 0;
  let receivedAmount = 0;
  let balanceAmount = 0;
  const pendingStaffSet = new Set<string>();
  const staffSet = new Set<string>();
  const storeMap = new Map<string, { storeName: string; storeId: string; total: number; balance: number }>();

  for (const row of rows) {
    totalReceivable += row.receivable_amount;
    receivedAmount += row.received_amount ?? 0;
    balanceAmount += row.balance_amount;
    staffSet.add(row.staff_name);

    if (row.status === "pending" || row.status === "partial") {
      pendingReceivable += row.balance_amount;
      pendingStaffSet.add(row.staff_name);
    }

    if (row.store_id) {
      const existing = storeMap.get(row.store_id);
      if (existing) {
        existing.total += row.receivable_amount;
        existing.balance += row.balance_amount;
      } else {
        storeMap.set(row.store_id, {
          balance: row.balance_amount,
          storeId: row.store_id,
          storeName: row.store_name ?? "Unknown",
          total: row.receivable_amount,
        });
      }
    }
  }

  return {
    balanceAmount,
    pendingReceivable,
    pendingStaffCount: pendingStaffSet.size,
    receivedAmount,
    staffCount: staffSet.size,
    storeTotals: Array.from(storeMap.values()),
    totalReceivable,
  };
}

export async function getReceivableSummaryForMonth(salaryMonth: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("salary_receivables")
    .select("receivable_amount,received_amount,balance_amount,status,staff_name,store_id,store_name")
    .eq("salary_month", salaryMonth);

  const rows = (data ?? []) as Pick<
    ReceivableRow,
    "receivable_amount" | "received_amount" | "balance_amount" | "status" | "staff_name" | "store_id" | "store_name"
  >[];

  let pendingTotal = 0;
  let pendingCount = 0;

  for (const row of rows) {
    if (row.status === "pending" || row.status === "partial") {
      pendingTotal += row.balance_amount;
      pendingCount += 1;
    }
  }

  return { pendingCount, pendingTotal };
}
