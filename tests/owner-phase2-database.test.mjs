// Phase 2 real Auth + RLS + PostgREST tests. Local Supabase only.
// Run: LOCAL_SUPABASE_URL=… LOCAL_SUPABASE_ANON_KEY=… LOCAL_SUPABASE_SERVICE_ROLE_KEY=… node --test tests/owner-phase2-database.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && anonKey && serviceRoleKey, "Local Supabase credentials are required");
const parsedUrl = new URL(url);
assert.ok(
  parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "localhost",
  `Refusing to run database policy tests against non-local URL: ${url}`,
);

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceRoleKey, clientOptions);
const anonymous = createClient(url, anonKey, clientOptions);
const runId = randomUUID().slice(0, 8);
const password = `${randomUUID()}Aa9!`;
const testBrand = `TEST-${runId}`;

const actorSpecs = [
  { key: "owner1", role: "owner", active: true },
  { key: "owner2", role: "owner", active: true },
  { key: "managerGp", role: "manager", active: true, store: "GP" },
  { key: "managerBm", role: "manager", active: true, store: "BM" },
  { key: "staff", role: "staff", active: true, store: "GP" },
  { key: "inactiveOwner", role: "owner", active: false },
  { key: "inactiveManager", role: "manager", active: false, store: "GP" },
];
const actors = {};
let stores;
let gp;
let bm;

function ok(result, context) {
  assert.equal(result.error, null, `${context}: ${result.error?.message}`);
  return result.data;
}

function india(offsetDays) {
  const date = new Date(Date.now() + 5.5 * 3600_000);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function lastMonday() {
  const today = new Date(`${india(0)}T12:00:00Z`);
  const day = today.getUTCDay();
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() - (day === 0 ? 6 : day - 1));
  thisMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return thisMonday.toISOString().slice(0, 10);
}

const denied = () => [
  ["managerGp", actors.managerGp.client],
  ["staff", actors.staff.client],
  ["inactiveOwner", actors.inactiveOwner.client],
  ["inactiveManager", actors.inactiveManager.client],
  ["anonymous", anonymous],
];

before(async () => {
  stores = ok(await admin.from("stores").select("id,code"), "load stores");
  gp = stores.find((store) => store.code === "GP");
  bm = stores.find((store) => store.code === "BM");
  assert.ok(gp && bm, "GP and BM store fixtures are required");

  for (const spec of actorSpecs) {
    const email = `phase2-${spec.key.toLowerCase()}-${runId}@example.invalid`;
    const created = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Phase 2 ${spec.key}` } }),
      `create ${spec.key}`,
    );
    const id = created.user.id;
    // Assign stores while active so the staff role transition is not blocked by account rules.
    ok(await admin.from("profiles").update({ role: spec.role, is_active: true }).eq("id", id), `configure ${spec.key}`);
    if (spec.store) {
      const store = stores.find((item) => item.code === spec.store);
      ok(await admin.from("store_users").insert({ store_id: store.id, user_id: id, role: spec.role }), `assign ${spec.key}`);
    }
    const client = createClient(url, anonKey, clientOptions);
    ok(await client.auth.signInWithPassword({ email, password }), `sign in ${spec.key}`);
    if (!spec.active) ok(await admin.from("profiles").update({ is_active: false }).eq("id", id), `deactivate ${spec.key}`);
    actors[spec.key] = { client, email, id };
  }

  // 28 closed days of GP sales: 20 bills a day. The comparison half sells the
  // test brand at ₹1,000 a bill and the trial half at ₹1,250 (+25%), so the
  // bill count stays flat while brand sales clearly rise.
  for (let offset = -28; offset <= -1; offset += 1) {
    const date = india(offset);
    const report = ok(
      await admin
        .from("reports")
        .insert({ store_id: gp.id, uploaded_by: actors.owner1.id, report_type: "sales", report_date: date, file_name: `phase2-${runId}-${date}.xlsx`, row_count: 20 })
        .select("id")
        .single(),
      `seed report ${date}`,
    );
    const netSale = offset >= -14 ? 1250 : 1000;
    ok(
      await admin.from("sales_rows").insert(
        Array.from({ length: 20 }, (_, bill) => ({
          report_id: report.id,
          store_id: gp.id,
          sale_date: date,
          bill_no: `P2-${runId}-${date}-${bill}`,
          brand: testBrand,
          category: "Shirts",
          quantity: 1,
          net_sale: netSale,
          staff_name: "Phase Two",
        })),
      ),
      `seed sales ${date}`,
    );
  }
});

after(async () => {
  // Leave disposable local fixtures for inspection; only the sessions are closed.
  for (const actor of Object.values(actors)) await actor.client.auth.signOut().catch(() => {});
});

describe("SOPs", () => {
  let bmSop;
  let gpInactive;

  test("owners manage SOPs and every edit keeps the previous version", async () => {
    const { owner1, owner2 } = actors;
    bmSop = ok(
      await owner1.client
        .from("sops")
        .insert({
          sop_key: `bm-premium-${runId}`,
          store_id: bm.id,
          title: "Brand Mark premium opening",
          steps: [{ text: "Perfume tester tray full and wiped." }, { text: "Trial room lights and mirror checked.", href: "/app/reviews/cleaning" }],
          escalate_when: "Trial room AC not working.",
          exception_category: "Opening status",
          created_by: owner1.id,
          updated_by: owner1.id,
        })
        .select()
        .single(),
      "owner 1 creates BM SOP",
    );
    gpInactive = ok(
      await owner1.client
        .from("sops")
        .insert({
          sop_key: `gp-draft-${runId}`,
          store_id: gp.id,
          title: "GP draft routine",
          steps: [{ text: "Draft step" }],
          is_active: false,
          created_by: owner1.id,
          updated_by: owner1.id,
        })
        .select()
        .single(),
      "owner 1 creates inactive GP SOP",
    );
    const edited = ok(
      await owner2.client
        .from("sops")
        .update({ steps: [{ text: "Perfume tester tray full, wiped and priced." }], updated_by: owner2.id })
        .eq("id", bmSop.id)
        .select()
        .single(),
      "owner 2 edits BM SOP",
    );
    assert.equal(edited.version, 2);
    const revisions = ok(await owner1.client.from("sop_revisions").select("version,snapshot").eq("sop_id", bmSop.id), "owner reads revisions");
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].version, 1);
    assert.equal(revisions[0].snapshot.steps.length, 2);

    const badLink = await owner1.client.from("sops").insert({
      sop_key: `bad-${runId}`, title: "Bad", steps: [{ text: "x", href: "https://example.com" }], created_by: owner1.id, updated_by: owner1.id,
    });
    assert.ok(badLink.error, "external links in SOP steps are rejected");
    const spoofed = await owner1.client.from("sops").update({ title: "Spoofed", updated_by: owner2.id }).eq("id", bmSop.id).select("id");
    assert.ok(spoofed.error || spoofed.data.length === 0, "updated_by must be the acting owner");
    const deleted = await owner1.client.from("sops").delete().eq("id", bmSop.id);
    assert.ok(deleted.error, "SOPs are deactivated, not deleted");
  });

  test("managers see only active SOPs for their own store", async () => {
    const gpView = ok(await actors.managerGp.client.from("sops").select("id,sop_key,store_id,is_active"), "GP manager reads SOPs");
    const bmView = ok(await actors.managerBm.client.from("sops").select("id,sop_key,store_id,is_active"), "BM manager reads SOPs");
    for (const key of ["opening", "floor-supervision", "complaints", "closing"]) {
      assert.ok(gpView.some((sop) => sop.sop_key === key && sop.store_id === null), `GP manager sees ${key}`);
      assert.ok(bmView.some((sop) => sop.sop_key === key && sop.store_id === null), `BM manager sees ${key}`);
    }
    assert.ok(!gpView.some((sop) => sop.id === bmSop.id), "GP manager must not see the BM SOP");
    assert.ok(bmView.some((sop) => sop.id === bmSop.id), "BM manager sees the BM SOP");
    assert.ok(!gpView.some((sop) => sop.id === gpInactive.id), "inactive SOPs are hidden from managers");
    assert.ok(gpView.every((sop) => sop.is_active && (sop.store_id === null || sop.store_id === gp.id)));

    const revisions = ok(await actors.managerBm.client.from("sop_revisions").select("id"), "manager reads revisions");
    assert.deepEqual(revisions, [], "SOP history is owner-only");
    const update = await actors.managerBm.client.from("sops").update({ title: "Changed by manager" }).eq("id", bmSop.id).select("id");
    assert.ok(update.error || update.data.length === 0, "managers cannot edit SOPs");
    const insert = await actors.managerBm.client.from("sops").insert({
      sop_key: `mgr-${runId}`, title: "Manager SOP", steps: [{ text: "x" }], created_by: actors.managerBm.id, updated_by: actors.managerBm.id,
    });
    assert.ok(insert.error, "managers cannot create SOPs");
  });

  test("staff, inactive users and anonymous callers receive no SOPs", async () => {
    for (const [name, client] of [["staff", actors.staff.client], ["inactiveOwner", actors.inactiveOwner.client], ["inactiveManager", actors.inactiveManager.client]]) {
      assert.deepEqual(ok(await client.from("sops").select("id"), `${name} reads SOPs`), [], `${name} must not read SOPs`);
    }
    assert.ok((await anonymous.from("sops").select("id")).error, "anonymous has no table privilege");
  });
});

describe("Decision log", () => {
  const ids = {};

  test("owners share decisions and linking an existing task creates no task", async () => {
    const { owner1, owner2 } = actors;
    const task = ok(
      await admin.from("tasks").insert({
        store_id: gp.id, created_by: owner1.id, assigned_to: actors.managerGp.id, title: `Trial-room follow-up ${runId}`,
        due_date: india(3), priority: "normal", status: "pending", source: "manual", is_private: false,
      }).select("id").single(),
      "seed existing task",
    );
    const before = ok(await admin.from("tasks").select("id", { count: "exact", head: false }), "count tasks").length;
    const base = { created_by: owner1.id, updated_by: owner1.id, responsible_name: "", responsible_profile_id: null, brand: null, measure_filter: null, task_id: null, store_id: null, hypothesis: "Customers leave the trial room without a second option.", success_measure: "Clear rise in the measure after two weeks." };
    const rows = ok(
      await owner1.client.from("business_decisions").insert([
        { ...base, title: `Brand push ${runId}`, kind: "display", store_id: gp.id, brand: testBrand, measure_type: "brand_net_sales", measure_filter: testBrand, start_date: india(-14), review_date: india(-1), status: "active", task_id: task.id, responsible_profile_id: actors.managerGp.id },
        { ...base, title: `Bills per day ${runId}`, kind: "staff_placement", store_id: gp.id, measure_type: "store_bills", start_date: india(-14), review_date: india(-1), status: "active", responsible_name: "Ramesh" },
        { ...base, title: `BM sales ${runId}`, kind: "customer_follow_up", store_id: bm.id, measure_type: "store_net_sales", start_date: india(-14), review_date: india(-1), status: "active", responsible_name: "Sunita" },
        { ...base, title: `Observation ${runId}`, kind: "operations", measure_type: "observation", start_date: india(-7), review_date: india(0), status: "active", responsible_name: "Floor manager" },
        { ...base, title: `Too early ${runId}`, kind: "assortment", store_id: gp.id, measure_type: "store_net_sales", start_date: india(-3), review_date: india(10), status: "active", responsible_name: "Buyer" },
      ]).select("id,title"),
      "owner 1 creates decisions",
    );
    for (const row of rows) ids[row.title.split(` ${runId}`)[0]] = row.id;
    const after = ok(await admin.from("tasks").select("id"), "count tasks after").length;
    assert.equal(after, before, "linking a decision to a task must not create tasks");

    const read = ok(await owner2.client.from("business_decisions").select("id,task_id").eq("id", ids["Brand push"]).single(), "owner 2 reads");
    assert.equal(read.task_id, task.id);
    ok(await owner2.client.from("business_decisions").update({ responsible_name: "Anil (floor)", updated_by: owner2.id }).eq("id", ids["Bills per day"]).select().single(), "owner 2 edits");
  });

  test("results cannot be written directly, only through the evidence-checked review", async () => {
    const { owner1 } = actors;
    const preset = await owner1.client.from("business_decisions").insert({
      title: `Preset ${runId}`, kind: "other", hypothesis: "x", success_measure: "x", measure_type: "observation",
      start_date: india(-1), review_date: india(1), created_by: owner1.id, updated_by: owner1.id, status: "reviewed", result: "worked",
    });
    assert.ok(preset.error, "cannot insert a decision with a result");
    const direct = await owner1.client.from("business_decisions").update({ result: "worked", status: "reviewed", reviewed_at: new Date().toISOString(), updated_by: owner1.id }).eq("id", ids["Bills per day"]);
    assert.ok(direct.error, "cannot set a result directly");
    const measure = await owner1.client.rpc("decision_measure_window", { p_store_ids: [gp.id], p_measure: "store_bills", p_filter: null, p_start: india(-3), p_end: india(-1) });
    assert.ok(measure.error, "the raw measure helper is not exposed");
  });

  test("worked is accepted only when the selected measure supports it", async () => {
    const { owner1, owner2 } = actors;
    const brand = ok(await owner1.client.rpc("evaluate_business_decision", { p_decision_id: ids["Brand push"] }), "evaluate brand push");
    assert.equal(brand.verdict, "improved", JSON.stringify(brand));
    assert.match(brand.explanation, /^Sales improved: the measure rose 25/);
    assert.match(brand.explanation, /not proof that the decision caused it/);
    assert.match(brand.caveat, /festivals/);
    assert.equal(brand.trial.covered_store_days, 14);
    assert.ok(Math.abs(brand.change_ratio - 0.25) < 0.0001);

    const bills = ok(await owner1.client.rpc("evaluate_business_decision", { p_decision_id: ids["Bills per day"] }), "evaluate bills");
    assert.equal(bills.verdict, "no_clear_change", JSON.stringify(bills));
    const bmEval = ok(await owner1.client.rpc("evaluate_business_decision", { p_decision_id: ids["BM sales"] }), "evaluate BM");
    assert.equal(bmEval.verdict, "insufficient_data");
    const early = ok(await owner1.client.rpc("evaluate_business_decision", { p_decision_id: ids["Too early"] }), "evaluate early");
    assert.equal(early.verdict, "too_short");

    for (const key of ["Bills per day", "BM sales", "Too early"]) {
      const rejected = await owner1.client.rpc("review_business_decision", { p_decision_id: ids[key], p_result: "worked", p_result_note: "Looks good", p_learned: "" });
      assert.ok(rejected.error, `${key}: worked must be rejected`);
      assert.match(rejected.error.message, /do not support "worked"/);
    }
    const noNote = await owner1.client.rpc("review_business_decision", { p_decision_id: ids.Observation, p_result: "worked", p_result_note: " ", p_learned: "" });
    assert.ok(noNote.error, "observation needs a written note");

    ok(await owner2.client.rpc("review_business_decision", { p_decision_id: ids["Brand push"], p_result: "worked", p_result_note: "Brand sales rose 25%.", p_learned: "Keep the front table." }), "brand push worked");
    ok(await owner1.client.rpc("review_business_decision", { p_decision_id: ids["Bills per day"], p_result: "inconclusive", p_result_note: "", p_learned: "Bills did not move." }), "bills inconclusive");
    ok(await owner1.client.rpc("review_business_decision", { p_decision_id: ids.Observation, p_result: "worked", p_result_note: "Fewer customers waited unattended at 7 pm.", p_learned: "" }), "observation worked");

    const reviewed = ok(await owner1.client.from("business_decisions").select("status,result,evidence_basis,evidence,reviewed_by").eq("id", ids["Brand push"]).single(), "read reviewed");
    assert.equal(reviewed.status, "reviewed");
    assert.equal(reviewed.evidence_basis, "data");
    assert.equal(reviewed.evidence.verdict, "improved");
    assert.equal(reviewed.reviewed_by, owner2.id);
    const observed = ok(await owner1.client.from("business_decisions").select("evidence_basis").eq("id", ids.Observation).single(), "read observation");
    assert.equal(observed.evidence_basis, "observation");

    const again = await owner1.client.rpc("review_business_decision", { p_decision_id: ids["Brand push"], p_result: "did_not_work", p_result_note: "", p_learned: "" });
    assert.ok(again.error, "a reviewed decision cannot be re-reviewed");
    const moveDates = await owner1.client.from("business_decisions").update({ start_date: india(-20), updated_by: owner1.id }).eq("id", ids["Brand push"]);
    assert.ok(moveDates.error, "the judged period cannot be changed after review");
    ok(await owner1.client.from("business_decisions").update({ learned: "Keep the front table on weekends too.", updated_by: owner1.id }).eq("id", ids["Brand push"]).select().single(), "lesson can be refined");
  });

  test("managers, staff, inactive users and anonymous callers cannot touch decisions", async () => {
    for (const [name, client] of denied()) {
      const read = await client.from("business_decisions").select("id").eq("id", ids["BM sales"]);
      if (name === "anonymous") assert.ok(read.error);
      else assert.deepEqual(read.data, [], `${name} must not read decisions`);
      const insert = await client.from("business_decisions").insert({
        title: `Forbidden ${name}`, kind: "other", hypothesis: "x", success_measure: "x", measure_type: "observation",
        start_date: india(0), review_date: india(7), created_by: actors.owner1.id, updated_by: actors.owner1.id,
      });
      assert.ok(insert.error, `${name} must not create decisions`);
      const update = await client.from("business_decisions").update({ title: "Tampered" }).eq("id", ids["BM sales"]).select("id");
      assert.ok(update.error || update.data.length === 0, `${name} must not edit decisions`);
      assert.ok((await client.rpc("evaluate_business_decision", { p_decision_id: ids["BM sales"] })).error, `${name} must not evaluate`);
      assert.ok((await client.rpc("review_business_decision", { p_decision_id: ids["BM sales"], p_result: "mixed" })).error, `${name} must not review`);
    }
    assert.deepEqual(ok(await actors.managerBm.client.from("business_decisions").select("id"), "BM manager list"), []);
  });
});

describe("Weekly reviews", () => {
  let reviewId;
  const week = lastMonday();

  test("owners share one review per week and a completed review keeps its evidence", async () => {
    const { owner1, owner2 } = actors;
    const existing = ok(await admin.from("weekly_reviews").select("id").eq("week_start", week), "check existing week");
    if (existing.length) ok(await admin.from("weekly_reviews").delete().eq("week_start", week), "clear local week from earlier run");
    const draft = ok(
      await owner1.client.from("weekly_reviews").insert({
        week_start: week, week_end: new Date(Date.parse(`${week}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10),
        evidence: { version: 1, note: "first" }, conclusion: "", created_by: owner1.id, updated_by: owner1.id,
      }).select().single(),
      "owner 1 saves draft",
    );
    reviewId = draft.id;
    const duplicate = await owner2.client.from("weekly_reviews").insert({ week_start: week, week_end: draft.week_end, created_by: owner2.id, updated_by: owner2.id });
    assert.ok(duplicate.error, "only one review per week");
    const tuesday = await owner1.client.from("weekly_reviews").insert({ week_start: india(1), week_end: india(7), created_by: owner1.id, updated_by: owner1.id });
    if (new Date(`${india(1)}T12:00:00Z`).getUTCDay() !== 1) assert.ok(tuesday.error, "weeks must start on Monday");

    ok(await owner2.client.from("weekly_reviews").update({
      conclusion: "GP floor checks were steady; BM uploads missing two days.", status: "completed",
      completed_at: new Date().toISOString(), completed_by: owner2.id, updated_by: owner2.id,
    }).eq("id", reviewId).select().single(), "owner 2 completes");
    const frozen = await owner1.client.from("weekly_reviews").update({ evidence: { version: 1, note: "changed" }, updated_by: owner1.id }).eq("id", reviewId);
    assert.ok(frozen.error, "completed evidence is frozen");
    ok(await owner1.client.from("weekly_reviews").update({ conclusion: "Edited conclusion after completion.", updated_by: owner1.id }).eq("id", reviewId).select().single(), "conclusion may still be edited");
    ok(await owner1.client.from("weekly_reviews").update({ status: "draft", completed_at: null, completed_by: null, updated_by: owner1.id }).eq("id", reviewId).select().single(), "reopen");
    ok(await owner1.client.from("weekly_reviews").update({ evidence: { version: 1, note: "refreshed" }, updated_by: owner1.id }).eq("id", reviewId).select().single(), "refresh after reopen");
    assert.ok((await owner1.client.from("weekly_reviews").delete().eq("id", reviewId)).error, "reviews are retained, not deleted");
  });

  test("non-owners cannot read or write weekly reviews", async () => {
    for (const [name, client] of denied()) {
      const read = await client.from("weekly_reviews").select("id").eq("id", reviewId);
      if (name === "anonymous") assert.ok(read.error);
      else assert.deepEqual(read.data, [], `${name} must not read reviews`);
      const update = await client.from("weekly_reviews").update({ conclusion: "Tampered" }).eq("id", reviewId).select("id");
      assert.ok(update.error || update.data.length === 0, `${name} must not edit reviews`);
      const insert = await client.from("weekly_reviews").insert({ week_start: "2026-01-05", week_end: "2026-01-11", created_by: actors.owner1.id, updated_by: actors.owner1.id });
      assert.ok(insert.error, `${name} must not create reviews`);
    }
  });
});

describe("Recommendation follow-up", () => {
  const key = `priority:test-${runId}`;

  test("dismissals need a reason and follow-ups are append-only", async () => {
    const { owner1, owner2 } = actors;
    const noReason = await owner1.client.from("recommendation_followups").insert({
      source: "daily_priority", recommendation_key: key, title: "Uploads behind", status: "dismissed", created_by: owner1.id,
    });
    assert.ok(noReason.error, "dismissal without a reason is rejected");
    const dismissed = ok(await owner1.client.from("recommendation_followups").insert({
      source: "daily_priority", recommendation_key: key, title: "Uploads behind", status: "dismissed",
      reason: "BM was closed for Durga Puja immersion day.", signal: { key: "BM", label: "Brand Mark", metric: 1, unit: "days behind" }, created_by: owner1.id,
    }).select().single(), "owner 1 dismisses");
    const shared = ok(await owner2.client.from("recommendation_followups").select("reason").eq("id", dismissed.id).single(), "owner 2 reads");
    assert.equal(shared.reason, "BM was closed for Durga Puja immersion day.");
    const edit = await owner2.client.from("recommendation_followups").update({ reason: "changed" }).eq("id", dismissed.id).select("id");
    assert.ok(edit.error || edit.data.length === 0, "follow-ups cannot be rewritten");
    assert.ok((await owner1.client.from("recommendation_followups").delete().eq("id", dismissed.id)).error, "follow-ups cannot be deleted");
    const spoof = await owner1.client.from("recommendation_followups").insert({
      source: "daily_priority", recommendation_key: key, title: "Spoof", status: "accepted", created_by: owner2.id,
    });
    assert.ok(spoof.error, "created_by must be the acting owner");
  });

  test("two owners converting at the same moment get one task, never a duplicate", async () => {
    const { owner1, owner2 } = actors;
    const taskKey = `priority:overdue-${runId}`;
    const args = (title) => ({ p_source: "daily_priority", p_key: taskKey, p_title: title, p_evidence: "12 active tasks are overdue", p_signal: { key: "overdue", metric: 12 } });
    const [first, second] = await Promise.all([
      owner1.client.rpc("create_followup_task", args("Clear the task backlog")),
      owner2.client.rpc("create_followup_task", args("Clear the task backlog")),
    ]);
    assert.equal(first.error, null, first.error?.message);
    assert.equal(second.error, null, second.error?.message);
    assert.equal(first.data, second.data, "both owners must receive the same task");
    const repeat = ok(await owner1.client.rpc("create_followup_task", args("Clear the task backlog")), "repeat");
    assert.equal(repeat, first.data);
    const followups = ok(await admin.from("recommendation_followups").select("id,task_id").eq("recommendation_key", taskKey), "followups");
    assert.equal(followups.length, 1, "one conversion record");
    const task = ok(await admin.from("tasks").select("*").eq("id", first.data).single(), "task");
    assert.equal(task.is_private, true);
    assert.equal(task.category, "owner-follow-up");
    assert.deepEqual(ok(await actors.managerGp.client.from("tasks").select("id").eq("id", task.id), "manager reads"), []);

    ok(await admin.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", task.id), "complete task");
    const next = ok(await owner1.client.rpc("create_followup_task", args("Clear the task backlog")), "after completion");
    assert.notEqual(next, task.id, "a completed task allows a fresh task if the issue recurs");
  });

  test("Secretary answers stay private; only the receiving owner can follow them up", async () => {
    const { owner1, owner2 } = actors;
    const chat = ok(await admin.from("ai_chats").insert({
      user_id: owner1.id, role: "assistant", content: "Put MITTY linen shirts on the GP front table for the Puja week.",
    }).select("id").single(), "seed owner 1 Secretary answer");
    assert.deepEqual(ok(await owner2.client.from("ai_chats").select("id").eq("id", chat.id), "owner 2 reads chat"), []);
    const foreignTask = await owner2.client.rpc("create_followup_task", {
      p_source: "secretary", p_key: `secretary:${chat.id}`, p_title: "MITTY front table", p_source_chat_id: chat.id,
    });
    assert.ok(foreignTask.error, "another owner cannot convert a private Secretary answer");
    const foreignInsert = await owner2.client.from("recommendation_followups").insert({
      source: "secretary", recommendation_key: `secretary:${chat.id}`, title: "MITTY front table", status: "accepted", source_chat_id: chat.id, created_by: owner2.id,
    });
    assert.ok(foreignInsert.error, "another owner cannot attach a private Secretary answer");
    const own = ok(await owner1.client.from("recommendation_followups").insert({
      source: "secretary", recommendation_key: `secretary:${chat.id}`, title: "MITTY front table for Puja week",
      evidence_text: "Put MITTY linen shirts on the GP front table for the Puja week.", status: "accepted", source_chat_id: chat.id, created_by: owner1.id,
    }).select("id").single(), "owner 1 shares an excerpt");
    const visible = ok(await owner2.client.from("recommendation_followups").select("evidence_text").eq("id", own.id).single(), "owner 2 sees excerpt");
    assert.match(visible.evidence_text, /MITTY/);

    const decision = ok(await owner1.client.from("business_decisions").insert({
      title: `MITTY front table ${runId}`, kind: "display", store_id: gp.id, brand: "MITTY", hypothesis: "Visible placement during Puja lifts MITTY sales.",
      success_measure: "MITTY sales per day up 10%", measure_type: "brand_net_sales", measure_filter: "MITTY", start_date: india(0), review_date: india(14),
      followup_id: own.id, created_by: owner1.id, updated_by: owner1.id,
    }).select("id").single(), "decision from follow-up");
    const duplicate = await owner2.client.from("business_decisions").insert({
      title: "Duplicate", kind: "display", hypothesis: "x", success_measure: "x", measure_type: "observation",
      start_date: india(0), review_date: india(7), followup_id: own.id, created_by: owner2.id, updated_by: owner2.id,
    });
    assert.ok(duplicate.error, "one decision per follow-up");
    assert.ok(decision.id);
  });

  test("non-owners cannot read, record or convert follow-ups", async () => {
    for (const [name, client] of denied()) {
      const read = await client.from("recommendation_followups").select("id").eq("recommendation_key", key);
      if (name === "anonymous") assert.ok(read.error);
      else assert.deepEqual(read.data, [], `${name} must not read follow-ups`);
      const insert = await client.from("recommendation_followups").insert({
        source: "daily_priority", recommendation_key: key, title: "x", status: "accepted", created_by: actors.owner1.id,
      });
      assert.ok(insert.error, `${name} must not record follow-ups`);
      const convert = await client.rpc("create_followup_task", { p_source: "daily_priority", p_key: `${key}-${name}`, p_title: "x" });
      assert.ok(convert.error, `${name} must not convert follow-ups`);
    }
  });
});
