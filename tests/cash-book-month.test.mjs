import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

test("month navigation crosses year ends; formatting never turns a missing figure into 0", () => {
  const { fmt, shiftMonth, signed, statusText } = fixture().load("@/lib/cash-book/format");
  assert.equal(shiftMonth("2026-09-01", 1), "2026-10-01");
  assert.equal(shiftMonth("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(shiftMonth("2027-01-15", -1), "2026-12-01");
  assert.equal(shiftMonth("2028-02-29", 0), "2028-02-01");
  assert.equal(fmt(null), "—");
  assert.equal(fmt(""), "—");
  assert.equal(fmt(0), "0");
  assert.equal(fmt("-14927.00"), "-14,927");
  assert.equal(fmt(122077.5), "1,22,077.5");
  assert.equal(signed(1087149), "+10,87,149");
  assert.equal(signed(null), "—");
  assert.equal(statusText({ status: "closed", source: "legacy_import", can_close: false, previous_closed: true }), "Imported");
  assert.equal(statusText({ status: "open", source: "app", can_close: true, previous_closed: true }), "Ready to close");
  assert.equal(statusText({ status: "open", source: "app", can_close: false, previous_closed: false }), "Open · previous day open");
  assert.equal(statusText({ status: "missing", source: "app", can_close: false, previous_closed: true }), "Not entered");
});
