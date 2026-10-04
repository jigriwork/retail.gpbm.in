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
