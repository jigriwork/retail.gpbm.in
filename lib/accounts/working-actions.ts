"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireFinance } from "@/lib/accounts/access";
import { isoDateOrNull } from "@/lib/accounts/format";
import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { createClient } from "@/lib/supabase/server";

const denied: AccountsActionState = { ok: false, message: "You do not have permission to change company workings." };

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function rupees(formData: FormData, key: string) {
  const raw = text(formData, key, 24).replace(/[,₹\s]/g, "");
  if (!raw) return null;
  return /^-?\d+(\.\d{1,6})?$/.test(raw) ? Number(raw) : NaN;
}

const clean = (error: { message: string } | null, fallback: string) => (error ? error.message : fallback);

function refresh(...paths: string[]) {
  for (const path of ["/app/accounts", "/app/accounts/workings", "/app/accounts/claims", ...paths]) revalidatePath(path);
}

export async function prepareWorking(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const from = isoDateOrNull(text(formData, "from"));
  const to = isoDateOrNull(text(formData, "to"));
  if (!from || !to) return { ok: false, message: "Choose the period." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prepare_working", {
    p_arrangement: text(formData, "arrangementId"), p_from: from, p_notes: text(formData, "notes", 2000) || null,
    p_rule_set: text(formData, "ruleSet") === "company_working" ? "company_working" : "agreed_terms", p_rules: null, p_to: to,
  });
  if (error) return { ok: false, message: clean(error, "Could not prepare the working.") };
  refresh();
  redirect(`/app/accounts/workings/${data}`);
}

export async function setWorkingStatus(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post")) && !(await requireFinance("approve"))) return denied;
  const runId = text(formData, "runId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_working_status", { p_note: text(formData, "note", 500) || null, p_run: runId, p_status: text(formData, "status") });
  if (error) return { ok: false, message: clean(error, "Could not change the working.") };
  refresh(`/app/accounts/workings/${runId}`);
  return { ok: true, message: "Working updated." };
}

export async function saveCompanyFigures(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const runId = text(formData, "runId");
  const payment = rupees(formData, "payment");
  const cn = rupees(formData, "cn");
  if (Number.isNaN(payment) || Number.isNaN(cn)) return { ok: false, message: "Enter the company's figures as numbers." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_company_figures", { p_cn: cn, p_note: text(formData, "note", 500) || null, p_payment: payment, p_run: runId });
  if (error) return { ok: false, message: clean(error, "Could not save.") };
  refresh(`/app/accounts/workings/${runId}`);
  return { ok: true, message: "Company's figures saved for comparison. They never replace ours." };
}

export async function approveBillDiscount(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await requireFinance("post");
  if (!session) return denied;
  const amount = rupees(formData, "amount");
  const saleDate = isoDateOrNull(text(formData, "saleDate"));
  if (amount === null || Number.isNaN(amount) || amount < 0 || !saleDate) return { ok: false, message: "Enter the approved amount (0 if none)." };
  const supabase = await createClient();
  const { error } = await supabase.from("bill_discount_approvals").upsert({
    approved_amount: amount, arrangement_id: text(formData, "arrangementId"), bill_no: text(formData, "billNo", 80), created_by: session.profile.id,
    note: text(formData, "note", 500) || null, sale_date: saleDate, store_id: text(formData, "storeId"),
  }, { onConflict: "arrangement_id,store_id,sale_date,bill_no" });
  if (error) return { ok: false, message: clean(error, "Could not save.") };
  return { ok: true, message: "Approval saved. Prepare the working again to use it." };
}

export async function matchClaim(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const supabase = await createClient();
  const { error } = await supabase.rpc("match_claim", { p_claim: text(formData, "claimId"), p_voucher: text(formData, "voucherId") });
  if (error) return { ok: false, message: clean(error, "Could not match.") };
  refresh("/app/accounts/reconciliation");
  return { ok: true, message: "Credit note matched. Any difference was raised as a dispute." };
}

export async function paySettlement(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  if (!(await requireFinance("post"))) return denied;
  const amount = rupees(formData, "amount");
  if (amount === null || Number.isNaN(amount) || amount <= 0) return { ok: false, message: "Enter the amount." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_settlement", { p_amount: amount, p_settlement: text(formData, "settlementId"), p_voucher: text(formData, "voucherId") });
  if (error) return { ok: false, message: clean(error, "Could not link the payment.") };
  refresh();
  return { ok: true, message: "Payment linked to the settlement." };
}
