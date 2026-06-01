import { getAccessibleStores, type Profile, type Store } from "@/lib/auth/session";
import { getSalesReportForStoreDate } from "@/lib/reports/sales-queries";
import { getSalaryAttendanceReportForStoreMonth } from "@/lib/reports/salary-queries";
import { getStockReportForStoreMonth } from "@/lib/reports/stock-queries";
import { getCleaningReview, getRackReview } from "@/lib/reviews/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaDayOfMonth, getIndiaMonthStart, getIndiaToday } from "@/lib/tasks/dates";
import { getManagerUpdates, type ManagerUpdate } from "@/lib/updates/queries";

export type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  required: boolean;
  href?: string;
  actionLabel?: string;
};

export type StoreChecklist = {
  store: Store;
  today: string;
  yesterday: string;
  items: ChecklistItem[];
  missingItems: ChecklistItem[];
  requiredCount: number;
  completedRequiredCount: number;
  completionPercent: number;
  status: "Complete" | "Partial" | "Missing" | "Needs attention";
  urgentOpenCount: number;
  pendingTaskCount: number;
  salaryAttendanceMissing: boolean;
  stockReportMissing: boolean;
  todayUpdates: ManagerUpdate[];
};

function isActiveStatus(status: string | null) {
  return status !== "done" && status !== "cancelled";
}

async function getPendingStoreTaskCount(storeId: string, today: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id,status")
    .eq("store_id", storeId)
    .or(`due_date.is.null,due_date.lte.${today}`);

  return (data ?? []).filter((task) => isActiveStatus(task.status)).length;
}

function checklistStatus(
  completionPercent: number,
  missingCount: number,
  urgentOpenCount: number,
): StoreChecklist["status"] {
  if (urgentOpenCount > 0) {
    return "Needs attention";
  }

  if (completionPercent === 100) {
    return "Complete";
  }

  if (missingCount === 0) {
    return "Complete";
  }

  return completionPercent > 0 ? "Partial" : "Missing";
}

export async function getStoreChecklist(store: Store) {
  const today = getIndiaToday();
  const yesterday = addDays(today, -1);
  const periodMonth = getIndiaMonthStart(today);
  const dayOfMonth = getIndiaDayOfMonth(today);
  const [
    salesReport,
    salaryAttendanceReport,
    stockReport,
    rackReview,
    cleaningReview,
    todayUpdates,
    pendingTaskCount,
  ] =
    await Promise.all([
      getSalesReportForStoreDate(store.id, yesterday),
      getSalaryAttendanceReportForStoreMonth(store.id, periodMonth),
      getStockReportForStoreMonth(store.id, periodMonth),
      getRackReview(store.id, today),
      getCleaningReview(store.id, today),
      getManagerUpdates({ storeId: store.id, period: "today", limit: 30 }),
      getPendingStoreTaskCount(store.id, today),
    ]);
  const noIssuesToday = todayUpdates.some(
    (update) => update.category === "No issues today" && update.status === "resolved",
  );
  const anyDailyUpdate = todayUpdates.length > 0 || noIssuesToday;
  const urgentOpenCount = todayUpdates.filter(
    (update) => update.urgency === "urgent" && (update.status ?? "open") === "open",
  ).length;
  const brandMark = store.code === "BM";
  const showSalaryAttendance = dayOfMonth === 1 || (dayOfMonth > 1 && !salaryAttendanceReport);
  const showStockReport = dayOfMonth === 1 || (dayOfMonth > 1 && !stockReport);
  const items: ChecklistItem[] = [
    {
      key: "sales",
      title: "Upload yesterday sales report",
      description: `Required for ${yesterday}.`,
      done: Boolean(salesReport),
      required: true,
      href: `/app/reports/sales?storeId=${store.id}`,
      actionLabel: "Upload",
    },
    {
      key: "rack",
      title: brandMark ? "Premium rack/display check" : "Rack/display check",
      description: brandMark
        ? "Premium display, brand presentation and complete look."
        : "Racks arranged, sizes clear, dust-free and store-ready.",
      done: Boolean(rackReview),
      required: true,
      href: `/app/reviews/rack?storeId=${store.id}`,
      actionLabel: rackReview ? "Review" : "Submit",
    },
    {
      key: "cleaning",
      title: brandMark ? "Cleaning/trial room check" : "Cleaning check",
      description: brandMark
        ? "Trial room, mirrors, smell, lighting and premium feel."
        : "Entry, floor, racks, counter and comfort are ready.",
      done: Boolean(cleaningReview),
      required: true,
      href: `/app/reviews/cleaning?storeId=${store.id}`,
      actionLabel: cleaningReview ? "Review" : "Submit",
    },
    ...(brandMark
      ? [
          {
            key: "grooming",
            title: "Staff grooming check",
            description: "Derived from today's cleaning review.",
            done: Boolean(cleaningReview?.staff_grooming_ok),
            required: false,
            href: `/app/reviews/cleaning?storeId=${store.id}`,
            actionLabel: "Open",
          } satisfies ChecklistItem,
        ]
      : []),
    {
      key: "daily-update",
      title: "Manager update or no issues",
      description: "Add a store update or mark no issues today.",
      done: anyDailyUpdate,
      required: true,
      href: `/app/updates/new?storeId=${store.id}`,
      actionLabel: "Add update",
    },
    ...(showSalaryAttendance
      ? [
          {
            key: "salary-attendance",
            title: "Monthly salary attendance",
            description: `Required for ${periodMonth}. Due on the 1st; salary day is the 3rd.`,
            done: Boolean(salaryAttendanceReport),
            required: true,
            href: `/app/reports/salary-attendance?storeId=${store.id}`,
            actionLabel: salaryAttendanceReport ? "View" : "Upload",
          } satisfies ChecklistItem,
        ]
      : []),
    ...(showStockReport
      ? [
          {
            key: "stock-report",
            title: "Monthly stock report",
            description: `Required for ${periodMonth}. Due on the 1st.`,
            done: Boolean(stockReport),
            required: true,
            href: `/app/reports/stock?storeId=${store.id}`,
            actionLabel: stockReport ? "View" : "Upload",
          } satisfies ChecklistItem,
        ]
      : []),
    {
      key: "urgent-updates",
      title: "Urgent updates acknowledged",
      description: "No urgent update should remain open.",
      done: urgentOpenCount === 0,
      required: true,
      href: `/app/updates?storeId=${store.id}&urgency=urgent`,
      actionLabel: "View",
    },
    {
      key: "tasks",
      title: "Assigned/pending store tasks",
      description: `${pendingTaskCount} active store task${pendingTaskCount === 1 ? "" : "s"}.`,
      done: pendingTaskCount === 0,
      required: false,
      href: "/app/tasks",
      actionLabel: "Open",
    },
    ...(brandMark
      ? [
          {
            key: "customer-follow-up",
            title: "Customer follow-up issue",
            description: "Create a customer issue update if anything is pending.",
            done: todayUpdates.some((update) => update.category === "Customer issue"),
            required: false,
            href: `/app/updates/new?storeId=${store.id}&category=Customer%20issue`,
            actionLabel: "Add",
          },
          {
            key: "alteration-exchange",
            title: "Alteration / exchange issue",
            description: "Create an update if any alteration or exchange is pending.",
            done: todayUpdates.some((update) => update.category === "Alteration / exchange"),
            required: false,
            href: `/app/updates/new?storeId=${store.id}&category=Alteration%20%2F%20exchange`,
            actionLabel: "Add",
          },
          {
            key: "premium-category-focus",
            title: "Premium category focus",
            description: "Future analytics item after category reports are built.",
            done: false,
            required: false,
          },
          {
            key: "addon-focus",
            title: "Perfume/footwear add-on focus",
            description: "Future analytics item after staff/category reports are built.",
            done: false,
            required: false,
          },
        ]
      : [
          {
            key: "opening-status",
            title: "Opening status note",
            description: "Add an opening status update if anything is not ready.",
            done: todayUpdates.some((update) => update.category === "Opening status"),
            required: false,
            href: `/app/updates/new?storeId=${store.id}&category=Opening%20status`,
            actionLabel: "Add",
          },
          {
            key: "customer-issue",
            title: "Pending customer issue",
            description: "Create a customer issue update if anything is pending.",
            done: todayUpdates.some((update) => update.category === "Customer issue"),
            required: false,
            href: `/app/updates/new?storeId=${store.id}&category=Customer%20issue`,
            actionLabel: "Add",
          },
          {
            key: "cash-note",
            title: "Cash/account note placeholder",
            description: "Create a cash/account note if anything needs attention.",
            done: todayUpdates.some((update) => update.category === "Cash / account note"),
            required: false,
            href: `/app/updates/new?storeId=${store.id}&category=Cash%20%2F%20account%20note`,
            actionLabel: "Add",
          },
        ]),
  ];
  const requiredItems = items.filter((item) => item.required);
  const completedRequiredCount = requiredItems.filter((item) => item.done).length;
  const completionPercent = requiredItems.length
    ? Math.round((completedRequiredCount / requiredItems.length) * 100)
    : 100;
  const missingItems = requiredItems.filter((item) => !item.done);

  return {
    store,
    today,
    yesterday,
    items,
    missingItems,
    requiredCount: requiredItems.length,
    completedRequiredCount,
    completionPercent,
    status: checklistStatus(completionPercent, missingItems.length, urgentOpenCount),
    urgentOpenCount,
    pendingTaskCount,
    salaryAttendanceMissing: showSalaryAttendance && !salaryAttendanceReport,
    stockReportMissing: showStockReport && !stockReport,
    todayUpdates,
  } satisfies StoreChecklist;
}

export async function getAccessibleChecklists(profile?: Profile | null) {
  const stores = await getAccessibleStores(profile);
  return Promise.all(stores.map((store) => getStoreChecklist(store)));
}
