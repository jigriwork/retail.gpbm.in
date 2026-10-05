import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const last = (out) => out.split("\n").filter(Boolean).at(-1);
const owner = "00000000-0000-0000-0000-0000000000a7";
const cashier = "00000000-0000-0000-0000-0000000000a8";
const staffUser = "00000000-0000-0000-0000-0000000000a9";
sql(`insert into auth.users(id,email) values ('${owner}','sm-owner@example.invalid'),('${cashier}','sm-cashier@example.invalid'),('${staffUser}','sm-staff@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='cashier', is_active=true where id='${cashier}';
update profiles set role='staff', is_active=true where id='${staffUser}';
insert into store_users(user_id, store_id) select '${cashier}', id from stores where code='GP' and not exists (select 1 from store_users where user_id='${cashier}');`);
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const BM = `'${sql("select id from stores where code='BM';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;

test("name keys: counter suffixes and spelling", () => {
  assert.equal(sql("select staff_name_core('praful  sahu s') || '|' || staff_name_core('RAHIM1') || '|' || staff_name_core('S K CHANDA');"), "PRAFUL SAHU|RAHIM|S K CHANDA");
  assert.equal(sql("select staff_name_skeleton('JASMIN BAGUM') = staff_name_skeleton('Jasmin Begum');"), "t");
});

const seed = `begin;
insert into employee_contacts(store_id, staff_name, normalized_staff_name, is_active) values
  (${GP}, 'MD RAHIM', 'md rahim', true), (${GP}, 'SHABAZ', 'shabaz', true), (${GP}, 'JASMIN BEGUM', 'jasmin begum', true),
  (${GP}, 'PRAFUL SAHU', 'praful sahu', true), (${BM}, 'SAMEER', 'sameer', true);
insert into reports(id, store_id, report_type, report_date, status, row_count, is_current) values ('f0000000-0000-0000-0000-0000000000e7', ${GP}, 'sales', india_today() - 1, 'processed', 1, true);
insert into sales_rows(report_id, store_id, sale_date, bill_no, item_name, quantity, net_sale, staff_name, raw_data)
  select 'f0000000-0000-0000-0000-0000000000e7', ${GP}, india_today() - 1, 'B' || n, 'Item', 1, 100, n, '{}'::jsonb
  from unnest(array['SHABAZ1', 'PRAFUL SAHU S', 'RAHIM', 'JASMIN BAGUM', 'SAMEER', 'SHOP GP', 'NIL']) n;
`;

test("matching: certain, likely and unmatched; a cashier can auto-match and confirm for their store", () => {
  const overview = JSON.parse(last(sql(`${seed} ${as(cashier)} select staff_match_overview(${GP}); rollback;`)));
  assert.deepEqual(overview.certain.map((c) => [c.name, c.staff]).sort(), [["PRAFUL SAHU S", "PRAFUL SAHU"], ["SHABAZ1", "SHABAZ"]]);
  assert.deepEqual(overview.likely.map((l) => [l.name, l.candidates[0].name, l.candidates[0].reason]).sort(),
    [["JASMIN BAGUM", "JASMIN BEGUM", "spelling differs"], ["RAHIM", "MD RAHIM", "short / long form"]]);
  assert.deepEqual(overview.unmatched.map((u) => u.name).sort(), ["SAMEER", "SHOP GP"], "a GP cashier cannot see BM's Sameer; NIL ignored");
  const owners = JSON.parse(last(sql(`${seed} ${as(owner)} select staff_match_overview(${GP}); rollback;`)));
  assert.ok(owners.likely.some((l) => l.name === "SAMEER" && l.candidates[0].reason === "same name, other store"), "the owner sees the other-store match");

  const after = last(sql(`${seed} ${as(cashier)} select auto_link_staff_names(${GP});
select link_staff_name(${GP}, 'RAHIM', (select id from employee_contacts where staff_name='MD RAHIM'));
select (staff_match_overview(${GP})->>'linked') || '|' || jsonb_array_length(staff_match_overview(${GP})->'certain'); rollback;`));
  assert.equal(after, "3|0");
  assert.equal(last(sql(`${seed} ${as(cashier)} select auto_link_staff_names(${GP}); reset role;
select count(*) from staff_name_aliases where store_id=${GP} and verification_status='verified' and employee_contact_id is not null and normalized_source_name in ('shabaz1','praful sahu s'); rollback;`)), "2");
  assert.throws(() => sql(`${seed} ${as(cashier)} select link_staff_name(${BM}, 'SAMEER', (select id from employee_contacts where staff_name='SAMEER')); rollback;`), /Store access denied/);
});

test("background auto-match needs no signed-in person", () => {
  assert.equal(last(sql(`${seed} select auto_link_all_staff_names(); rollback;`)), "2");
});

test("check sizes: every size of the scanned item; a cashier and staff see their own store, the owner both", () => {
  const sizesSeed = `begin;
insert into stock_position_cache(store_id, lot_code, brand, item_name, size, mrp, on_hand) values
  (${GP}, 'Z1', 'UCB', 'TEE 100', 'S', 1299, 1), (${GP}, 'Z2', 'UCB', 'TEE 100', 'M', 1299, 0), (${GP}, 'Z3', 'UCB', 'TEE 100', 'L', 1299, 2),
  (${BM}, 'Y3', 'UCB', 'TEE 100', 'L', 1299, 1), (${GP}, 'Z9', 'UCB', 'OTHER', 'M', 999, 5);
insert into reports(id, store_id, report_type, report_date, period_month, status, row_count, is_current) values ('f0000000-0000-0000-0000-0000000000e8', ${GP}, 'stock', '2099-01-02', '2099-01-01', 'processed', 1, true);
insert into stock_rows(report_id, store_id, stock_month, item_name, barcode, quantity, raw_data) values ('f0000000-0000-0000-0000-0000000000e8', ${GP}, '2099-01-01', 'TEE 100', '8909329430968', 0, '{"LOT CODE":"Z2"}'::jsonb);
insert into employee_contacts(id, store_id, staff_name, normalized_staff_name, is_active) values ('f0000000-0000-0000-0000-0000000000e9', ${GP}, 'TEST STAFF', 'test staff', true);
insert into employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by) values ('f0000000-0000-0000-0000-0000000000e9', '${staffUser}', ${GP}, 'sm-staff@example.invalid', '${owner}');
`;
  const view = (who) => JSON.parse(last(sql(`${sizesSeed} ${as(who)} select stock_sizes('8909329430968'); rollback;`)));
  const asCashier = view(cashier);
  assert.equal(asCashier.length, 1);
  assert.deepEqual([asCashier[0].item, asCashier[0].scanned_size], ["TEE 100", "M"]);
  assert.deepEqual(asCashier[0].stores.map((s) => [s.store, s.sizes.map((z) => `${z.size}:${z.on_hand}`).join(",")]), [["Go Planet", "L:2,M:0,S:1"]]);
  assert.deepEqual(view(staffUser)[0].stores.map((s) => s.store), ["Go Planet"]);
  assert.deepEqual(view(owner)[0].stores.map((s) => s.store), ["Brand Mark", "Go Planet"]);
  // A Logic tag printing the ITEM CODE (stock "sku") finds the item too.
  const byItemCode = JSON.parse(last(sql(`${sizesSeed} update stock_rows set sku = 'Q12445' where report_id = 'f0000000-0000-0000-0000-0000000000e8'; ${as(cashier)} select stock_sizes('q12445'); rollback;`)));
  assert.deepEqual([byItemCode[0]?.item, byItemCode[0]?.scanned_size], ["TEE 100", "M"]);
  assert.equal(sql("select has_function_privilege('anon','public.stock_sizes(text)','EXECUTE') or has_function_privilege('authenticated','public.auto_link_all_staff_names()','EXECUTE');"), "f");
});
