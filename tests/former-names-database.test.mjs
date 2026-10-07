import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const cashier = "00000000-0000-0000-0000-0000000000d1";
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;

const seed = `begin;
insert into auth.users(id,email) values ('${cashier}','fn-cashier@example.invalid') on conflict do nothing;
update profiles set role='cashier', is_active=true where id='${cashier}';
insert into store_users(user_id, store_id) values ('${cashier}', ${GP});
insert into reports(id, store_id, report_type, report_date, status, row_count, is_current) values ('f7000000-0000-0000-0000-000000000001', ${GP}, 'sales', india_today(), 'processed', 1, true);
insert into sales_rows(report_id, store_id, sale_date, bill_no, item_name, quantity, net_sale, staff_name, raw_data) values
  ('f7000000-0000-0000-0000-000000000001', ${GP}, india_today() - 2, 'B1', 'Item', 1, 100, 'DUNA', '{}'),
  ('f7000000-0000-0000-0000-000000000001', ${GP}, india_today() - 100, 'B2', 'Item', 1, 100, 'OLD GUY', '{}'),
  ('f7000000-0000-0000-0000-000000000001', ${GP}, india_today() - 1, 'B3', 'Item', 1, 100, 'NEW PERSON', '{}');
insert into staff_name_aliases(store_id, canonical_staff_name, normalized_canonical_staff_name, source_name, normalized_source_name, source_type, is_active, verification_status)
  values (${GP}, 'Duna', 'duna', 'DUNA', 'duna', 'sales_report', false, 'rejected');
`;
const unmatched = (extra = "") => JSON.parse(last(sql(`${seed} ${extra} ${as(cashier)} select coalesce(jsonb_agg(u->>'name'), '[]') from jsonb_array_elements(staff_match_overview(${GP})->'unmatched') u; rollback;`)));

test("former staff and names with no sale for 90 days are not listed; 'left / not staff' hides a name", () => {
  assert.deepEqual(unmatched(), ["NEW PERSON"]);
  assert.deepEqual(unmatched(`${as(cashier)} select mark_sales_name_left(${GP}, 'new person'); reset role;`), []);
});
