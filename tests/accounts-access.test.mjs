import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

test("accountants are kept inside Accounts (plus their password page)", () => {
  const { accountantAllows, handheldAllows } = fixture().load("@/lib/auth/access");
  for (const path of ["/app/accounts", "/app/accounts/", "/app/accounts/parties/abc", "/app/settings/account"]) assert.equal(accountantAllows(path), true, path);
  for (const path of ["/app/today", "/app/payslips", "/app/owner/notes", "/app/settings", "/app/users", "/app/accountsx", "/app/reports/sales"]) assert.equal(accountantAllows(path), false, path);
  // Managers on a phone can still submit purchase documents.
  assert.equal(handheldAllows("/app/accounts/documents"), true);
});

test("accounts formatting keeps paise and Indian grouping, and never invents dates", () => {
  const { money, isoDateOrNull, normalizeGstin, validGstin } = fixture().load("@/lib/accounts/format");
  assert.equal(money(1065813), "₹10,65,813.00");
  assert.equal(money("976985.6"), "₹9,76,985.60");
  assert.equal(money(null), "—");
  assert.equal(isoDateOrNull("2026-09-25"), "2026-09-25");
  assert.equal(isoDateOrNull("25/09/2026"), null);
  assert.equal(normalizeGstin(" 21aaaaa0000a1z5 "), "21AAAAA0000A1Z5");
  assert.equal(validGstin("21AAAAA0000A1Z5"), true);
  assert.equal(validGstin("21AAAA"), false);
});
