import { getAccessibleStores, type Profile } from "@/lib/auth/session";
import { getAccessibleChecklists } from "@/lib/checklist/queries";
import { getSalaryAttendanceOverview } from "@/lib/reports/salary-queries";
import { getStockOverview } from "@/lib/reports/stock-queries";
import { getStoreSalesStatuses } from "@/lib/reports/sales-queries";
import { currentMonthRange, getDateRangeForPeriod, getSalesSummary, getStaffSalesSummary } from "@/lib/analytics/sales";
import { getLatestStockMonth, getStockSummary } from "@/lib/analytics/stock";
import { getPreviousWeekRangeAsiaKolkata, getWeeklyAuditSummaries, isWeeklyAuditDay } from "@/lib/audit/weekly";
import { getTaskSummary } from "@/lib/tasks/queries";
import { getTodayUpdateSummary } from "@/lib/updates/queries";
import { createClient } from "@/lib/supabase/server";

const maxImportantUpdates = 5;
const maxMemories = 8;

function nowInIndia() {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function shouldIncludeWeeklyAudit(prompt: string) {
  const lower = prompt.toLowerCase();
  return isWeeklyAuditDay() || lower.includes("monday") || lower.includes("weekly") || lower.includes("audit");
}

export async function getActiveAiMemories(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_memories")
    .select("id,title,content,memory_type,importance,created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("importance", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(maxMemories);

  return data ?? [];
}

export async function buildSecretaryContext(profile: Profile, prompt: string) {
  const stores = await getAccessibleStores(profile);
  const storeIds = stores.map((store) => store.id);
  const supabase = await createClient();

  const [
    checklists,
    salesStatuses,
    monthSales,
    staffYesterday,
    salaryOverview,
    stockOverview,
    taskSummary,
    updateSummary,
    memories,
    latestStockMonth,
  ] = await Promise.all([
    getAccessibleChecklists(profile),
    getStoreSalesStatuses(stores),
    getSalesSummary({ storeIds, dateRange: currentMonthRange() }, stores),
    getStaffSalesSummary({ storeIds, dateRange: getDateRangeForPeriod("yesterday") }),
    getSalaryAttendanceOverview(stores),
    getStockOverview(stores),
    getTaskSummary(profile),
    getTodayUpdateSummary(stores),
    getActiveAiMemories(profile.id),
    getLatestStockMonth(),
  ]);

  const stockPulse = latestStockMonth
    ? await getStockSummary({
        storeIds,
        stockMonth: latestStockMonth,
        lookbackDays: 30,
        stores,
      })
    : null;
  const weeklyRange = getPreviousWeekRangeAsiaKolkata();
  const weeklyAudits = shouldIncludeWeeklyAudit(prompt)
    ? await getWeeklyAuditSummaries(stores, weeklyRange)
    : [];
  const { data: urgentUpdates } = await supabase
    .from("manager_updates")
    .select("title,details,urgency,status,created_at,stores(name,code)")
    .in("store_id", storeIds)
    .or("status.is.null,status.eq.open")
    .order("created_at", { ascending: false })
    .limit(maxImportantUpdates);

  return [
    `Current India time: ${nowInIndia()}.`,
    `User: ${profile.full_name ?? "GPBM user"} (${profile.role}).`,
    `Active accessible stores: ${stores.map((store) => `${store.name} (${store.code})`).join(", ") || "none"}.`,
    "",
    "Today checklist status:",
    ...checklists.map(
      (item) =>
        `- ${item.store.name}: ${item.status}, ${item.completionPercent}% complete, missing ${item.missingItems.map((missing) => missing.title).join(", ") || "none"}.`,
    ),
    "",
    "Yesterday sales status:",
    ...salesStatuses.map(
      (status) =>
        `- ${status.store.name}: ${status.yesterdayReport ? "uploaded" : "missing"} for ${status.yesterdayDate}; latest sale ${money(status.latestReport?.summary?.totalNetSale ?? 0)}.`,
    ),
    "",
    "This month sales by store:",
    ...monthSales.storeSummaries.map(
      (summary) =>
        `- ${summary.store.name}: ${money(summary.totalNetSale)}, bills ${summary.billCount}, qty ${summary.totalQuantity}.`,
    ),
    `Top staff yesterday: ${
      staffYesterday[0]
        ? `${staffYesterday[0].staffName} with ${money(staffYesterday[0].totalSale)}`
        : "No staff data found"
    }.`,
    "",
    "Stock pulse:",
    latestStockMonth && stockPulse
      ? `- Latest stock month ${latestStockMonth}; slow ${stockPulse.slowStockCandidates.length}, dead ${stockPulse.deadStockCandidates.length}, fast low stock ${stockPulse.fastMovingLowStockCandidates.length}; top categories ${stockPulse.topCategories
          .slice(0, 3)
          .map((item) => item.name)
          .join(", ") || "none"}.`
      : "- No stock report found yet.",
    "",
    `Manager updates: open urgent ${updateSummary.openUrgentCount}.`,
    ...(urgentUpdates ?? []).map(
      (update) =>
        `- ${update.stores?.name ?? "Store"}: ${update.title} (${update.urgency ?? "normal"}, ${update.status ?? "open"}).`,
    ),
    "",
    `Tasks: urgent today ${taskSummary.urgentCount}, today total ${taskSummary.todayCount}, owner/private ${profile.role === "owner" ? taskSummary.privateCount : 0}.`,
    "",
    `Salary attendance: ${salaryOverview.uploadedCount} uploaded, ${salaryOverview.missingCount} missing for ${salaryOverview.periodMonth}.`,
    `Stock report: ${stockOverview.uploadedCount} uploaded, ${stockOverview.missingCount} missing for ${stockOverview.periodMonth}.`,
    "",
    memories.length
      ? `Active memories: ${memories.map((memory) => `${memory.title ?? "Memory"}: ${memory.content}`).join(" | ")}.`
      : "Active memories: none.",
    "",
    weeklyAudits.length
      ? [
          `Weekly audit previous week ${weeklyRange.startDate} to ${weeklyRange.endDate}:`,
          ...weeklyAudits.map(
            (audit) =>
              `- ${audit.store.name}: sales ${money(audit.sales.totalNetSale)}, missing sales days ${audit.missingSalesReports.length}, checklist estimate ${audit.checklist.estimatedCompletionPercent}%, urgent open ${audit.updates.openUrgentCount}, pending tasks ${audit.tasks.overduePendingCount}, slow/dead stock ${audit.stockSignals.slowStockCount + audit.stockSignals.deadStockCount}.`,
          ),
        ].join("\n")
      : "Weekly audit: not included unless Monday or prompt asks for audit.",
  ].join("\n");
}

export function secretarySystemPrompt() {
  return [
    "You are GPBM Retail AI Secretary.",
    "You help Adib Sattar manage Go Planet and Brand Mark.",
    "You are calm, practical, non-bossy.",
    "You never command.",
    "You give short useful answers.",
    "You focus on what needs attention today.",
    "You use data from GPBM Retail only when available.",
    "If data is missing, say what needs to be uploaded.",
    "You do not invent sales or stock data.",
    "You can suggest content ideas only when user asks or when stock/sales data clearly supports it.",
    "Keep answers concise and action-oriented.",
    "Use phrases like: Want to review this? You may want to start with... Here are the 3 things that need attention.",
    "Avoid phrases like: Do this now. You must. Your command.",
  ].join("\n");
}
