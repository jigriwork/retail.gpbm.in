import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

const access = () => fixture({ role: "manager" }).load("@/lib/auth/access");
// India is UTC+5:30, so 09:30 IST is 04:00 UTC and 23:00 IST is 17:30 UTC.
const ist = (hours, minutes) => new Date(Date.UTC(2026, 9, 1, hours, minutes) - (5 * 60 + 30) * 60_000);

test("manager hours run from 9:30 AM to 11:00 PM India time", () => {
  const { isManagerHours } = access();
  assert.equal(isManagerHours(ist(9, 29)), false);
  assert.equal(isManagerHours(ist(9, 30)), true);
  assert.equal(isManagerHours(ist(14, 0)), true);
  assert.equal(isManagerHours(ist(22, 59)), true);
  assert.equal(isManagerHours(ist(23, 0)), false);
  assert.equal(isManagerHours(ist(2, 0)), false);
});

test("handheld devices are recognised by any one signal", () => {
  const { isHandheld } = access();
  const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
  assert.equal(isHandheld({ userAgent: desktop }), false);
  assert.equal(isHandheld({ userAgent: desktop, pointer: "f", mobileHint: "?0" }), false);
  assert.equal(isHandheld({ userAgent: iphone }), true);
  assert.equal(isHandheld({ userAgent: android }), true);
  assert.equal(isHandheld({ userAgent: desktop, mobileHint: "?1" }), true);
  // A phone asking for the desktop site still reports a touch-first pointer.
  assert.equal(isHandheld({ userAgent: desktop, pointer: "c" }), true);
});

test("handhelds get everyday store pages only", () => {
  const { handheldAllows } = access();
  for (const path of [
    "/app/today", "/app/tasks", "/app/tasks/new", "/app/checklist/gp", "/app/updates/new", "/app/sops", "/app/reviews/rack",
    "/app/settings/account", "/app/reports", "/app/reports/", "/app/reports/sales", "/app/reports/stock",
    "/app/reports/staff-aliases", "/app/stores", "/app/staff-accounts",
  ]) assert.equal(handheldAllows(path), true, path);
  for (const path of [
    "/app/reports/sales/analytics", "/app/reports/stock/analytics", "/app/reports/business", "/app/reports/staff",
    "/app/reports/salary-attendance", "/app/reports/correction", "/app/stores/gp", "/app/employees", "/app/employees/new",
    "/app/audit", "/app/audit/gp", "/app/payslips", "/app/secretary", "/app/owner/review", "/app/users", "/app/life",
  ]) assert.equal(handheldAllows(path), false, path);
});
