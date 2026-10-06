// The 11 PM owner "plan for tomorrow": what to act on, never the day's sales
// figures (the 9 AM summary has those). WhatsApp template values may not
// contain line breaks, so each value is one line; the template supplies the layout.

export const OWNER_NIGHT_TEMPLATE = "gpbm_owner_night_plan_v1";

export const OWNER_NIGHT_TEMPLATE_BODY = [
  "🌙 Good evening! A quick look ahead to {{1}}",
  "",
  "📋 Today's reports: {{2}}",
  "",
  "🧊 Stock that could use some attention: {{3}}",
  "📉 Sizes getting low: {{4}}",
  "🔁 Could move between stores: {{5}}",
  "",
  "🌟 Doing great: {{6}}",
  "🤝 Could use a little support: {{7}}",
  "👀 Worth a quick check: {{8}}",
  "",
  "💡 Ideas for tomorrow: {{9}}",
  "",
  "Full details: {{10}}",
  "",
  "Thank you for today. Good night! 🌙",
].join("\n");

type Num = number | string | null | undefined;
export type NightIdle = { brand: string | null; item: string; last_sale: string | null; other_sold: Num; other_stores: string | null; pcs: Num; reason: "broken_sizes" | "move" | "never_sold" | "stopped"; sizes_left: string | null; value: Num };
export type NightRunningOut = { brand: string | null; item: string; on_hand: Num; other_on_hand: Num; other_stores: string | null; size: string; sold_30: Num };
export type NightStaff = { avg_bill: Num; bills7: Num; flags: string[] | null; items_per_bill: Num; name: string; recent_per_day: Num; sale7: Num; usual_per_day: Num };
export type NightStore = {
  code: string; idle: NightIdle[]; idle_days: number; idle_total: { items: Num; pcs: Num; value: Num }; name: string;
  running_out: NightRunningOut[]; staff: NightStaff[]; stock_date: string | null; store_avg_bill: Num; store_items_per_bill: Num; uploaded: boolean;
};
export type NightPlan = { day: string; stores: NightStore[] };

const n = (value: Num) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (day: string | null) => (day ? `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}` : "");
/** "ALLEN SOLLY" → "Allen Solly"; for brands, short all-capital names (UCB) stay as they are. */
export function title(text: string | null, brand = false) {
  return (text ?? "").replace(/\s+/g, " ").trim().split(" ")
    .map((word) => (brand && /^[A-Z0-9&]{2,3}$/.test(word) ? word : word.toLowerCase().replace(/(^|[.&-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase())))
    .join(" ");
}
/** ₹850 · ₹24.5k · ₹3.1 lakh */
export function money(value: Num) {
  const amount = Math.round(n(value));
  if (amount < 1000) return `₹${amount}`;
  if (amount < 100000) return `₹${Number((amount / 1000).toFixed(1))}k`;
  return `₹${Number((amount / 100000).toFixed(1))} lakh`;
}
const item = (row: { brand: string | null; item: string }) => `${title(row.brand, true)} ${title(row.item)}`.trim();
const daysSince = (day: string, since: string | null) => (since ? Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000) : null);

/** Why an item sits idle, and what to do (one short phrase each). */
export function idleReason(row: NightIdle, day: string) {
  const idle = daysSince(day, row.last_sale);
  switch (row.reason) {
    case "move": return { action: `could move to ${row.other_stores}`, why: `selling well at ${row.other_stores} (${n(row.other_sold)} sold in 30 days)` };
    case "broken_sizes": return { action: "could combine sizes or try an offer", why: `only ${row.sizes_left ?? "a few sizes"} left` };
    case "never_sold": return { action: "could go on display", why: "not sold yet since it arrived" };
    default: return { action: "a display change or an offer could help", why: idle ? `no sale in ${idle} days` : "no recent sale" };
  }
}

export type NightPerson = { name: string; note: string; short: string; store: string };
/** Staff doing great, who could use support, and worth a check, from the 7-day flags. */
export function staffGroups(stores: NightStore[]) {
  const praise: NightPerson[] = [];
  const talk: NightPerson[] = [];
  const check: NightPerson[] = [];
  for (const store of stores) {
    for (const person of store.staff) {
      const flags = new Set(person.flags ?? []);
      const name = title(person.name);
      const usual = n(person.usual_per_day);
      const change = usual > 0 ? Math.round(((n(person.recent_per_day) - usual) / usual) * 100) : 0;
      if (flags.has("top")) praise.push({ name, note: "top seller of the last 7 days. A word of thanks would mean a lot.", short: "top seller of the week 👏", store: store.code });
      else if (flags.has("improving")) praise.push({ name, note: `up ${change}% on their usual this week. Worth a pat on the back.`, short: `up ${change}% this week 👏`, store: store.code });
      if (flags.has("low_bill")) talk.push({ name, note: `average bill ${money(person.avg_bill)} (store ${money(store.store_avg_bill)}). Showing higher-value ranges could help.`, short: `average bill ${money(person.avg_bill)} (store ${money(store.store_avg_bill)})`, store: store.code });
      else if (flags.has("low_items")) talk.push({ name, note: `${n(person.items_per_bill)} items per bill (store ${n(store.store_items_per_bill)}). A few add-on ideas could help.`, short: `${n(person.items_per_bill)} items per bill (store ${n(store.store_items_per_bill)})`, store: store.code });
      else if (flags.has("falling")) talk.push({ name, note: `sales a bit lower than usual this week (${change}%). A friendly chat may help.`, short: "a slower week than usual", store: store.code });
      if (flags.has("no_sale")) check.push({ name, note: "no sale in the last 3 days. Maybe a day off or on billing?", short: "no sale in 3 days, maybe a day off?", store: store.code });
    }
  }
  return { check, praise, talk };
}

export type NightTodo = { detail: string; store: string; title: string; value: number };
/** The most valuable actions for tomorrow, first first. */
export function tomorrowTodos(plan: NightPlan) {
  const todos: NightTodo[] = [];
  for (const store of plan.stores) {
    if (!store.uploaded) todos.push({ detail: "The day's sales report is not uploaded yet.", store: store.code, title: `sales report of ${shortDate(plan.day)} still to upload`, value: 1e12 });
    for (const row of store.idle.slice(0, 3)) {
      const { action, why } = idleReason(row, plan.day);
      todos.push({ detail: `${n(row.pcs)} pcs, ${money(row.value)} at MRP; ${why}.`, store: store.code, title: `${item(row)}: ${action}`, value: n(row.value) });
    }
    for (const row of store.running_out.slice(0, 2)) {
      const from = n(row.other_on_hand) > 0 ? `could come from ${row.other_stores} (${n(row.other_on_hand)} there)` : "worth reordering";
      todos.push({ detail: `${n(row.sold_30)} sold in 30 days, ${n(row.on_hand)} left.`, store: store.code, title: `${item(row)} size ${row.size}: ${from}`, value: n(row.sold_30) * 5000 });
    }
  }
  const { talk, check } = staffGroups(plan.stores);
  for (const person of [...talk, ...check].slice(0, 3)) {
    todos.push({ detail: person.note, store: person.store, title: `a supportive chat with ${person.name}`, value: 50_000 });
  }
  return todos.sort((left, right) => right.value - left.value);
}

/** Template values: one line, no tabs, no double spaces, never empty. */
export function templateValue(text: string, max = 230) {
  const clean = text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (!clean) return "-";
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const storeOrder = (code: string) => (code === "GP" ? 0 : code === "BM" ? 1 : 2);

export function formatNightPlan(input: NightPlan, link: string) {
  const plan = { ...input, stores: [...input.stores].sort((left, right) => storeOrder(left.code) - storeOrder(right.code)) };
  const date = new Date(`${plan.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const tomorrow = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" });
  const reports = plan.stores.map((store) => `${store.code} ${store.uploaded ? "✅ uploaded" : "⏳ not uploaded yet"}`).join(" · ");
  // Top idle item per store with its reason (totals are on the full list page).
  const idle = plan.stores.map((store) => {
    const top = store.idle[0];
    return top ? `${store.code}: ${item(top)} ${n(top.pcs)} pcs, ${idleReason(top, plan.day).why}` : `${store.code}: all moving`;
  }).join(" · ");
  const runningOut = plan.stores.flatMap((store) => store.running_out.slice(0, 1).map((row) => `${store.code}: ${item(row)} ${row.size} (${n(row.on_hand)} left, ${n(row.sold_30)} sold in 30 days)`)).join(" · ") || "all good";
  const moves = plan.stores.flatMap((store) => [
    ...store.idle.filter((row) => row.reason === "move").slice(0, 1).map((row) => `${item(row)} ${n(row.pcs)} pcs ${store.code}→${row.other_stores}`),
    ...store.running_out.filter((row) => n(row.other_on_hand) > 0).slice(0, 1).map((row) => `${item(row)} ${row.size} ${row.other_stores}→${store.code}`),
  ]).join(" · ") || "nothing needed";
  const people = staffGroups(plan.stores);
  const list = (group: NightPerson[], none: string, count: number) => group.slice(0, count).map((person) => `${person.name} (${person.store}) ${person.short}`).join(" · ") || none;
  const build = (budget: number) => {
    const todos = tomorrowTodos(plan).slice(0, budget > 0 ? 4 : 3).map((todo, index) => `${index + 1}) ${todo.store}: ${todo.title}`).join(" ");
    const max = budget > 0 ? 200 : 140;
    return [
      tomorrow, reports, idle, runningOut, moves,
      list(people.praise, "the whole team, steady week", budget > 0 ? 2 : 1),
      list(people.talk, "everyone is doing fine", budget > 0 ? 2 : 1),
      list(people.check, "everyone is selling", budget > 0 ? 2 : 1),
      todos || "a calm day, nothing pressing",
      link,
    ].map((value, index) => (index === 9 ? value : templateValue(value, max)));
  };
  // WhatsApp allows about 1,024 characters: shorten if the full version is too long.
  const full = build(1);
  return renderNightPlan(full).length <= 1000 ? full : build(0);
}

export function renderNightPlan(values: string[]) {
  return OWNER_NIGHT_TEMPLATE_BODY.replace(/\{\{(\d+)\}\}/g, (_, index: string) => values[Number(index) - 1] ?? "");
}
