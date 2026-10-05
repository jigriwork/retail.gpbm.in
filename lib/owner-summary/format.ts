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
  // Added for the detailed version (older facts may not have them).
  // The cashier's cash book for the day (null when not started that day).
  cash?: { bank_day: boolean; book: Money; counted: Money; deposit: boolean; status: string } | null;
  discount_pct?: Money;
  last_month_same_days_sale?: Money;
  month_days?: Money;
  month_target?: Money;
  qty?: Money;
  top_staffs?: Array<{ bills: Money; name: string; sale: Money }> | null;
  usual_discount_pct?: Money;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Always three letters ("Sep", not "Sept"). */
function monthName(day: string, offset = 0) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return MONTHS[date.getUTCMonth()];
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
    .map((store) => `${store.top_brands!.slice(0, 2).map((brand) => `${brandName(brand.name)} ${shortRupees(brand.sale)}`).join(", ")} (${store.code})`);

  const status: string[] = [];
  const problems = ordered.flatMap((store) =>
    store.status === "missing" ? [`${store.code} report missing`]
      : store.status === "summary_only" ? [`${store.code} needs bill-wise file`] : []);
  status.push(problems.length ? `${problems.join(", ")} ❌` : "All reports in ✅");
  const month = monthName(facts.day);
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

// ---------------------------------------------------------------- detailed (v2)

export const OWNER_SUMMARY_DETAILED_TEMPLATE_BODY = [
  "📊 GPBM daily report for {{1}}",
  "",
  "🏬 GO PLANET",
  "Sales: {{2}}",
  "Bills: {{3}}",
  "Cash: {{4}}",
  "Month: {{5}}",
  "",
  "🏬 BRAND MARK",
  "Sales: {{6}}",
  "Bills: {{7}}",
  "Cash: {{8}}",
  "Month: {{9}}",
  "",
  "⭐ Best staff: {{10}}",
  "⚠️ Attention: {{11}}",
  "🔥 Top brands: {{12}}",
  "📋 Data: {{13}}",
  "",
  "Sent every morning at 9 AM by GPBM Retail for the previous day.",
].join("\n");

// WhatsApp allows 1,024 characters in a template body; stay below that.
export const OWNER_SUMMARY_MAX_LENGTH = 1000;

function percent(value: Money) {
  return `${Number(num(value).toFixed(0))}%`;
}



function salesDetail(store: OwnerSummaryStore | undefined, day: string) {
  if (!store || store.status === "missing") return "report not received ❌";
  if (store.status === "summary_only") return `${rupees(store.sale)} total, file has no bill details ⚠️`;
  const parts = [num(store.returns) >= 1 ? `${rupees(store.sale)} after ${shortRupees(store.returns)} returns` : rupees(store.sale)];
  const lastWeek = num(store.last_week_sale);
  if (lastWeek > 0) {
    const label = `last ${weekday(day)}`;
    const ratio = num(store.sale) / lastWeek;
    const change = Math.round((ratio - 1) * 100);
    if (ratio >= 2) parts.push(`${Number(ratio.toFixed(1))}× ${label}`);
    else if (change === 0) parts.push(`same as ${label}`);
    else parts.push(`${change > 0 ? "↑" : "↓"}${Math.abs(change)}% vs ${label}`);
  }
  return parts.join(" · ");
}

function billsDetail(store: OwnerSummaryStore | undefined) {
  if (!store || store.status === "missing") return "-";
  if (store.status === "summary_only") return "no bill details in the file";
  const bills = num(store.bills);
  const parts = [`${bills} bills`];
  if (bills > 0) {
    parts.push(`avg ${rupees(num(store.sale) / bills)}`);
    if (store.qty !== undefined && store.qty !== null) parts.push(`${Number((num(store.qty) / bills).toFixed(1))} items/bill`);
  }
  if (store.discount_pct !== undefined && store.discount_pct !== null) parts.push(`discount ${percent(store.discount_pct)}`);
  return parts.join(" · ");
}

function cashDetail(store: OwnerSummaryStore | undefined) {
  const cash = store?.cash;
  if (!cash || cash.status === "open") return "cash opening/closing not done ❌";
  const difference = Math.round(num(cash.counted) - num(cash.book));
  const parts = [`CB ${rupees(cash.book)}`];
  if (Math.abs(difference) <= 10) parts.push("counted, matched ✅");
  else parts.push(`counted ${rupees(cash.counted)}, ${difference < 0 ? "short" : "excess"} ${rupees(Math.abs(difference))} ⚠️`);
  if (cash.status === "reviewed") parts.push("checked");
  if (cash.bank_day && !cash.deposit) parts.push("no bank deposit ⚠️");
  return parts.join(" · ");
}

function monthDetail(store: OwnerSummaryStore | undefined, day: string) {
  if (!store) return "-";
  const days = num(store.month_days);
  const parts = [`${shortRupees(store.month_sale)} in ${days} day${days === 1 ? "" : "s"}`];
  const target = num(store.month_target);
  const lastMonth = num(store.last_month_same_days_sale);
  if (target > 0) parts.push(`${percent((num(store.month_sale) / target) * 100)} of ${shortRupees(target)} target`);
  else if (lastMonth > 0) {
    const change = Math.round((num(store.month_sale) / lastMonth - 1) * 100);
    parts.push(change === 0 ? `same as ${monthName(day, -1)}` : `${change > 0 ? "↑" : "↓"}${Math.abs(change)}% vs same days ${monthName(day, -1)}`);
  }
  return parts.join(" · ");
}

function staffName(name: string) {
  return titleCase(name);
}

export function formatOwnerSummaryDetailed(facts: OwnerSummaryFacts) {
  const byCode = new Map(facts.stores.map((store) => [store.code.toUpperCase(), store]));
  const ordered = ["GP", "BM"].map((code) => byCode.get(code)).filter((store): store is OwnerSummaryStore => Boolean(store));
  const gp = byCode.get("GP");
  const bm = byCode.get("BM");
  const date = new Date(`${facts.day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", timeZone: "UTC", weekday: "short", year: "numeric",
  });

  const best = ordered
    .map((store) => {
      const staff = (store.top_staffs?.length ? store.top_staffs : store.top_staff ? [store.top_staff] : []).slice(0, 2);
      return staff.length
        ? `${store.code}: ${staff.map((person) => `${staffName(person.name)} ${shortRupees(person.sale)} (${num(person.bills)} bill${num(person.bills) === 1 ? "" : "s"})`).join(", ")}`
        : "";
    })
    .filter(Boolean);

  const attention: string[] = [];
  for (const store of ordered) {
    if (store.attention) {
      attention.push(`${staffName(store.attention.name)} (${store.code}) ${shortRupees(store.attention.recent_per_day)}/day this week, usual ${shortRupees(store.attention.usual_per_day)}`);
    }
  }
  for (const store of ordered) {
    if (num(store.returns) >= 2000) {
      const brands = (store.return_brands ?? []).map(brandName).filter(Boolean);
      attention.push(`${store.code} returns ${shortRupees(store.returns)}${brands.length ? ` (${brands.join(", ")})` : ""}`);
    }
  }
  for (const store of ordered) {
    const today = store.discount_pct;
    const usual = store.usual_discount_pct;
    if (store.status === "bill_level" && today !== null && today !== undefined && usual !== null && usual !== undefined
      && num(today) >= 5 && num(today) >= num(usual) + 5) {
      attention.push(`${store.code} discount ${percent(today)}, usual ${percent(usual)}`);
    }
  }

  const brands = ordered
    .filter((store) => store.top_brands?.length)
    .map((store) => `${store.code}: ${store.top_brands!.slice(0, 3).map((brand) => `${brandName(brand.name)} ${shortRupees(brand.sale)}`).join(", ")}`);

  const data: string[] = [];
  const problems = ordered.flatMap((store) =>
    store.status === "missing" ? [`${store.code} report missing`]
      : store.status === "summary_only" ? [`${store.code} uploaded without bill details`] : []);
  data.push(problems.length ? `${problems.join(", ")} ❌` : "All reports in ✅");
  for (const store of ordered) {
    const gaps = [
      num(store.missing_days) ? `${num(store.missing_days)} day${num(store.missing_days) === 1 ? "" : "s"} missing` : "",
      num(store.summary_days) ? `${num(store.summary_days)} day${num(store.summary_days) === 1 ? "" : "s"} without bill details` : "",
    ].filter(Boolean);
    if (gaps.length) data.push(`${store.code} this month: ${gaps.join(", ")}`);
  }

  const values = [
    templateValue(date, 40),
    templateValue(salesDetail(gp, facts.day), 90),
    templateValue(billsDetail(gp), 90),
    templateValue(cashDetail(gp), 110),
    templateValue(monthDetail(gp, facts.day), 90),
    templateValue(salesDetail(bm, facts.day), 90),
    templateValue(billsDetail(bm), 90),
    templateValue(cashDetail(bm), 110),
    templateValue(monthDetail(bm, facts.day), 90),
    templateValue(best.join(" · ") || "No bill-wise sales yesterday", 160),
    templateValue(attention.join(" · ") || "Nothing unusual 👍", 200),
    templateValue(brands.join(" · ") || "No bill-wise sales yesterday", 160),
    templateValue(data.join(" · "), 160),
  ];
  // Trim the least important lines first if a busy day runs long.
  for (const index of [11, 9, 10, 12]) {
    const over = renderOwnerSummaryDetailed(values).length - OWNER_SUMMARY_MAX_LENGTH;
    if (over <= 0) break;
    values[index] = templateValue(values[index], Math.max(40, values[index].length - over));
  }
  return values;
}

export function renderOwnerSummaryDetailed(values: string[]) {
  return OWNER_SUMMARY_DETAILED_TEMPLATE_BODY.replace(/\{\{(\d+)\}\}/g, (_, index: string) => values[Number(index) - 1] ?? "");
}

/**
 * Only the detailed message is sent (owner's choice, 4 Oct 2026): until
 * WhatsApp approves it, nothing is sent. The short v1 is kept for reference.
 */
export const OWNER_SUMMARY_TEMPLATES = [
  { format: formatOwnerSummaryDetailed, name: "gpbm_owner_daily_summary_v2", render: renderOwnerSummaryDetailed },
] as const;
