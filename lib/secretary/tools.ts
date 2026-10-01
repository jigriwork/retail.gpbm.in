import "server-only";

import type { Profile, Store } from "@/lib/auth/session";
import { getSalesSummary, getStaffSalesSummary } from "@/lib/analytics/sales";
import { OWNER_TODO_CATEGORY, ownerTodoRow } from "@/lib/owner/todos";
import type { FunctionDeclaration } from "@/lib/secretary/gemini";
import { createClient } from "@/lib/supabase/server";
import { addDays, getIndiaToday, getIndiaTomorrow } from "@/lib/tasks/dates";
import { getTasksForProfile, type TaskWithRelations } from "@/lib/tasks/queries";

/** A change Tia made, stored on her reply so the owner can undo it. */
export type TiaAction = {
  kind: "added" | "completed" | "rescheduled";
  taskId: string;
  title: string;
  previous?: { completed_at: string | null; due_date: string | null; status: string | null };
  dueDate?: string | null;
  /** Filled in when displayed; see isTiaActionUndone. */
  undone?: boolean;
};

/**
 * Whether a Tia change has since been reversed, judged from the task as it is
 * now (chat rows are insert-only, and the owner may also have changed the task
 * elsewhere).
 */
export function isTiaActionUndone(action: TiaAction, task: { status: string | null; due_date: string | null } | null) {
  if (!task) return true;
  if (action.kind === "added") return task.status === "cancelled";
  if (action.kind === "completed") return task.status !== "done";
  return task.due_date !== action.dueDate;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const maxRangeDays = 400;

export const tiaTools: FunctionDeclaration[] = [
  {
    name: "list_tasks",
    description:
      "List the owner's own to-dos and the store/manager tasks. Use for 'what is pending', 'what's due', and to find a task's id before completing or moving it.",
    parameters: {
      type: "OBJECT",
      properties: {
        filter: {
          type: "STRING",
          enum: ["pending", "today", "overdue", "upcoming", "all_open", "done_today"],
          description: "pending = overdue + due today + no date (default).",
        },
      },
    },
  },
  {
    name: "complete_task",
    description:
      "Mark one task or to-do as done. Only call when the owner clearly says it is done and exactly one task matches; if several could match, ask which one instead.",
    parameters: { type: "OBJECT", properties: { task_id: { type: "STRING" } }, required: ["task_id"] },
  },
  {
    name: "add_todo",
    description: "Add a to-do to the owner's personal list.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Short, clear to-do in the owner's words." },
        due_date: { type: "STRING", description: "YYYY-MM-DD, 'today', 'tomorrow' or 'none'. Default today." },
      },
      required: ["title"],
    },
  },
  {
    name: "reschedule_task",
    description: "Move a task or to-do to a new due date.",
    parameters: {
      type: "OBJECT",
      properties: {
        task_id: { type: "STRING" },
        due_date: { type: "STRING", description: "YYYY-MM-DD, 'today' or 'tomorrow'." },
      },
      required: ["task_id", "due_date"],
    },
  },
  {
    name: "remember_fact",
    description:
      "Save a lasting fact that the owner has just told you in their own words (about their business, people, suppliers, preferences or plans) so you remember it later. Never save your own conclusions, guesses, or numbers from GPBM Retail data, and never save questions.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "A few words naming the fact." },
        fact: { type: "STRING", description: "The fact in one or two sentences." },
      },
      required: ["title", "fact"],
    },
  },
  {
    name: "get_sales",
    description: "Sales totals, bills, top staff, brands, categories and daily trend for any date range. Use for sales over any period, best or worst days, what is selling, and comparisons (call once per period).",
    parameters: {
      type: "OBJECT",
      properties: {
        start_date: { type: "STRING", description: "YYYY-MM-DD" },
        end_date: { type: "STRING", description: "YYYY-MM-DD" },
        store: { type: "STRING", description: "'all' or a store name. Default all." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "get_staff_sales",
    description: "Staff-wise sales (total, bills, quantity, average bill) for any date range. Use for 'who performed best', staff rankings, or one person's sales over a day, week, month or custom period.",
    parameters: {
      type: "OBJECT",
      properties: {
        start_date: { type: "STRING", description: "YYYY-MM-DD" },
        end_date: { type: "STRING", description: "YYYY-MM-DD" },
        store: { type: "STRING", description: "'all' or a store name. Default all." },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "search_past_conversations",
    description: "Search older conversations with the owner when they refer to something discussed before.",
    parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] },
  },
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveDueDate(value: unknown, fallback: string | null) {
  const raw = text(value).toLowerCase();
  if (!raw) return { ok: true as const, date: fallback };
  if (raw === "today") return { ok: true as const, date: getIndiaToday() };
  if (raw === "tomorrow") return { ok: true as const, date: getIndiaTomorrow() };
  if (raw === "none") return { ok: true as const, date: null };
  if (isoDate.test(raw)) return { ok: true as const, date: raw };
  return { ok: false as const, date: null };
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function taskSummary(task: TaskWithRelations, ownerId: string) {
  return {
    id: task.id,
    title: task.title,
    due_date: task.due_date,
    status: task.status ?? "pending",
    kind: task.category === OWNER_TODO_CATEGORY && task.created_by === ownerId ? "my to-do" : "store task",
    store: task.stores?.name ?? null,
    assigned_to: task.assigned_employee?.staff_name ?? task.assigned_profile?.full_name ?? null,
  };
}

/** Tasks this owner's Tia may see: everything except other owners' personal to-dos. */
export async function visibleTasks(ownerId: string) {
  const tasks = await getTasksForProfile();
  return tasks.filter((task) => task.category !== OWNER_TODO_CATEGORY || task.created_by === ownerId);
}

export function filterTasks(tasks: TaskWithRelations[], filter: string) {
  const today = getIndiaToday();
  const active = (task: TaskWithRelations) => !["done", "cancelled"].includes(task.status ?? "pending");
  switch (filter) {
    case "today":
      return tasks.filter((task) => active(task) && task.due_date === today);
    case "overdue":
      return tasks.filter((task) => active(task) && Boolean(task.due_date && task.due_date < today));
    case "upcoming":
      return tasks.filter((task) => active(task) && Boolean(task.due_date && task.due_date > today));
    case "all_open":
      return tasks.filter(active);
    case "done_today":
      return tasks.filter(
        (task) =>
          task.status === "done" &&
          Boolean(task.completed_at && task.completed_at >= new Date(`${today}T00:00:00+05:30`).toISOString()),
      );
    default:
      return tasks.filter((task) => active(task) && (!task.due_date || task.due_date <= today));
  }
}

function pickStores(stores: Store[], value: unknown) {
  const wanted = text(value).toLowerCase();
  if (!wanted || wanted === "all") return stores;
  return stores.filter(
    (store) => store.name.toLowerCase().includes(wanted) || store.code.toLowerCase() === wanted || wanted.includes(store.name.toLowerCase()),
  );
}

function readRange(args: Record<string, unknown>) {
  const start = text(args.start_date);
  const end = text(args.end_date);
  if (!isoDate.test(start) || !isoDate.test(end) || start > end) return null;
  if (daysBetween(start, end) > maxRangeDays) return null;
  return { startDate: start, endDate: end };
}

/**
 * Builds the executor for one Tia turn. Every write runs through the owner's own
 * Supabase session, so RLS still applies; `actions` collects changes for undo.
 */
export function createTiaExecutor({ profile, stores }: { profile: Profile; stores: Store[] }) {
  const actions: TiaAction[] = [];
  let tasksCache: TaskWithRelations[] | null = null;
  const tasks = async () => (tasksCache ??= await visibleTasks(profile.id));

  async function findTask(taskId: string) {
    return (await tasks()).find((task) => task.id === taskId) ?? null;
  }

  async function execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const supabase = await createClient();

    if (name === "list_tasks") {
      const list = filterTasks(await tasks(), text(args.filter) || "pending");
      return { ok: true, today: getIndiaToday(), count: list.length, tasks: list.slice(0, 40).map((task) => taskSummary(task, profile.id)) };
    }

    if (name === "complete_task") {
      const task = await findTask(text(args.task_id));
      if (!task) return { ok: false, error: "No such task. Call list_tasks to get the right id." };
      if (task.status === "done") return { ok: true, note: "It was already done.", title: task.title };
      const completedAt = new Date().toISOString();
      const { error } = await supabase.from("tasks").update({ status: "done", completed_at: completedAt }).eq("id", task.id);
      if (error) return { ok: false, error: error.message };
      actions.push({
        kind: "completed",
        taskId: task.id,
        title: task.title,
        previous: { completed_at: task.completed_at, due_date: task.due_date, status: task.status },
      });
      tasksCache = null;
      return { ok: true, title: task.title };
    }

    if (name === "add_todo") {
      const title = text(args.title).slice(0, 200);
      const due = resolveDueDate(args.due_date, getIndiaToday());
      if (!title) return { ok: false, error: "Title is required." };
      if (!due.ok) return { ok: false, error: "Use YYYY-MM-DD, today, tomorrow or none for due_date." };
      const { data, error } = await supabase.from("tasks").insert(ownerTodoRow(profile.id, title, due.date)).select("id").single();
      if (error || !data) return { ok: false, error: error?.message ?? "Could not add." };
      actions.push({ kind: "added", taskId: data.id, title, dueDate: due.date });
      tasksCache = null;
      return { ok: true, title, due_date: due.date };
    }

    if (name === "reschedule_task") {
      const task = await findTask(text(args.task_id));
      const due = resolveDueDate(args.due_date, null);
      if (!task) return { ok: false, error: "No such task. Call list_tasks to get the right id." };
      if (!due.ok || !due.date) return { ok: false, error: "Use YYYY-MM-DD, today or tomorrow for due_date." };
      const { error } = await supabase.from("tasks").update({ due_date: due.date }).eq("id", task.id);
      if (error) return { ok: false, error: error.message };
      actions.push({
        kind: "rescheduled",
        taskId: task.id,
        title: task.title,
        dueDate: due.date,
        previous: { completed_at: task.completed_at, due_date: task.due_date, status: task.status },
      });
      tasksCache = null;
      return { ok: true, title: task.title, due_date: due.date };
    }

    if (name === "remember_fact") {
      const title = text(args.title).slice(0, 80);
      const fact = text(args.fact).slice(0, 1000);
      if (!fact) return { ok: false, error: "Nothing to remember." };
      const { data: existing } = await supabase
        .from("ai_memories")
        .select("id")
        .eq("user_id", profile.id)
        .eq("is_active", true)
        .eq("content", fact)
        .limit(1);
      if (existing?.length) return { ok: true, note: "Already remembered." };
      const { error } = await supabase.from("ai_memories").insert({
        user_id: profile.id,
        title: title || fact.slice(0, 60),
        content: fact,
        memory_type: "tia_fact",
        importance: 3,
        is_active: true,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    }

    if (name === "get_sales" || name === "get_staff_sales") {
      const dateRange = readRange(args);
      if (!dateRange) return { ok: false, error: `Give start_date and end_date as YYYY-MM-DD, at most ${maxRangeDays} days apart.` };
      const selected = pickStores(stores, args.store);
      if (!selected.length) return { ok: false, error: `Unknown store. Stores: ${stores.map((store) => store.name).join(", ")}.` };
      const filters = { storeIds: selected.map((store) => store.id), dateRange };

      if (name === "get_staff_sales") {
        const staff = await getStaffSalesSummary(filters);
        return {
          ok: true,
          ...dateRange,
          stores: selected.map((store) => store.name),
          staff: staff.slice(0, 15).map((row) => ({
            name: row.staffName,
            total_sale: Math.round(row.totalSale),
            bills: row.billCount,
            quantity: row.quantitySold,
            average_bill: Math.round(row.averageBillValue),
            top_brand: row.topBrand,
          })),
        };
      }

      const summary = await getSalesSummary(filters, selected);
      const top = (rows: Array<{ name: string; totalSale: number }>) =>
        rows.slice(0, 5).map((row) => ({ name: row.name, sale: Math.round(row.totalSale) }));
      return {
        ok: true,
        ...dateRange,
        has_data: summary.rowCount > 0,
        total_sale: Math.round(summary.totalNetSale),
        bills: summary.billCount,
        quantity: summary.totalQuantity,
        average_bill: Math.round(summary.averageBillValue),
        discount_given: Math.round(summary.totalDiscountValue),
        by_store: summary.storeSummaries.map((row) => ({ store: row.store.name, sale: Math.round(row.totalNetSale), bills: row.billCount })),
        top_staff: top(summary.topStaff),
        top_brands: top(summary.topBrands),
        top_categories: top(summary.topCategories),
        daily: daysBetween(dateRange.startDate, dateRange.endDate) <= 31
          ? summary.dailyTrend.map((point) => ({ date: point.date, sale: Math.round(point.totalSale) }))
          : undefined,
      };
    }

    if (name === "search_past_conversations") {
      const query = text(args.query).slice(0, 60).replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
      if (!query) return { ok: false, error: "Give a word or phrase to search." };
      const { data } = await supabase
        .from("ai_chats")
        .select("role,content,created_at")
        .eq("user_id", profile.id)
        .ilike("content", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(8);
      return {
        ok: true,
        matches: (data ?? []).map((row) => ({
          date: row.created_at?.slice(0, 10),
          who: row.role === "user" ? "owner" : "Tia",
          text: (row.content ?? "").slice(0, 400),
        })),
      };
    }

    return { ok: false, error: `Unknown tool ${name}.` };
  }

  return { actions, execute };
}

/** Plain-language list of the owner's pending work for Tia's context. */
export function pendingWorkLines(tasks: TaskWithRelations[], ownerId: string) {
  const pending = filterTasks(tasks, "pending");
  const upcoming = filterTasks(tasks, "upcoming").filter((task) => task.due_date! <= addDays(getIndiaToday(), 3));
  const line = (task: TaskWithRelations) => {
    const summary = taskSummary(task, ownerId);
    return `- [id:${summary.id}] ${summary.title} (${summary.kind}${summary.store ? `, ${summary.store}` : ""}, due ${summary.due_date ?? "no date"}${summary.status !== "pending" ? `, ${summary.status}` : ""})`;
  };
  return [
    `Pending now (overdue, today or no date): ${pending.length}.`,
    ...pending.slice(0, 20).map(line),
    `Due in the next 3 days: ${upcoming.length}.`,
    ...upcoming.slice(0, 10).map(line),
  ];
}
