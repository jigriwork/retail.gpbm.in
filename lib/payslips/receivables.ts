"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/session";
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

export async function syncNegativePayslips(): Promise<SyncResult> {
  if (!(await requireOwner())) return { ok: false, message: "Owner required.", created: 0, updated: 0, skipped: 0 };
  const client = await createClient();
  const { data, error } = await client.rpc("sync_payroll_receivables", {});
  if (error || !data) return { ok: false, message: "Receivables could not be synchronized.", created: 0, updated: 0, skipped: 0 };
  revalidateReceivablePaths();
  return data as unknown as SyncResult;
}
export async function autoSyncReceivablesForBatch(batchId: string) {
  if (!(await requireOwner())) throw new Error("Owner required.");
  const client = await createClient();
  const { error } = await client.rpc("sync_payroll_receivables", { p_batch: batchId });
  if (error) throw new Error("Receivables could not be synchronized.");
}

async function changeReceivable(id: string, action: string, amount?: number, note?: string): Promise<ReceivableActionResult> {
  if (!(await requireOwner())) return { ok: false, message: "Owner required." };
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return { ok: false, message: "Enter a valid positive amount." };
  const client = await createClient();
  const { error } = await client.rpc("record_payroll_receivable", { p_id: id, p_action: action, p_amount: amount, p_note: note });
  if (error) return { ok: false, message: "Current receivable could not be updated. Reload before retrying." };
  revalidateReceivablePaths();
  return { ok: true, message: "Receivable updated." };
}
export async function markReceivableReceived(id: string) { return changeReceivable(id, "received"); }
export async function addPartialPayment(id: string, amount: number, note?: string) { return changeReceivable(id, "partial", amount, note); }
export async function markReceivableWaived(id: string, note?: string) { return changeReceivable(id, "waived", undefined, note); }
export async function markReceivableDisputed(id: string, note?: string) { return changeReceivable(id, "disputed", undefined, note); }
export async function markReceivablePending(id: string) { return changeReceivable(id, "pending"); }
