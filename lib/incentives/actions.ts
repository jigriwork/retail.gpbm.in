"use server";

import { revalidatePath } from "next/cache";

import type { AccountsActionState } from "@/lib/accounts/master-actions";
import { canAccessStore, requireOwner, requireProfile } from "@/lib/auth/session";
import { parseSlabs } from "@/lib/incentives/calc";
import { notifyUsers } from "@/lib/notifications/send";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type State = AccountsActionState;

function text(formData: FormData, key: string, max = 200) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export async function saveScheme(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner sets incentive schemes." };
  const basis = text(formData, "basis", 20);
  const payout = text(formData, "payout", 20);
  const from = text(formData, "validFrom", 7);
  const slabs = parseSlabs(text(formData, "slabs", 400));
  if (text(formData, "name", 80).length < 2) return { ok: false, message: "Name the scheme." };
  if (!["sales_amount", "target_pct"].includes(basis)) return { ok: false, message: "Choose what the slabs are based on." };
  if (!["whole", "marginal"].includes(payout)) return { ok: false, message: "Choose how slabs pay." };
  if (!slabs) return { ok: false, message: "Write slabs as from:rate pairs, like 0:0, 100000:1, 200000:1.5 (rate is % of net sale, at most 20)." };
  if (!/^\d{4}-\d{2}$/.test(from)) return { ok: false, message: "Choose the first month." };
  const minBills = Number(text(formData, "minBills", 6) || 0);
  if (!Number.isInteger(minBills) || minBills < 0) return { ok: false, message: "Minimum bills must be a whole number." };
  const supabase = await createClient();
  const { error } = await supabase.from("incentive_schemes").insert({
    store_id: text(formData, "storeId", 60) || null, name: text(formData, "name", 80), valid_from: `${from}-01`,
    basis, payout: basis === "target_pct" ? "whole" : payout, slabs, min_bills: minBills,
  });
  if (error) return { ok: false, message: "Could not save the scheme." };
  revalidatePath("/app/reports/incentives");
  return { ok: true, message: "Scheme saved. It applies from that month until you end it." };
}

export async function endScheme(_state: State, formData: FormData): Promise<State> {
  if (!(await requireOwner())) return { ok: false, message: "Only the owner manages schemes." };
  const last = text(formData, "validTo", 7);
  if (!/^\d{4}-\d{2}$/.test(last)) return { ok: false, message: "Choose the last month." };
  const supabase = await createClient();
  const { error } = await supabase.from("incentive_schemes").update({ valid_to: `${last}-01` }).eq("id", text(formData, "schemeId", 60));
  if (error) return { ok: false, message: "Could not end the scheme (the last month cannot be before the first)." };
  revalidatePath("/app/reports/incentives");
  return { ok: true, message: "Scheme ended." };
}

export async function saveTarget(_state: State, formData: FormData): Promise<State> {
  const { profile } = await requireProfile();
  const storeId = text(formData, "storeId", 60);
  if (!profile || !["owner", "manager"].includes(profile.role) || !(await canAccessStore(storeId, profile))) return { ok: false, message: "You cannot set targets for this store." };
  const month = text(formData, "month", 7);
  const staffName = text(formData, "staffName", 80);
  const raw = text(formData, "target", 20).replace(/[₹,\s]/g, "");
  if (!/^\d{4}-\d{2}$/.test(month) || !staffName) return { ok: false, message: "Missing month or salesperson." };
  const supabase = await createClient();
  if (!raw) {
    await supabase.from("staff_targets").delete().eq("store_id", storeId).eq("month", `${month}-01`).eq("staff_name", staffName);
    revalidatePath("/app/reports/incentives");
    return { ok: true, message: "Target removed." };
  }
  const target = Number(raw);
  if (!Number.isFinite(target) || target <= 0) return { ok: false, message: "Enter the target in rupees." };
  const { error } = await supabase.from("staff_targets").upsert(
    { store_id: storeId, month: `${month}-01`, staff_name: staffName, target, set_by: profile.id, set_at: new Date().toISOString() },
    { onConflict: "store_id,month,staff_name" },
  );
  if (error) return { ok: false, message: "Could not save the target." };
  // Tell the salesperson (if they have a staff login).
  const admin = createAdminClient();
  const { data: login } = admin ? await admin.rpc("staff_login_for_sales_name", { p_name: staffName, p_store: storeId }) : { data: null };
  if (login) {
    const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
    await notifyUsers([login as string], { body: `₹${target.toLocaleString("en-IN")} for ${label}. You can see your progress on your home screen. All the best!`, createdBy: profile.id, kind: "alert", title: "🎯 Your target is set", url: "/staff" });
  }
  revalidatePath("/app/reports/incentives");
  return { ok: true, message: login ? "Saved. The salesperson is notified." : "Saved." };
}
