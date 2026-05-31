import { getIndiaDayOfMonth, getIndiaToday, isMondayInIndia } from "@/lib/tasks/dates";
import type { Profile, Store } from "@/lib/auth/session";
import type { TablesInsert } from "@/lib/supabase/database.types";

type TaskInsert = TablesInsert<"tasks">;

function baseTask(
  title: string,
  category: string,
  createdBy: string,
  storeId?: string,
): TaskInsert {
  return {
    title,
    category,
    created_by: createdBy,
    store_id: storeId,
    due_date: getIndiaToday(),
    priority: "normal",
    status: "pending",
    source: "auto",
    carry_forward: true,
    is_private: false,
  };
}

export function getMonthlyDueReminders(profile: Profile, stores: Store[]) {
  const day = getIndiaDayOfMonth();
  const reminders: TaskInsert[] = [];

  if (day === 1) {
    reminders.push(
      ...stores.map((store) =>
        baseTask(
          `Upload stock report for ${store.name}`,
          "stock_report_due",
          profile.id,
          store.id,
        ),
      ),
      baseTask("Prepare salary attendance report", "salary_attendance_due", profile.id),
    );
  }

  if (day === 3) {
    reminders.push(baseTask("Complete salary day work", "salary_day", profile.id));
  }

  return reminders;
}

export function buildAutoTasksForToday(profile: Profile, accessibleStores: Store[]) {
  const reminders: TaskInsert[] = [
    ...accessibleStores.map((store) =>
      baseTask(`Review daily sales report for ${store.name}`, "daily_sales", profile.id, store.id),
    ),
    ...accessibleStores.map((store) =>
      baseTask(`Rack review pending for ${store.name}`, "rack_review", profile.id, store.id),
    ),
    ...accessibleStores.map((store) =>
      baseTask(
        `Cleaning review pending for ${store.name}`,
        "cleaning_review",
        profile.id,
        store.id,
      ),
    ),
    ...getMonthlyDueReminders(profile, accessibleStores),
  ];

  if (isMondayInIndia()) {
    reminders.push(
      ...accessibleStores.map((store) =>
        baseTask(`Run weekly audit for ${store.name}`, "weekly_audit", profile.id, store.id),
      ),
    );
  }

  return reminders;
}
