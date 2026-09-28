import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

const state = { ok: false, message: "" };
const form = entries => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};
const shared = () => fixture({ role: "owner" }).load("@/lib/owner/phase2-shared");
const signal = (key, metric, unit = "days behind") => ({ key, label: key, metric, unit });
const record = (overrides) => ({
  created_at: "2026-09-25T10:00:00Z", created_by: "o1", evidence_text: "", id: "f1", outcome: "", reason: "",
  recommendation_key: "priority:sales-freshness", signal: signal("BM", 1), source: "daily_priority", status: "dismissed",
  task: null, task_id: null, title: "Uploads behind", ...overrides,
});

test("Phase 2 follow-up: a dismissed priority stays hidden until evidence changes materially", () => {
  const { assessFollowup } = shared();
  const same = assessFollowup(signal("BM", 1), record({ reason: "Puja holiday" }), "2026-09-28");
  assert.equal(same.kind, "handled");
  assert.match(same.explanation, /Puja holiday/);

  const slightlyWorse = assessFollowup(signal("BM", 2), record({}), "2026-09-28");
  assert.equal(slightlyWorse.kind, "handled", "a one-day slip is not material");

  const worse = assessFollowup(signal("BM", 4), record({}), "2026-09-28");
  assert.equal(worse.kind, "raised_again");
  assert.match(worse.explanation, /worsened from 1 to 4 days behind/);

  const otherStore = assessFollowup(signal("BM,GP", 1), record({}), "2026-09-28");
  assert.equal(otherStore.kind, "raised_again");
  assert.match(otherStore.explanation, /covers has changed/);

  const stale = assessFollowup(signal("BM", 1), record({ created_at: "2026-09-01T10:00:00Z" }), "2026-09-28");
  assert.equal(stale.kind, "raised_again", "dismissals expire after 14 days");
});

test("Phase 2 follow-up: linked tasks and decisions keep an item handled only while open", () => {
  const { assessFollowup } = shared();
  const open = assessFollowup(signal("overdue", 12, "tasks"), record({ status: "converted", task_id: "t1", task: { id: "t1", status: "pending", title: "Clear backlog", completed_at: null }, signal: signal("overdue", 12, "tasks") }), "2026-09-28");
  assert.equal(open.kind, "handled");
  const done = assessFollowup(signal("overdue", 12, "tasks"), record({ status: "converted", task_id: "t1", task: { id: "t1", status: "done", title: "Clear backlog", completed_at: "2026-09-27T10:00:00Z" }, signal: signal("overdue", 12, "tasks") }), "2026-09-28");
  assert.equal(done.kind, "raised_again");
  assert.match(done.explanation, /completed on 27 Sept?/);
  const deleted = assessFollowup(signal("overdue", 12), record({ status: "converted", task_id: null, task: null }), "2026-09-28");
  assert.equal(deleted.kind, "raised_again");

  const testing = assessFollowup(signal("BM", 1), record({ status: "accepted", decision: { id: "d1", status: "active", title: "Evening upload routine", result: null, reviewed_at: null } }), "2026-09-28");
  assert.equal(testing.kind, "handled");
  const reviewed = assessFollowup(signal("BM", 1), record({ status: "accepted", decision: { id: "d1", status: "reviewed", title: "Evening upload routine", result: "mixed", reviewed_at: "2026-09-27" } }), "2026-09-28");
  assert.equal(reviewed.kind, "raised_again");
  const acceptedIdle = assessFollowup(signal("BM", 1), record({ status: "accepted", created_at: "2026-09-18T10:00:00Z" }), "2026-09-28");
  assert.equal(acceptedIdle.kind, "raised_again", "accepted without a link resurfaces after 7 days");
});

test("Phase 2 follow-up: Today keeps five visible priorities and moves handled ones aside", () => {
  const f = fixture({ role: "owner" });
  const { assessPriorities } = f.load("@/lib/owner/followups");
  const priorities = Array.from({ length: 7 }, (_, index) => ({ id: `p${index}`, title: `P${index}`, signal: signal(`k${index}`, 1) }));
  const records = [record({ recommendation_key: "priority:p0", signal: signal("k0", 1) })];
  const result = assessPriorities(priorities, records, "2026-09-28");
  assert.equal(result.handled.length, 1);
  assert.equal(result.handled[0].id, "p0");
  assert.equal(result.visible.length, 5);
  assert.ok(!result.visible.some(item => item.id === "p0"));
});

test("Phase 2 priorities carry comparable signals", () => {
  const f = fixture({ role: "owner" });
  const { buildDailyPriorities } = f.load("@/lib/owner/priorities");
  const priorities = buildDailyPriorities({
    coverage: [{ storeId: "gp", available: true, currentMonthDays: 20, previousMonthDays: 30 }, { storeId: "bm", available: true, currentMonthDays: 20, previousMonthDays: 30 }],
    limit: 20,
    overdueTasks: [{ due_date: "2026-09-01" }, { due_date: "2026-09-02" }],
    salesStatuses: [
      { store: { id: "gp", name: "Go Planet", code: "GP" }, latestReport: { report_date: "2026-01-01", summary: {} } },
      { store: { id: "bm", name: "Brand Mark", code: "BM" }, latestReport: null },
    ],
    stores: [{ id: "gp", name: "Go Planet", code: "GP", firm_name: "Go Planet" }, { id: "bm", name: "Brand Mark", code: "BM", firm_name: "GP Fashion" }],
    urgentUpdates: 0,
  });
  const fresh = priorities.find(item => item.id === "sales-freshness");
  assert.equal(fresh.signal.key, "BM,GP");
  assert.ok(fresh.signal.metric >= 30);
  assert.equal(priorities.find(item => item.id === "overdue-tasks").signal.metric, 2);
  assert.ok(!priorities.some(item => item.id === "brand-mark-firm"), "no firm priority once BM maps to GP Fashion");
});

const storeFacts = (overrides) => ({
  code: "GP", id: "gp", latestSalesDate: "2026-09-27", name: "Go Planet", unmatchedStaffNames: 0,
  routines: { cleaningDays: 7, previousCleaningDays: 7, previousRackDays: 7, rackDays: 7, updateDays: 7 },
  sales: { bills: 700, daysLoaded: 7, missingDates: [], mittyNetSale: null, netSale: 1_150_000 },
  previous: { bills: 650, daysLoaded: 7, missingDates: [], mittyNetSale: null, netSale: 1_000_000 },
  urgent: { openedThisWeek: 0, openOlderThanTwoDays: 0, resolvedThisWeek: 0 },
  ...overrides,
});
const weekFacts = (stores, extra = {}) => ({
  decisions: { dueNextWeek: [], reviewedThisWeek: [], tried: [] },
  followups: { acceptedUnlinked: [], thisWeek: [] },
  generatedAt: "2026-09-28T04:00:00Z", inProgress: false, stores,
  tasks: { completed: [], completedCount: 4, createdCount: 5, previousCompletedCount: 3, stuck: [], stuckCount: 0 },
  weekEnd: "2026-09-27", weekStart: "2026-09-21", ...extra,
});

test("Phase 2 weekly review compares sales only with complete coverage", () => {
  const { deriveWeeklyReview } = fixture({ role: "owner" }).load("@/lib/owner/weekly-review-rules");
  const complete = deriveWeeklyReview(weekFacts([storeFacts({})]));
  assert.ok(complete.improved.some(item => /Go Planet net sales up \+15%/.test(item.text)));
  assert.match(complete.improved[0].evidence, /all 7 days loaded/);

  const gap = deriveWeeklyReview(weekFacts([storeFacts({
    code: "BM", id: "bm", name: "Brand Mark",
    sales: { bills: 200, daysLoaded: 5, missingDates: ["2026-09-23", "2026-09-25"], mittyNetSale: null, netSale: 900_000 },
  })]));
  assert.equal(gap.improved.filter(item => /net sales/.test(item.text)).length, 0, "no sales claim with missing days");
  assert.equal(gap.slipped.filter(item => /net sales/.test(item.text)).length, 0);
  assert.ok(gap.dataLimits.some(item => /Brand Mark: sales not compared — 5\/7 days/.test(item)));
  assert.ok(gap.decisionsNeeded.some(item => /missing Brand Mark sales files/.test(item.text)));

  const small = deriveWeeklyReview(weekFacts([storeFacts({ sales: { bills: 650, daysLoaded: 7, missingDates: [], mittyNetSale: null, netSale: 1_030_000 } })]));
  assert.equal(small.improved.filter(item => /net sales/.test(item.text)).length, 0, "a 3% move is treated as normal variation");

  const running = deriveWeeklyReview(weekFacts([storeFacts({})], { inProgress: true }));
  assert.equal(running.improved.filter(item => /net sales/.test(item.text)).length, 0, "no comparison while the week is open");
});

test("Phase 2 weekly review surfaces routines, stuck work and decisions due", () => {
  const { deriveWeeklyReview } = fixture({ role: "owner" }).load("@/lib/owner/weekly-review-rules");
  const review = deriveWeeklyReview(weekFacts(
    [storeFacts({ routines: { cleaningDays: 3, previousCleaningDays: 7, previousRackDays: 7, rackDays: 4, updateDays: 3 }, urgent: { openedThisWeek: 2, openOlderThanTwoDays: 1, resolvedThisWeek: 1 } })],
    {
      decisions: {
        dueNextWeek: [{ id: "d1", title: "Trial-room follow-up at BM", review_date: "2026-10-02", start_date: "2026-09-18", status: "active" }],
        reviewedThisWeek: [
          { id: "d2", title: "BM alteration call-back", result: "worked", evidence_basis: "observation", verdict: "not_measured", review_date: "2026-09-26", start_date: "2026-09-12", status: "reviewed" },
          { id: "d3", title: "MITTY front table", result: "worked", evidence_basis: "data", verdict: "improved", change_ratio: 0.18, review_date: "2026-09-26", start_date: "2026-09-12", status: "reviewed" },
        ],
        tried: [],
      },
      tasks: { completed: [], completedCount: 1, createdCount: 2, previousCompletedCount: 3, stuck: [{ id: "t1", title: "Fix AC in trial room", due_date: "2026-09-05", days: 22 }], stuckCount: 1 },
    },
  ));
  assert.ok(review.slipped.some(item => /floor checks were missed/.test(item.text)));
  assert.ok(review.slipped.some(item => /urgent store issues/.test(item.text)));
  assert.ok(review.slipped.some(item => /overdue by more than a week/.test(item.text)));
  const measured = review.improved.find(item => /MITTY front table/.test(item.text));
  assert.match(measured.text, /^Sales improved during “MITTY front table”$/, "measured movement is described as sales, not success");
  assert.match(measured.evidence, /\+18%/);
  assert.match(measured.evidence, /Owner judged it: Worked/);
  assert.match(measured.evidence, /not that this decision caused it/);
  assert.ok(!review.improved.some(item => /alteration call-back/.test(item.text)), "an owner observation is never reported as measured improvement");
  assert.ok(!review.improved.some(item => /worked/i.test(item.text)), "no finding claims a decision worked");
  assert.ok(review.decisionsNeeded.some(item => /Review decision “Trial-room follow-up at BM”/.test(item.text)));
  assert.ok(review.decisionsNeeded.some(item => /stuck for over two weeks/.test(item.text)));
  assert.ok(review.decisionsNeeded.length <= 5);
});

test("Phase 2 SOP steps accept only short steps and in-app links", () => {
  const { parseSopSteps, formatSopSteps } = shared();
  const parsed = parseSopSteps("Check trial rooms | /app/reviews/cleaning\n\nBilling ready");
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.steps)), [{ text: "Check trial rooms", href: "/app/reviews/cleaning" }, { text: "Billing ready" }]);
  assert.equal(formatSopSteps(parsed.steps), "Check trial rooms | /app/reviews/cleaning\nBilling ready");
  assert.match(parseSopSteps("Bad | https://example.com").error, /app paths/);
  assert.match(parseSopSteps(Array.from({ length: 13 }, (_, i) => `Step ${i}`).join("\n")).error, /12 steps/);
  assert.match(parseSopSteps("   ").error, /at least one/);
});

test("Phase 2 week helpers use Monday–Sunday India weeks", () => {
  const { lastCompletedWeekStart, weekStartFor } = shared();
  assert.equal(weekStartFor("2026-09-28"), "2026-09-28");
  assert.equal(weekStartFor("2026-10-04"), "2026-09-28");
  assert.equal(lastCompletedWeekStart("2026-09-28"), "2026-09-21");
  assert.equal(lastCompletedWeekStart("2026-10-01"), "2026-09-21");
});

for (const role of ["manager", "staff"]) {
  test(`Phase 2 ${role} cannot use any owner action and sees no owner data`, async () => {
    const f = fixture({ role });
    const before = JSON.stringify(f.db);
    const decisions = f.load("@/lib/owner/decision-actions");
    for (const action of [decisions.saveDecision, decisions.reviewDecision, decisions.setDecisionStatus, decisions.updateDecisionLearning]) {
      const result = await action(state, form({ decisionId: "d1", title: "x", kind: "display", hypothesis: "x", result: "worked", status: "active" }));
      assert.equal(result.ok, false);
    }
    const review = await f.load("@/lib/owner/weekly-review-actions").saveWeeklyReview(state, form({ weekStart: "2026-09-21", intent: "save" }));
    assert.equal(review.ok, false);
    const followups = f.load("@/lib/owner/followup-actions");
    assert.equal((await followups.recordPriorityFollowup(state, form({ priorityId: "sales-freshness", intent: "create_task" }))).ok, false);
    assert.equal((await followups.recordSecretaryFollowup(state, form({ chatId: "c1", title: "x", intent: "accept" }))).ok, false);
    assert.equal((await f.load("@/lib/sops/actions").saveSop(state, form({ title: "x", steps: "x", exceptionCategory: "Other" }))).ok, false);
    assert.equal(JSON.stringify(await f.load("@/lib/owner/decisions").getDecisions()), JSON.stringify({ available: false, decisions: [] }));
    assert.equal(JSON.stringify(await f.load("@/lib/owner/followups").getRecommendationFollowups()), JSON.stringify({ available: false, records: [] }));
    assert.equal(await f.load("@/lib/owner/weekly-review").buildWeeklyEvidence("2026-09-21"), null);
    assert.equal(JSON.stringify(f.db), before, "no owner data was changed");
  });
}

test("Phase 2 migration is additive, owner-scoped and ordered after Phase 1", () => {
  const sql = readFileSync("supabase/migrations/20260928180000_owner_phase2_operating_system.sql", "utf8");
  assert.ok("20260928180000" > "20260928120000");
  assert.doesNotMatch(sql, /\b(drop|alter)\s+table\s+(if exists\s+)?public\.(sales_rows|stock_rows|reports|tasks|payslip|profiles|stores|owner_notes|ai_chats)/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*delete/i);
  assert.doesNotMatch(sql, /\bupdate\s+public\.(sales_rows|reports|tasks|payslip_rows|profiles)\b/i);
  assert.match(sql, /sops_manager_select_assigned[\s\S]*user_store_ids\(\)/);
  for (const table of ["recommendation_followups", "business_decisions", "weekly_reviews", "sops", "sop_revisions"]) {
    assert.match(sql, new RegExp(`${table}_active_required|'${table}'`), `${table} has the active-user restrictive policy`);
  }
});
