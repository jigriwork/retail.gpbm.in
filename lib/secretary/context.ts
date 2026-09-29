import { checkedQuery } from "@/lib/supabase/complete-query";
import { getAccessibleStores, type Profile } from "@/lib/auth/session";
import { getAccessibleChecklists } from "@/lib/checklist/queries";
import { getSalaryAttendanceOverview } from "@/lib/reports/salary-queries";
import { getStockOverview } from "@/lib/reports/stock-queries";
import { getStoreSalesStatuses, getSuspiciousSalesReportWarningsFromReports } from "@/lib/reports/sales-queries";
import { currentMonthRange, getDateRangeForPeriod, getSalesSummary, getStaffSalesSummary } from "@/lib/analytics/sales";
import { getLatestStockMonth, getStockSummary } from "@/lib/analytics/stock";
import { getPreviousWeekRangeAsiaKolkata, getWeeklyAuditSummaries, isWeeklyAuditDay } from "@/lib/audit/weekly";
import { pendingWorkLines, visibleTasks } from "@/lib/secretary/tools";
import { getTodayUpdateSummary } from "@/lib/updates/queries";
import { createClient } from "@/lib/supabase/server";

const maxImportantUpdates = 5;
const maxMemories = 40;

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

function uploadTime(value?: string | null) {
  if (!value) return "no upload time";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function shouldIncludeWeeklyAudit(prompt: string) {
  const lower = prompt.toLowerCase();
  return isWeeklyAuditDay() || lower.includes("monday") || lower.includes("weekly") || lower.includes("audit");
}

export async function getActiveAiMemories(userId: string) {
  const supabase = await createClient();
  const { data } = await checkedQuery(supabase
    .from("ai_memories")
    .select("id,title,content,memory_type,importance,created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("importance", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(maxMemories));

  return data ?? [];
}

export async function buildSecretaryContext(profile: Profile, prompt: string) {
  const stores = await getAccessibleStores(profile);
  const storeIds = stores.map((store) => store.id);
  const supabase = await createClient();
  const monthRange = currentMonthRange();

  const [
    checklists,
    salesStatuses,
    monthSales,
    staffYesterday,
    salaryOverview,
    stockOverview,
    tasks,
    updateSummary,
    memories,
    latestStockMonth,
    suspiciousSalesReports,
  ] = await Promise.all([
    getAccessibleChecklists(profile),
    getStoreSalesStatuses(stores),
    getSalesSummary({ storeIds, dateRange: monthRange }, stores),
    getStaffSalesSummary({ storeIds, dateRange: getDateRangeForPeriod("yesterday") }),
    getSalaryAttendanceOverview(stores),
    getStockOverview(stores),
    visibleTasks(profile.id),
    getTodayUpdateSummary(stores),
    getActiveAiMemories(profile.id),
    getLatestStockMonth(),
    getSuspiciousSalesReportWarningsFromReports({
      endDate: monthRange.endDate,
      startDate: monthRange.startDate,
      storeIds,
    }),
  ]);

  const weeklyRange = getPreviousWeekRangeAsiaKolkata();
  const [stockPulse, weeklyAudits, { data: urgentUpdates }, { data: recentSalesBatches }] = await Promise.all([
    latestStockMonth
      ? getStockSummary({
          storeIds,
          stockMonth: latestStockMonth,
          lookbackDays: 30,
          stores,
        })
      : null,
    shouldIncludeWeeklyAudit(prompt) ? getWeeklyAuditSummaries(stores, weeklyRange) : [],
    checkedQuery(supabase
      .from("manager_updates")
      .select("title,details,urgency,status,created_at,stores(name,code)")
      .in("store_id", storeIds)
      .or("status.is.null,status.eq.open")
      .order("created_at", { ascending: false })
      .limit(maxImportantUpdates)),
    checkedQuery(supabase
      .from("sales_upload_batches")
      .select("original_file_name,status,upload_mode,detected_start_date,detected_end_date,total_dates,imported_dates,skipped_dates,replaced_dates,failed_dates,total_net_sale,stores(name,code)")
      .in("store_id", storeIds)
      .order("created_at", { ascending: false })
      .limit(3)),
  ]);

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
    "Latest daily sales uploads:",
    ...salesStatuses.map(
      (status) =>
        `- ${status.store.name}: latest report ${status.latestReport?.report_date ?? "none"}, uploaded by ${
          status.latestReport?.profiles?.full_name ?? status.latestReport?.profiles?.email ?? "unknown"
        }, upload time ${uploadTime(status.latestReport?.created_at)}, total ${money(status.latestReport?.summary?.totalNetSale ?? 0)}.`,
    ),
    "",
    "Recent historical sales imports:",
    ...((recentSalesBatches ?? []).length
      ? (recentSalesBatches ?? []).map(
          (batch) =>
            `- ${batch.stores?.name ?? "Store"}: ${batch.original_file_name ?? "file"}, ${batch.status ?? "status unknown"}, ${batch.detected_start_date ?? "no start"} to ${batch.detected_end_date ?? "no end"}, imported ${batch.imported_dates ?? 0}, skipped ${batch.skipped_dates ?? 0}, replaced ${batch.replaced_dates ?? 0}, failed ${batch.failed_dates ?? 0}, sale ${money(Number(batch.total_net_sale ?? 0))}.`,
        )
      : ["- No historical sales import batch found."]),
    "",
    `Suspicious sales reports this month: ${suspiciousSalesReports.length}.`,
    ...suspiciousSalesReports.slice(0, 5).map(
      (warning) =>
        `- ${warning.storeName}: ${warning.reportDate ?? "no date"}, file ${warning.fileName ?? "unknown"}; ${warning.warning}`,
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
      ? `- Latest stock month ${latestStockMonth}; slow ${stockPulse.candidateCounts.slow}, dead ${stockPulse.candidateCounts.dead}, fast low stock ${stockPulse.candidateCounts.fastLow}; top categories ${stockPulse.topCategories
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
    "Tasks and the owner's to-dos (use these ids with complete_task / reschedule_task):",
    ...pendingWorkLines(tasks, profile.id),
    "",
    `Salary attendance: ${salaryOverview.uploadedCount} uploaded, ${salaryOverview.missingCount} missing for ${salaryOverview.periodMonth}.`,
    `Stock report: ${stockOverview.uploadedCount} uploaded, ${stockOverview.missingCount} missing for ${stockOverview.periodMonth}.`,
    "",
    memories.length
      ? ["What you remember about this owner and the business:", ...memories.map((memory) => `- ${memory.title ?? "Memory"}: ${memory.content}`)].join("\n")
      : "What you remember about this owner and the business: nothing yet.",
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

export function ownerFirstName(profile: Pick<Profile, "email" | "full_name">) {
  const name = profile.full_name?.trim().split(/\s+/)[0] || profile.email?.split("@")[0] || "";
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "there";
}

export function greetingForNow() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export type ReplyLanguage = "english" | "hinglish" | "devanagari";

const languageInstruction: Record<ReplyLanguage, string> = {
  english: "English only — no Hindi words.",
  hinglish: "natural Hinglish (Hindi in Roman script, English words where Indians normally use them).",
  devanagari: "Hindi in Devanagari script.",
};

// Common Hindi words in Roman script; English-looking ones ("do", "so") are left out.
const hindiWords = new Set(
  "hai hain tha thi kya kaise kaisa kitna kitni kitne karo karna kardo kar gaya gayi hua hui nahi nahin mera meri mere mujhe hum humne aap aapka aaj kal yaad rakhna rakho wala wali wale sabse achha achhi accha bahut aur ki ka ke ko mein se abhi batao bolo dekho theek haan bhi kaun kab kyun kyon iss uss mahine hafte din dukaan becha bikri kuch sab koi jaldi zara".split(" "),
);

/** Picks Tia's reply language from the owner's latest message. */
export function detectReplyLanguage(message: string): ReplyLanguage {
  if (/[ऀ-ॿ]/.test(message)) return "devanagari";
  const words = message.toLowerCase().match(/[a-z]+/g) ?? [];
  const hindi = words.filter((word) => hindiWords.has(word)).length;
  return hindi >= 2 && hindi / Math.max(words.length, 1) >= 0.15 ? "hinglish" : "english";
}

export function secretarySystemPrompt({
  greet,
  ownerName,
  spoken,
  today,
  language,
}: {
  greet: boolean;
  language: ReplyLanguage;
  ownerName: string;
  spoken: boolean;
  today: string;
}) {
  return [
    `You are Tia, the personal AI secretary of ${ownerName}, an owner of GPBM Retail — the Go Planet and Brand Mark clothing stores in Berhampur, Odisha.`,
    "You are a warm, capable, practical Indian woman. Refer to yourself as Tia. When speaking Hindi use feminine forms for yourself (main dekh rahi hoon, maine kar diya).",
    `Each owner has their own Tia; you work only for ${ownerName}. Business data (sales, stock, stores, staff, store tasks) is shared by all owners.`,
    `Today is ${today} (India time).`,
    greet
      ? `This is the start of a new conversation: open with a short "${greetingForNow()}, ${ownerName}!" then answer.`
      : `You are mid-conversation: do not greet again. Use ${ownerName}'s name only occasionally.`,
    `Reply language for this message: ${languageInstruction[language]} Earlier messages in other languages do not change this.`,
    "Use your tools: list_tasks for pending work, complete_task when the owner says something is done, add_todo when they want something noted as a to-do, reschedule_task to move one, get_sales / get_staff_sales for any sales question about specific dates or people, search_past_conversations when they refer to something discussed earlier.",
    "When the owner tells you a lasting fact about the business, staff, suppliers, their preferences or plans, save it with remember_fact without being asked. Only save what the owner said, never your own conclusions from data.",
    "Never say you did something unless the tool result was ok. If more than one task could match what the owner means, ask which one — list the options briefly.",
    "Use GPBM Retail data only; never invent sales, stock or staff numbers. If data is missing, say what needs to be uploaded.",
    "Be calm, friendly and practical, never bossy. Suggest, don't command.",
    spoken
      ? "The owner is talking to you by voice and your reply will be read aloud: answer in 1–3 short natural sentences, no lists, no markdown, no ids, amounts like 'forty-five thousand rupees'."
      : "Keep answers short and useful. Use short bullet lists only when listing several items. Never show task ids.",
  ].join("\n");
}
