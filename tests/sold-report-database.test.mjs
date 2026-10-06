import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const owner = "00000000-0000-0000-0000-000000000061";
const manager = "00000000-0000-0000-0000-000000000062";
const cashier = "00000000-0000-0000-0000-000000000063";
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;

const seed = `begin;
insert into auth.users(id,email) values ('${owner}','sr-owner@example.invalid'),('${manager}','sr-manager@example.invalid'),('${cashier}','sr-cashier@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='manager', is_active=true where id='${manager}';
update profiles set role='cashier', is_active=true where id='${cashier}';
insert into store_users(user_id, store_id) select u, ${GP} from unnest(array['${manager}','${cashier}']::uuid[]) u;
insert into stock_position_cache(store_id, lot_code, brand, item_name, size, mrp, on_hand, last_sale) values
  (${GP}, 'L1', 'UCB', 'TEE 100', 'S', 999, 2, '2026-09-20'), (${GP}, 'L2', 'UCB', 'TEE 100', 'M', 999, 0, '2026-09-21'),
  (${GP}, 'L3', 'UCB', 'POLO 7', 'L', 1499, 5, '2026-06-01'), (${GP}, 'L4', 'LOTTO', 'SHOE 9', '8', 2999, 1, null);
insert into reports(id, store_id, report_type, report_date, status, row_count, is_current) values ('f2000000-0000-0000-0000-000000000001', ${GP}, 'sales', '2026-09-21', 'processed', 3, true);
insert into sales_rows(report_id, store_id, sale_date, bill_no, item_name, brand, size, lot_code, quantity, net_sale, line_kind, raw_data) values
  ('f2000000-0000-0000-0000-000000000001', ${GP}, '2026-09-20', 'B1', 'TEE 100', 'ucb', 's', 'L1', 1, 899, 'item', '{}'),
  ('f2000000-0000-0000-0000-000000000001', ${GP}, '2026-09-21', 'B2', 'TEE 100', 'UCB', 'M', 'L2', 2, 1798, 'item', '{}'),
  ('f2000000-0000-0000-0000-000000000001', ${GP}, '2026-08-01', 'B0', 'POLO 7', 'UCB', 'L', 'L3', 1, 1299, 'item', '{}'),
  ('f2000000-0000-0000-0000-000000000001', ${GP}, '2026-09-21', null, null, null, null, null, 3, 2697, 'summary', '{}');
`;

test("what sold and what did not, for any period, by brand then item and size", () => {
  const all = JSON.parse(last(sql(`${seed} ${as(manager)} select sold_report(${GP}, '2026-09-01', '2026-09-30'); rollback;`)));
  assert.deepEqual([all.summary.sold, all.summary.net, all.summary.bills, all.summary.items], [3, 2697, 2, 1], "summary lines are not counted");
  const ucb = all.brands.find((b) => b.brand === "UCB");
  assert.deepEqual([ucb.sold, ucb.on_hand, ucb.unsold_items, ucb.unsold_pcs], [3, 7, 1, 5]);
  assert.equal(all.top[0].item, "TEE 100");

  const brand = JSON.parse(last(sql(`${seed} ${as(owner)} select sold_report(${GP}, '2026-09-01', '2026-09-30', 'ucb'); rollback;`)));
  assert.equal(brand.items.length, 1);
  assert.deepEqual(brand.items[0].sizes_sold.map((s) => `${s.size}:${s.qty}`).sort(), ["M:2", "S:1"]);
  assert.deepEqual(brand.items[0].sizes_left.map((s) => `${s.size}:${s.qty}`), ["S:2"]);
  assert.deepEqual(brand.unsold.map((u) => [u.item, u.on_hand, u.last_sale]), [["POLO 7", 5, "2026-06-01"]], "sold in August, not in September");

  const august = JSON.parse(last(sql(`${seed} ${as(owner)} select sold_report(${GP}, '2026-08-01', '2026-08-31', 'UCB'); rollback;`)));
  assert.deepEqual(august.items.map((i) => i.item), ["POLO 7"]);
  assert.throws(() => sql(`${seed} ${as(cashier)} select sold_report(${GP}, '2026-09-01', '2026-09-30'); rollback;`), /Store access denied/);
  assert.throws(() => sql(`${seed} ${as(owner)} select sold_report(${GP}, '2025-01-01', '2026-09-30'); rollback;`), /up to 400 days/);
});

test("staff-name page totals: one row per sales name, only for the viewer's stores", () => {
  const BM = `'${sql("select id from stores where code='BM';")}'::uuid`;
  const named = `${seed} update sales_rows set staff_name = case when bill_no = 'B1' then ' RAHIM ' else 'SHABAZ1' end where report_id = 'f2000000-0000-0000-0000-000000000001';`;
  const rows = sql(`${named} ${as(manager)} select staff_name || ':' || row_count from staff_name_totals(array[${GP}]) order by 1; rollback;`).split("\n");
  assert.deepEqual(rows, ["RAHIM:1", "SHABAZ1:3"]);
  assert.equal(sql(`${named} ${as(manager)} select count(*) from staff_name_totals(array[${GP}, ${BM}]); rollback;`), "0", "a store the manager does not run gives nothing");
});
