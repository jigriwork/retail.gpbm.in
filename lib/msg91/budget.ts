import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

export type WhatsAppDeliveryKind = "customer_follow_up" | "customer_thank_you" | "owner_night_plan" | "owner_summary" | "payslip";

function positiveNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function whatsappBudgetConfig() {
  return {
    budget: positiveNumber("MSG91_MONTHLY_BUDGET_INR", 1500),
    buffer: positiveNumber("MSG91_BUDGET_BUFFER_INR", 100),
    dailyFollowupLimit: Math.floor(positiveNumber("MSG91_DAILY_FOLLOWUP_LIMIT", 10)),
    followupLimit: Math.floor(positiveNumber("MSG91_MONTHLY_FOLLOWUP_LIMIT", 300)),
    marketingRate: positiveNumber("MSG91_MARKETING_RATE_INR", 0.8631),
    salaryReserve: positiveNumber("MSG91_SALARY_RESERVE_INR", 25),
    utilityRate: positiveNumber("MSG91_UTILITY_RATE_INR", 0.115),
  };
}

export function whatsappUnitCost(kind: WhatsAppDeliveryKind) {
  const config = whatsappBudgetConfig();
  return kind === "payslip" || kind === "owner_summary" || kind === "owner_night_plan" ? config.utilityRate : config.marketingRate;
}

function indiaParts(now = new Date()) {
  const india = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return india;
}

function monthBounds(now = new Date()) {
  const india = indiaParts(now);
  const start = new Date(Date.UTC(india.getFullYear(), india.getMonth(), 1) - 5.5 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(india.getFullYear(), india.getMonth() + 1, 1) - 5.5 * 60 * 60 * 1000);
  return { end: end.toISOString(), key: `${india.getFullYear()}-${String(india.getMonth() + 1).padStart(2, "0")}`, start: start.toISOString() };
}

function todayStart(now = new Date()) {
  const india = indiaParts(now);
  return new Date(Date.UTC(india.getFullYear(), india.getMonth(), india.getDate()) - 5.5 * 60 * 60 * 1000).toISOString();
}

async function monthDeliveries(storeId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Secure messaging budget is unavailable.");
  const { start, end } = monthBounds();
  const rows: Array<{ created_at: string; kind: string; status: string; unit_cost_inr: number }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("whatsapp_deliveries")
      .select("created_at,kind,status,unit_cost_inr")
      .eq("store_id", storeId)
      .gte("created_at", start)
      .lt("created_at", end)
      .range(from, from + 999);
    if (error) throw new Error("WhatsApp budget could not be checked.");
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

export async function whatsappBudgetAllowance(storeId: string, kind: WhatsAppDeliveryKind, requested: number) {
  const config = whatsappBudgetConfig();
  const rows = await monthDeliveries(storeId);
  // The owners' daily summary (about ₹8 a month) never uses the store's
  // customer and salary message budget.
  const counted = rows.filter((row) => row.kind !== "owner_summary" && row.kind !== "owner_night_plan" && ["processing", "accepted", "delivered", "read"].includes(row.status));
  const spent = counted.reduce((sum, row) => sum + Number(row.unit_cost_inr || 0), 0);
  const unitCost = whatsappUnitCost(kind);
  const ceiling = kind === "payslip"
    ? config.budget - config.buffer
    : config.budget - config.buffer - config.salaryReserve;
  const budgetSlots = Math.max(0, Math.floor((ceiling - spent + 1e-8) / unitCost));
  const followups = counted.filter((row) => row.kind === "customer_follow_up").length;
  const followupSlots = kind === "customer_follow_up" ? Math.max(0, config.followupLimit - followups) : requested;
  const dailyFollowups = kind === "customer_follow_up"
    ? counted.filter((row) => row.kind === "customer_follow_up" && row.created_at >= todayStart()).length
    : 0;
  const dailySlots = kind === "customer_follow_up" ? Math.max(0, config.dailyFollowupLimit - dailyFollowups) : requested;
  return {
    allowed: Math.max(0, Math.min(requested, budgetSlots, followupSlots, dailySlots)),
    budget: config.budget,
    followups,
    followupLimit: config.followupLimit,
    spent,
    unitCost,
  };
}

export async function whatsappBudgetSnapshot(storeId: string) {
  const config = whatsappBudgetConfig();
  const rows = await monthDeliveries(storeId);
  // The owners' daily summary (about ₹8 a month) never uses the store's
  // customer and salary message budget.
  const counted = rows.filter((row) => row.kind !== "owner_summary" && row.kind !== "owner_night_plan" && ["processing", "accepted", "delivered", "read"].includes(row.status));
  const spent = counted.reduce((sum, row) => sum + Number(row.unit_cost_inr || 0), 0);
  return {
    budget: config.budget,
    customerThankYous: counted.filter((row) => row.kind === "customer_thank_you").length,
    followups: counted.filter((row) => row.kind === "customer_follow_up").length,
    followupLimit: config.followupLimit,
    payslips: counted.filter((row) => row.kind === "payslip").length,
    remaining: Math.max(0, config.budget - spent),
    spent,
  };
}
