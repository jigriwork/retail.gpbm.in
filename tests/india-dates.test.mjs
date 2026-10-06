import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const { addDays, isMondayInIndia, monthEndOf, previousMonthRange, weekStartOf } = fixture().load("@/lib/tasks/dates");

test("calendar maths: week starts Monday, month end, last month, Monday check", () => {
  assert.equal(isMondayInIndia("2026-10-05"), true);
  assert.equal(isMondayInIndia("2026-10-06"), false);
  assert.equal(weekStartOf("2026-10-05"), "2026-10-05");
  assert.equal(weekStartOf("2026-10-06"), "2026-10-05");
  assert.equal(weekStartOf("2026-10-04"), "2026-09-28", "Sunday belongs to the week that started Monday");
  assert.equal(monthEndOf("2026-10-06"), "2026-10-31");
  assert.equal(monthEndOf("2024-02-10"), "2024-02-29");
  assert.deepEqual({ ...previousMonthRange("2026-10-06") }, { endDate: "2026-09-30", startDate: "2026-09-01" });
  assert.deepEqual({ ...previousMonthRange("2026-01-15") }, { endDate: "2025-12-31", startDate: "2025-12-01" });
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("same answers whatever the server's time zone (Vercel runs in UTC)", () => {
  const script = `import { fixture } from ${JSON.stringify(new URL("./helpers/app-fixture.mjs", import.meta.url).href)};
const d = fixture().load("@/lib/tasks/dates");
console.log(JSON.stringify(["2026-10-04", "2026-10-05", "2026-10-06", "2026-03-01"].map((t) => [d.isMondayInIndia(t), d.weekStartOf(t), d.monthEndOf(t), d.previousMonthRange(t), d.addDays(t, -1)])));`;
  const run = (tz) => execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim();
  const india = run("Asia/Kolkata");
  assert.ok(india.length > 20);
  for (const tz of ["UTC", "America/Los_Angeles"]) assert.equal(run(tz), india, tz);
});
