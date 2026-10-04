import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const load = () => fixture().load("@/lib/owner-summary/format");

// Real figures for Saturday 3 Oct 2026.
const facts = {
  day: "2026-10-03",
  stores: [
    { code: "BM", name: "Brand Mark", status: "bill_level", sale: "34207.4", bills: 16, last_week_sale: "8572", month_sale: "34207", missing_days: 0, summary_days: 2, returns: null, return_brands: [],
      top_staff: { name: "G NAYAK", sale: "9943.12", bills: 5 }, top_brands: [{ name: "JACK&JONES", sale: "4049" }], attention: null },
    { code: "GP", name: "Go Planet", status: "bill_level", sale: "113848", bills: 39, last_week_sale: "128441", month_sale: "372839", missing_days: 0, summary_days: 0, returns: "6129", return_brands: ["MUFTI", "LEPCY"],
      top_staff: { name: "MD RAHIM", sale: "24545", bills: 2 }, top_brands: [{ name: "PEPE", sale: "17458" }, { name: "US POLO.", sale: "15675" }],
      attention: { name: "KALIA DASH S", recent_per_day: "2923", usual_per_day: "6808" } },
  ],
};

test("daily summary: both stores in one short message, values safe for a WhatsApp template", () => {
  const { formatOwnerSummary, renderOwnerSummary } = load();
  const values = Array.from(formatOwnerSummary(facts));
  assert.deepEqual(values, [
    "Sat, 3 Oct 2026",
    "₹1,13,848 · 39 bills · ↓11% vs last Sat",
    "₹34,207 · 16 bills · last Sat ₹8,572",
    "Md Rahim (GP) ₹24.5k · G Nayak (BM) ₹9.9k",
    "Kalia Dash S (GP) ₹2.9k/day this week, usual ₹6.8k · Returns ₹6.1k at GP (MUFTI, LEPCY)",
    "PEPE ₹17.5k, US POLO ₹15.7k (GP) · JACK&JONES ₹4k (BM)",
    "All reports in ✅ · Oct so far ₹4.07 lakh · BM: 2 summary-only day(s) this month",
  ]);
  for (const value of values) assert.doesNotMatch(value, /[\n\t]| {2,}/);
  const text = renderOwnerSummary(values);
  assert.ok(text.split("\n").length <= 11 && text.length < 700, text);
});

test("missing and summary-only reports are said plainly, never shown as real sales", () => {
  const { formatOwnerSummary } = load();
  const values = formatOwnerSummary({ day: "2026-10-02", stores: [
    { ...facts.stores[1], status: "missing", sale: null, bills: 0, top_staff: null, top_brands: [], attention: null, returns: null },
    { ...facts.stores[0], status: "summary_only", sale: "21000", bills: 0, top_staff: null, top_brands: [], attention: null },
  ] });
  assert.equal(values[1], "report not received ❌");
  assert.equal(values[2], "₹21,000 total, summary file only (no bills) ⚠️");
  assert.equal(values[3], "No bill-wise sales yesterday");
  assert.match(values[6], /^GP report missing, BM needs bill-wise file ❌/);
});

test("template values never contain line breaks and are length-limited", () => {
  const { templateValue, shortRupees } = load();
  assert.equal(templateValue("a\nb\t c    d"), "a b c d");
  assert.equal(templateValue(""), "-");
  assert.equal(templateValue("x".repeat(300)).length, 200);
  assert.deepEqual([shortRupees(850), shortRupees(24545), shortRupees(407046), shortRupees(-4690)], ["₹850", "₹24.5k", "₹4.07 lakh", "-₹4.7k"]);
});

// ---------------------------------------------------------------- detailed (v2)
const detailedFacts = {
  day: "2026-10-03",
  stores: [
    { ...facts.stores[0], qty: 59, discount_pct: "11.2", usual_discount_pct: "10.4", month_days: 3, last_month_same_days_sale: null, month_target: null,
      day_close: { status: "submitted", difference: "-200" },
      top_staffs: [{ name: "G NAYAK", sale: "9943.12", bills: 5 }, { name: "ROJI", sale: "8761", bills: 2 }],
      top_brands: [{ name: "JACK&JONES", sale: "4049" }, { name: "CAMPUS", sale: "2941" }, { name: "SWISH", sale: "2879" }] },
    { ...facts.stores[1], returns: "15100", return_brands: ["MUFTI", "BLACKBERRYS"], qty: 82, discount_pct: "22.4", usual_discount_pct: "14.1",
      month_days: 3, last_month_same_days_sale: "333000", month_target: null, day_close: { status: "reviewed", difference: "20" },
      top_staffs: [{ name: "MD RAHIM", sale: "24545", bills: 2 }, { name: "AKSHAYA SAHU", sale: "17907", bills: 4 }],
      top_brands: [{ name: "PEPE", sale: "17458" }, { name: "US POLO.", sale: "15675" }, { name: "JOCKEY", sale: "9078" }] },
  ],
};

test("detailed summary: each store's sales, bills, cash and month, then staff, attention, brands and data", () => {
  const { formatOwnerSummaryDetailed, renderOwnerSummaryDetailed, OWNER_SUMMARY_MAX_LENGTH } = load();
  const values = Array.from(formatOwnerSummaryDetailed(detailedFacts));
  assert.deepEqual(values, [
    "Sat, 3 Oct 2026",
    "₹1,13,848 after ₹15.1k returns · ↓11% vs last Sat",
    "39 bills · avg ₹2,919 · 2.1 items/bill · discount 22%",
    "matched ✅ (checked)",
    "₹3.73 lakh in 3 days · ↑12% vs same days Sep",
    "₹34,207 · 4× last Sat",
    "16 bills · avg ₹2,138 · 3.7 items/bill · discount 11%",
    "short ₹200 ⚠️",
    "₹34.2k in 3 days",
    "GP: Md Rahim ₹24.5k (2 bills), Akshaya Sahu ₹17.9k (4 bills) · BM: G Nayak ₹9.9k (5 bills), Roji ₹8.8k (2 bills)",
    "Kalia Dash S (GP) ₹2.9k/day this week, usual ₹6.8k · GP returns ₹15.1k (MUFTI, BLACKBERRYS) · GP discount 22%, usual 14%",
    "GP: PEPE ₹17.5k, US POLO ₹15.7k, JOCKEY ₹9.1k · BM: JACK&JONES ₹4k, CAMPUS ₹2.9k, SWISH ₹2.9k",
    "All reports in ✅ · BM this month: 2 days without bill details",
  ]);
  const text = renderOwnerSummaryDetailed(values);
  assert.ok(text.length <= OWNER_SUMMARY_MAX_LENGTH, `${text.length} characters`);
  for (const value of values) assert.doesNotMatch(value, /[\n\t]| {2,}/);
});

test("detailed summary: target progress, day not closed, missing report, and the length limit on a busy day", () => {
  const { formatOwnerSummaryDetailed, renderOwnerSummaryDetailed, OWNER_SUMMARY_MAX_LENGTH } = load();
  const busy = structuredClone(detailedFacts);
  busy.stores[1].month_target = "1200000";
  busy.stores[1].day_close = null;
  busy.stores[0].status = "missing";
  busy.stores[0].day_close = { status: "submitted", difference: null };
  busy.stores[1].top_brands = Array.from({ length: 3 }, (_, i) => ({ name: `A VERY LONG BRAND NAME NUMBER ${i} WITH MANY WORDS`, sale: "99999" }));
  busy.stores[1].return_brands = ["ANOTHER VERY LONG BRAND NAME", "AND ONE MORE VERY LONG BRAND NAME"];
  const values = Array.from(formatOwnerSummaryDetailed(busy));
  assert.equal(values[4], "₹3.73 lakh in 3 days · 31% of ₹12 lakh target");
  assert.equal(values[3], "cash opening/closing not done ❌");
  assert.equal(values[5], "report not received ❌");
  assert.equal(values[7], "closed, waiting for the sales report");
  assert.match(values[12], /^BM report missing ❌/);
  assert.ok(renderOwnerSummaryDetailed(values).length <= OWNER_SUMMARY_MAX_LENGTH);
});

test("only the detailed template is ever sent (no short fallback)", () => {
  const { OWNER_SUMMARY_TEMPLATES } = load();
  assert.deepEqual(Array.from(OWNER_SUMMARY_TEMPLATES, (template) => template.name), ["gpbm_owner_daily_summary_v2"]);
});
