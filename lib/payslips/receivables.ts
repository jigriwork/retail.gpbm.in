"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
import { staffNameKey } from "@/lib/employees/utils";
import { createClient } from "@/lib/supabase/server";

export type SyncResult = {
  ok: boolean;
  message: string;
  created: number;
  updated: number;
  skipped: number;
};

export type ReceivableActionResult = {
  ok: boolean;
  message: string;
};

function revalidateReceivablePaths() {
  revalidatePath("/app/payslips");
  revalidatePath("/app/payslips/receivables");
  revalidatePath("/app/today");
}

/**
 * Sync negative payslip rows into salary_receivables.
 * Supports historical payslips already generated.
 * Does not duplicate due to unique(payslip_row_id).
 */
export async function syncNegativePayslips(): Promise<SyncResult> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can sync receivables.", created: 0, updated: 0, skipped: 0 };
  }

  const supabase = await createClient();

  // Get all payslip rows with negative net_payable
  const { data: negativeRows, error: rowsError } = await supabase
    .from("payslip_rows")
    .select("id,batch_id,store_id,staff_name,firm_name,store_name,salary_month,net_payable")
    .lt("net_payable", 0);

  if (rowsError) {
    return { ok: false, message: rowsError.message, created: 0, updated: 0, skipped: 0 };
  }

  if (!negativeRows?.length) {
    return { ok: true, message: "No negative payslip rows found.", created: 0, updated: 0, skipped: 0 };
  }

  // Get existing receivables keyed by payslip_row_id
  const rowIds = negativeRows.map((r) => r.id);
  const { data: existingReceivables } = await supabase
    .from("salary_receivables")
    .select("id,payslip_row_id,received_amount,status,receivable_amount")
    .in("payslip_row_id", rowIds);

  const existingMap = new Map(
    (existingReceivables ?? []).map((r) => [r.payslip_row_id, r]),
  );

  // Get generated payslip IDs for linking
  const { data: generatedPayslips } = await supabase
    .from("generated_payslips")
    .select("id,payslip_row_id")
    .in("payslip_row_id", rowIds);

  const generatedMap = new Map(
    (generatedPayslips ?? []).map((g) => [g.payslip_row_id, g.id]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of negativeRows) {
    const receivableAmount = Math.abs(row.net_payable ?? 0);
    const existing = existingMap.get(row.id);
    const generatedPayslipId = generatedMap.get(row.id) ?? null;
    const normalizedName = row.staff_name ? staffNameKey(row.staff_name) : null;

    if (existing) {
      // Do not overwrite waived or disputed status
      if (existing.status === "waived" || existing.status === "disputed") {
        // Still update receivable_amount if net_payable changed
        if (existing.receivable_amount !== receivableAmount) {
          const receivedAmount = existing.received_amount ?? 0;
          const balanceAmount = Math.max(0, receivableAmount - receivedAmount);
          await supabase
            .from("salary_receivables")
            .update({
              net_payable: row.net_payable ?? 0,
              receivable_amount: receivableAmount,
              balance_amount: balanceAmount,
              generated_payslip_id: generatedPayslipId,
              normalized_staff_name: normalizedName,
            })
            .eq("id", existing.id);
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      // Update if receivable_amount changed
      const receivedAmount = existing.received_amount ?? 0;
      const balanceAmount = Math.max(0, receivableAmount - receivedAmount);
      let status: string;
      if (receivedAmount === 0) {
        status = "pending";
      } else if (balanceAmount > 0) {
        status = "partial";
      } else {
        status = "received";
      }

      if (existing.receivable_amount !== receivableAmount || existing.status !== status) {
        await supabase
          .from("salary_receivables")
          .update({
            net_payable: row.net_payable ?? 0,
            receivable_amount: receivableAmount,
            balance_amount: balanceAmount,
            status,
            generated_payslip_id: generatedPayslipId,
            normalized_staff_name: normalizedName,
          })
          .eq("id", existing.id);
        updated += 1;
      } else {
        skipped += 1;
      }
    } else {
      // Create new receivable
      const { error: insertError } = await supabase.from("salary_receivables").insert({
        payslip_row_id: row.id,
        generated_payslip_id: generatedPayslipId,
        batch_id: row.batch_id,
        store_id: row.store_id,
        staff_name: row.staff_name ?? "Unknown",
        normalized_staff_name: normalizedName,
        firm_name: row.firm_name,
        store_name: row.store_name,
        salary_month: row.salary_month,
        net_payable: row.net_payable ?? 0,
        receivable_amount: receivableAmount,
        received_amount: 0,
        balance_amount: receivableAmount,
        status: "pending",
      });

      if (insertError) {
        // Likely duplicate, skip
        skipped += 1;
      } else {
        created += 1;
      }
    }
  }

  revalidateReceivablePaths();

  return {
    ok: true,
    message: `Sync complete. Created ${created}, updated ${updated}, skipped ${skipped}.`,
    created,
    updated,
    skipped,
  };
}

/**
 * Auto-sync receivables for a specific batch after payslip generation.
 * Called internally — does not require separate owner check.
 */
export async function autoSyncReceivablesForBatch(batchId: string) {
  const supabase = await createClient();

  const { data: negativeRows } = await supabase
    .from("payslip_rows")
    .select("id,batch_id,store_id,staff_name,firm_name,store_name,salary_month,net_payable")
    .eq("batch_id", batchId)
    .lt("net_payable", 0);

  if (!negativeRows?.length) return;

  const rowIds = negativeRows.map((r) => r.id);

  const { data: existingReceivables } = await supabase
    .from("salary_receivables")
    .select("id,payslip_row_id,received_amount,status,receivable_amount")
    .in("payslip_row_id", rowIds);

  const existingMap = new Map(
    (existingReceivables ?? []).map((r) => [r.payslip_row_id, r]),
  );

  const { data: generatedPayslips } = await supabase
    .from("generated_payslips")
    .select("id,payslip_row_id")
    .in("payslip_row_id", rowIds);

  const generatedMap = new Map(
    (generatedPayslips ?? []).map((g) => [g.payslip_row_id, g.id]),
  );

  for (const row of negativeRows) {
    const receivableAmount = Math.abs(row.net_payable ?? 0);
    const existing = existingMap.get(row.id);
    const generatedPayslipId = generatedMap.get(row.id) ?? null;
    const normalizedName = row.staff_name ? staffNameKey(row.staff_name) : null;

    if (existing) {
      if (existing.status === "waived" || existing.status === "disputed") continue;

      const receivedAmount = existing.received_amount ?? 0;
      const balanceAmount = Math.max(0, receivableAmount - receivedAmount);
      let status: string;
      if (receivedAmount === 0) {
        status = "pending";
      } else if (balanceAmount > 0) {
        status = "partial";
      } else {
        status = "received";
      }

      await supabase
        .from("salary_receivables")
        .update({
          net_payable: row.net_payable ?? 0,
          receivable_amount: receivableAmount,
          balance_amount: balanceAmount,
          status,
          generated_payslip_id: generatedPayslipId,
          normalized_staff_name: normalizedName,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("salary_receivables").insert({
        payslip_row_id: row.id,
        generated_payslip_id: generatedPayslipId,
        batch_id: row.batch_id,
        store_id: row.store_id,
        staff_name: row.staff_name ?? "Unknown",
        normalized_staff_name: normalizedName,
        firm_name: row.firm_name,
        store_name: row.store_name,
        salary_month: row.salary_month,
        net_payable: row.net_payable ?? 0,
        receivable_amount: receivableAmount,
        received_amount: 0,
        balance_amount: receivableAmount,
        status: "pending",
      });
    }
  }
}

// --- Status actions ---

export async function markReceivableReceived(receivableId: string): Promise<ReceivableActionResult> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can update receivables." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("salary_receivables")
    .select("id,receivable_amount")
    .eq("id", receivableId)
    .maybeSingle();

  if (!row) {
    return { ok: false, message: "Receivable not found." };
  }

  const { error } = await supabase
    .from("salary_receivables")
    .update({
      status: "received",
      received_amount: row.receivable_amount,
      balance_amount: 0,
      received_at: new Date().toISOString(),
      received_by: session.profile.id,
    })
    .eq("id", receivableId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateReceivablePaths();
  return { ok: true, message: "Marked as received." };
}

export async function addPartialPayment(
  receivableId: string,
  amount: number,
  note?: string,
): Promise<ReceivableActionResult> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can update receivables." };
  }

  if (amount <= 0) {
    return { ok: false, message: "Amount must be greater than zero." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("salary_receivables")
    .select("id,receivable_amount,received_amount,balance_amount")
    .eq("id", receivableId)
    .maybeSingle();

  if (!row) {
    return { ok: false, message: "Receivable not found." };
  }

  const newReceivedAmount = (row.received_amount ?? 0) + amount;
  const newBalance = Math.max(0, row.receivable_amount - newReceivedAmount);
  const newStatus = newBalance === 0 ? "received" : "partial";

  const { error } = await supabase
    .from("salary_receivables")
    .update({
      received_amount: newReceivedAmount,
      balance_amount: newBalance,
      status: newStatus,
      received_at: new Date().toISOString(),
      received_by: session.profile.id,
      note: note?.trim() || null,
    })
    .eq("id", receivableId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateReceivablePaths();
  return { ok: true, message: `Payment of ₹${amount} recorded. Balance: ₹${newBalance}.` };
}

export async function markReceivableWaived(
  receivableId: string,
  note?: string,
): Promise<ReceivableActionResult> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can update receivables." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("salary_receivables")
    .update({
      status: "waived",
      balance_amount: 0,
      note: note?.trim() || null,
    })
    .eq("id", receivableId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateReceivablePaths();
  return { ok: true, message: "Marked as waived." };
}

export async function markReceivableDisputed(
  receivableId: string,
  note?: string,
): Promise<ReceivableActionResult> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can update receivables." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("salary_receivables")
    .update({
      status: "disputed",
      note: note?.trim() || null,
    })
    .eq("id", receivableId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateReceivablePaths();
  return { ok: true, message: "Marked as disputed." };
}

export async function markReceivablePending(receivableId: string): Promise<ReceivableActionResult> {
  const session = await requireOwner();
  if (!session?.profile) {
    return { ok: false, message: "Only the owner can update receivables." };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("salary_receivables")
    .select("id,receivable_amount")
    .eq("id", receivableId)
    .maybeSingle();

  if (!row) {
    return { ok: false, message: "Receivable not found." };
  }

  const { error } = await supabase
    .from("salary_receivables")
    .update({
      status: "pending",
      received_amount: 0,
      balance_amount: row.receivable_amount,
      received_at: null,
      received_by: null,
    })
    .eq("id", receivableId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidateReceivablePaths();
  return { ok: true, message: "Reset to pending." };
}
