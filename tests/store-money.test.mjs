import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

test("day close result reads balanced within ₹10, short or excess beyond", () => {
  const { differenceLabel } = fixture().load("@/lib/money/format");
  const rupees = (value) => `₹${value}`;
  const read = (value) => JSON.parse(JSON.stringify(differenceLabel(value, rupees)));
  assert.deepEqual(read(null), { label: "Waiting for sales report", tone: "muted" });
  assert.deepEqual(read(-8), { label: "Balanced", tone: "good" });
  assert.deepEqual(read(-120), { label: "Short ₹120", tone: "bad" });
  assert.deepEqual(read(45), { label: "Excess ₹45", tone: "warn" });
});

test("month helpers handle month ends and leap years", () => {
  const { addDays, monthEnd, monthStart } = fixture().load("@/lib/money/format");
  assert.equal(monthStart("2026-10-04"), "2026-10-01");
  assert.equal(monthEnd("2026-02-10"), "2026-02-28");
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");
  assert.equal(monthEnd("2026-12-31"), "2026-12-31");
  assert.equal(addDays("2026-10-01", -3), "2026-09-28");
});

test("managers can close the day and record expenses on a phone; accountants cannot open store money", () => {
  const { accountantAllows, handheldAllows } = fixture().load("@/lib/auth/access");
  assert.equal(handheldAllows("/app/money"), true);
  assert.equal(handheldAllows("/app/money/expenses"), true);
  assert.equal(handheldAllows("/app/customers"), true);
  assert.equal(handheldAllows("/app/stock-counts/abc"), true);
  assert.equal(handheldAllows("/app/buying"), false);
  assert.equal(accountantAllows("/app/money"), false);
  assert.equal(accountantAllows("/app/customers"), false);
});
