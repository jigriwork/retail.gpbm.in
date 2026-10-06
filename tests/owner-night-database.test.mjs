import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const owner = "00000000-0000-0000-0000-000000000071";
const manager = "00000000-0000-0000-0000-000000000072";
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const BM = `'${sql("select id from stores where code='BM';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;
const day = "2026-10-06";

// Staff: Sameer sells a lot (top), Jasmin small bills, Kasim sold before but not in the last 3 days.
const bill = (staff, date, no, net, qty = 1) => `('f3000000-0000-0000-0000-000000000001', ${GP}, '${date}', '${no}', 'ITEM', 'UCB', 'M', 'X', ${qty}, ${net}, '${staff}', 'item', '{}')`;
const bills = [];
for (let d = 0; d < 7; d += 1) {
  const date = new Date(Date.UTC(2026, 9, 6 - d)).toISOString().slice(0, 10);
  for (let b = 0; b < 3; b += 1) bills.push(bill("SAMEER", date, `S${d}${b}`, 3000, 2));
  bills.push(bill("JASMIN", date, `J${d}`, 600));
  if (d >= 3) bills.push(bill("KASIM", date, `K${d}`, 1500));
}
for (let d = 10; d < 30; d += 3) bills.push(bill("KASIM", new Date(Date.UTC(2026, 9, 6 - d)).toISOString().slice(0, 10), `KO${d}`, 1500));

const seed = `begin;
insert into auth.users(id,email) values ('${owner}','np-owner@example.invalid'),('${manager}','np-manager@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='manager', is_active=true where id='${manager}';
insert into stock_position_cache(store_id, lot_code, brand, item_name, size, mrp, on_hand, last_sale, first_seen, sold_30) values
  (${GP}, 'A1', 'ALLEN SOLLY', 'SHIRT 1', 'XS', 2000, 10, '2026-07-01', '2026-04-01', 0),
  (${GP}, 'A2', 'ALLEN SOLLY', 'SHIRT 1', 'S', 2000, 0, '2026-07-01', '2026-04-01', 0),
  (${GP}, 'A3', 'ALLEN SOLLY', 'SHIRT 1', 'M', 2000, 0, '2026-07-01', '2026-04-01', 0),
  (${GP}, 'A4', 'ALLEN SOLLY', 'SHIRT 1', 'L', 2000, 0, '2026-07-01', '2026-04-01', 0),
  (${GP}, 'L1', 'LOTTO', 'SHOE 9', '8', 3000, 6, '2026-06-01', '2026-04-01', 0),
  (${GP}, 'N1', 'ACUBE', 'TEE 5', 'M', 900, 4, null, '2026-05-01', 0),
  (${GP}, 'F1', 'ACUBE', 'TEE NEW', 'M', 900, 4, null, '2026-09-30', 0),
  (${GP}, 'U1', 'UCB', 'TEE 100', 'M', 999, 1, '2026-10-05', '2026-04-01', 6),
  (${GP}, 'X1', 'MIX', 'PC001DFN001 (NIL)', '-', 5000, 600, null, '2026-04-01', 0),
  (${BM}, 'U9', 'UCB', 'TEE 100', 'M', 999, 3, '2026-09-01', '2026-04-01', 0);
insert into reports(id, store_id, report_type, report_date, status, row_count, is_current) values
  ('f3000000-0000-0000-0000-000000000001', ${GP}, 'sales', '${day}', 'processed', 1, true),
  ('f3000000-0000-0000-0000-000000000002', ${BM}, 'sales', '2026-10-05', 'processed', 1, true);
insert into sales_rows(report_id, store_id, sale_date, bill_no, item_name, brand, size, lot_code, quantity, net_sale, staff_name, line_kind, raw_data) values ${bills.join(",\n")},
  ('f3000000-0000-0000-0000-000000000002', ${BM}, '2026-10-02', 'B1', 'SHOE 9', 'LOTTO', '8', 'Z', 2, 6000, 'RIYA', 'item', '{}');
`;

test("night plan: idle stock with the reason, sizes running out, staff to praise / coach / check", () => {
  const plan = JSON.parse(last(sql(`${seed} select owner_night_plan_internal('${day}', 50); rollback;`)));
  const gp = plan.stores.find((s) => s.code === "GP");
  const bm = plan.stores.find((s) => s.code === "BM");
  assert.equal(gp.uploaded, true);
  assert.equal(bm.uploaded, false, "BM uploaded only up to the day before");
  const reasons = Object.fromEntries(gp.idle.map((row) => [row.item, row.reason]));
  assert.deepEqual(reasons, { "SHIRT 1": "broken_sizes", "SHOE 9": "move", "TEE 5": "never_sold" }, "new arrivals (TEE NEW) are not idle yet");
  assert.deepEqual(gp.idle.map((row) => row.item), ["SHOE 9", "SHIRT 1", "TEE 5"], "most actionable first: move, broken sizes, never sold");
  assert.deepEqual(gp.running_out.map((r) => [r.item, r.size, Number(r.other_on_hand), r.other_stores]), [["TEE 100", "M", 3, "BM"]]);
  const flags = Object.fromEntries(gp.staff.map((p) => [p.name, p.flags]));
  assert.ok(flags.SAMEER.includes("top"));
  assert.ok(flags.JASMIN.includes("low_bill"));
  assert.ok(flags.KASIM.includes("no_sale"));
});

test("night plan page: owners only; the message function is not callable by signed-in users", () => {
  assert.equal(JSON.parse(last(sql(`${seed} ${as(owner)} select owner_night_plan('${day}'); rollback;`))).stores.length >= 2, true);
  assert.throws(() => sql(`${seed} ${as(manager)} select owner_night_plan('${day}'); rollback;`), /Only the owner/);
  assert.throws(() => sql(`${seed} ${as(owner)} select owner_night_plan_internal('${day}', 5); rollback;`), /permission denied/);
});
