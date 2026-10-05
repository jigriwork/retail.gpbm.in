import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const owner = "00000000-0000-0000-0000-0000000000e1";
const cashier = "00000000-0000-0000-0000-0000000000e2";
const bmManager = "00000000-0000-0000-0000-0000000000e3";
sql(`insert into auth.users(id,email) values ('${owner}','bs-owner@example.invalid'),('${cashier}','bs-cashier@example.invalid'),('${bmManager}','bs-bm@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='cashier', is_active=true where id='${cashier}';
update profiles set role='manager', is_active=true where id='${bmManager}';
insert into store_users(user_id, store_id) select '${cashier}', id from stores where code='GP' and not exists (select 1 from store_users where user_id='${cashier}');
insert into store_users(user_id, store_id) select '${bmManager}', id from stores where code='BM' and not exists (select 1 from store_users where user_id='${bmManager}');`);
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;
const seed = `begin;
insert into reports(id, store_id, report_type, report_date, period_month, status, row_count, is_current) values ('f0000000-0000-0000-0000-0000000000f1', ${GP}, 'stock', '2099-01-02', '2099-01-01', 'processed', 1, true);
insert into stock_rows(report_id, store_id, stock_month, item_name, barcode, quantity, mrp, raw_data)
  values ('f0000000-0000-0000-0000-0000000000f1', ${GP}, '2099-01-01', 'PEPE SHIRT', '8901234567890', 3, 2999, '{"LOT CODE":"747575","ADDITIONAL ITEM CODE":"PM3091698"}'::jsonb);
insert into stock_position_cache(store_id, lot_code, brand, item_name, size, mrp, on_hand, last_sale, sold_30) values (${GP}, '747575', 'PEPE', 'PEPE SHIRT', 'L', 2999, 3, '2099-01-05', 2);
insert into stock_counts(id, store_id, title, status, created_by) values ('f0000000-0000-0000-0000-0000000000c1', ${GP}, 'Pepe count', 'counting', '${owner}');
insert into stock_count_lines(id, count_id, lot_code, item_name, size, expected_qty) values ('f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000c1', '747575', 'PEPE SHIRT', 'L', 3);
`;

test("a count line can be scanned by its lot code, the EAN barcode or the article code", () => {
  const codes = JSON.parse(sql(`${seed} ${as(cashier)} select stock_count_codes('f0000000-0000-0000-0000-0000000000c1'); rollback;`).split("\n").filter(Boolean).at(-1));
  assert.deepEqual(codes, [{ line: "f0000000-0000-0000-0000-0000000000a1", codes: ["747575", "8901234567890", "PM3091698"] }]);
  assert.equal(sql(`${seed} ${as(bmManager)} select stock_count_codes('f0000000-0000-0000-0000-0000000000c1'); rollback;`).split("\n").filter(Boolean).at(-1), "[]", "another store's manager gets nothing");
});

test("item lookup by barcode for the owner; cashier refused; other store's manager sees nothing", () => {
  const found = JSON.parse(sql(`${seed} ${as(owner)} select stock_lookup(' 8901234567890 '); rollback;`).split("\n").filter(Boolean).at(-1));
  assert.deepEqual(found.map((item) => [item.store, item.item, item.size, Number(item.on_hand), Number(item.sold_30)]), [["Go Planet", "PEPE SHIRT", "L", 3, 2]]);
  assert.equal(JSON.parse(sql(`${seed} ${as(owner)} select stock_lookup('pm3091698'); rollback;`).split("\n").filter(Boolean).at(-1)).length, 1, "article code, any case");
  assert.throws(() => sql(`${seed} ${as(cashier)} select stock_lookup('8901234567890'); rollback;`), /for the owner and managers/);
  assert.equal(sql(`${seed} ${as(bmManager)} select stock_lookup('8901234567890'); rollback;`).split("\n").filter(Boolean).at(-1), "[]");
  assert.equal(sql("select has_function_privilege('anon','public.stock_lookup(text)','EXECUTE');"), "f");
});
