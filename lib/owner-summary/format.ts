// Formats owner_daily_summary_facts() into the 7 values of the approved
// WhatsApp template. Template values may not contain line breaks, so each
// value is one short line; the template's fixed text supplies the layout.

export const OWNER_SUMMARY_TEMPLATE_BODY = [
  "📊 Daily store summary for {{1}}",
  "",
  "🏬 Go Planet: {{2}}",
  "🏬 Brand Mark: {{3}}",
  "",
  "⭐ Best staff: {{4}}",
  "⚠️ Needs attention: {{5}}",
  "🔥 Top brands: {{6}}",
  "📋 Status: {{7}}",
  "",
  "This automatic summary is sent every morning by GPBM Retail for the previous day.",
].join("\n");

type Money = number | string | null | undefined;

export type OwnerSummaryStore = {
  attention: { name: string; recent_per_day: Money; usual_per_day: Money } | null;
  bills: Money;
  code: string;
  last_week_sale: Money;
  missing_days: Money;
  month_sale: Money;
  name: string;
  return_brands: string[] | null;
  returns: Money;
  sale: Money;
  status: "bill_level" | "missing" | "summary_only";
  summary_days: Money;
  top_brands: Array<{ name: string; sale: Money }> | null;
  top_staff: { bills: Money; name: string; sale: Money } | null;
};

export type OwnerSummaryFacts = { day: string; stores: OwnerSummaryStore[] };

const num = (value: Money) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** ₹1,13,848 */
export function rupees(value: Money) {
  return `₹${Math.round(num(value)).toLocaleString("en-IN")}`;
}

/** ₹850 · ₹24.5k · ₹4.07 lakh */
export function shortRupees(value: Money) {
  const amount = Math.round(num(value));
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs < 1000) return `${sign}₹${abs}`;
  if (abs < 100000) return `${sign}₹${Number((abs / 1000).toFixed(1))}k`;
  return `${sign}₹${Number((abs / 100000).toFixed(2))} lakh`;
}

function titleCase(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim().replace(/(^|[\s.&-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}

function brandName(name: string) {
  return name.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

function weekday(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" });
}

/** Template values: one line, no tabs, no runs of spaces, never empty. */
export function templateValue(text: string, max = 200) {
  const clean = text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (!clean) return "-";
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function storeLine(store: OwnerSummaryStore | undefined, day: string) {
  if (!store || store.status === "missing") return "report not received ❌";
  if (store.status === "summary_only") {
    return `${rupees(store.sale)} total, summary file only (no bills) ⚠️`;
  }
  const parts = [rupees(store.sale), `${num(store.bills)} bills`];
  const lastWeek = num(store.last_week_sale);
  if (lastWeek > 0) {
    const change = Math.round(((num(store.sale) - lastWeek) / lastWeek) * 100);
    const label = `last ${weekday(day)}`;
    if (Math.abs(change) >= 100) parts.push(`${label} ${rupees(lastWeek)}`);
    else if (change === 0) parts.push(`same as ${label}`);
    else parts.push(`${change > 0 ? "↑" : "↓"}${Math.abs(change)}% vs ${label}`);
  }
  return parts.join(" · ");
}

export function formatOwnerSummary(facts: OwnerSummaryFacts) {
  const byCode = new Map(facts.stores.map((store) => [store.code.toUpperCase(), store]));
  const ordered = ["GP", "BM"].map((code) => byCode.get(code)).filter((store): store is OwnerSummaryStore => Boolean(store));
  const date = new Date(`${facts.day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", timeZone: "UTC", weekday: "short", year: "numeric",
  });

  const best = ordered
    .filter((store) => store.top_staff)
    .map((store) => `${titleCase(store.top_staff!.name)} (${store.code}) ${shortRupees(store.top_staff!.sale)}`);

  const attention: string[] = [];
  for (const store of ordered) {
    if (store.attention) {
      attention.push(`${titleCase(store.attention.name)} (${store.code}) ${shortRupees(store.attention.recent_per_day)}/day this week, usual ${shortRupees(store.attention.usual_per_day)}`);
    }
  }
  for (const store of ordered) {
    if (num(store.returns) >= 2000) {
      const brands = (store.return_brands ?? []).map(brandName).filter(Boolean);
      attention.push(`Returns ${shortRupees(store.returns)} at ${store.code}${brands.length ? ` (${brands.join(", ")})` : ""}`);
    }
  }

  const brands = ordered
    .filter((store) => store.top_brands?.length)
    .map((store) => `${store.top_brands!.map((brand) => `${brandName(brand.name)} ${shortRupees(brand.sale)}`).join(", ")} (${store.code})`);

  const status: string[] = [];
  const problems = ordered.flatMap((store) =>
    store.status === "missing" ? [`${store.code} report missing`]
      : store.status === "summary_only" ? [`${store.code} needs bill-wise file`] : []);
  status.push(problems.length ? `${problems.join(", ")} ❌` : "All reports in ✅");
  const month = new Date(`${facts.day}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  status.push(`${month} so far ${shortRupees(ordered.reduce((sum, store) => sum + num(store.month_sale), 0))}`);
  for (const store of ordered) {
    const gaps = [
      num(store.missing_days) ? `${num(store.missing_days)} day(s) missing` : "",
      num(store.summary_days) ? `${num(store.summary_days)} summary-only day(s)` : "",
    ].filter(Boolean);
    if (gaps.length) status.push(`${store.code}: ${gaps.join(", ")} this month`);
  }

  return [
    templateValue(date, 40),
    templateValue(storeLine(byCode.get("GP"), facts.day)),
    templateValue(storeLine(byCode.get("BM"), facts.day)),
    templateValue(best.join(" · ") || "No bill-wise sales yesterday"),
    templateValue(attention.join(" · ") || "Nothing unusual 👍"),
    templateValue(brands.join(" · ") || "No bill-wise sales yesterday"),
    templateValue(status.join(" · "), 240),
  ];
}

/** The message exactly as the owners will read it. */
export function renderOwnerSummary(values: string[]) {
  return OWNER_SUMMARY_TEMPLATE_BODY.replace(/\{\{(\d)\}\}/g, (_, index: string) => values[Number(index) - 1] ?? "");
}
