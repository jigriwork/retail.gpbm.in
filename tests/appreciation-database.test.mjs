import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const fails = (q, pattern) => assert.throws(() => sql(q), pattern);
const owner = "00000000-0000-0000-0000-0000000000d1";
const staff = "00000000-0000-0000-0000-0000000000d2";
const bmManager = "00000000-0000-0000-0000-0000000000d3";
sql(`insert into auth.users(id,email) values ('${owner}','ap-owner@example.invalid'),('${staff}','ap-staff@example.invalid'),('${bmManager}','ap-bm@example.invalid') on conflict do nothing;
update profiles set role='owner', is_active=true where id='${owner}';
update profiles set role='staff', is_active=true where id='${staff}';
update profiles set role='manager', is_active=true where id='${bmManager}';
insert into store_users(user_id, store_id) select '${bmManager}', id from stores where code='BM' and not exists (select 1 from store_users where user_id='${bmManager}');`);
const GP = `'${sql("select id from stores where code='GP';")}'::uuid`;
const as = (id) => `set local request.jwt.claim.sub='${id}'; set local role authenticated;`;

// Last 7 days at Go Planet: RAHIM (+ "RAHIM S" = same person) top seller;
// SHABAZ fewer bills but bigger bills; KUMAR many items per bill; NIL ignored.
const seed = `begin;
set local request.jwt.claim.sub='${owner}';
insert into employee_contacts(store_id, staff_name, normalized_staff_name, is_active) values (${GP}, 'SHABAZ', 'shabaz', true) returning id as emp \\gset
insert into staff_name_aliases(store_id, canonical_staff_name, normalized_canonical_staff_name, source_name, normalized_source_name, source_type, is_active, employee_contact_id, verification_status)
  values (${GP}, 'SHABAZ', 'shabaz', 'SHABAZ', 'shabaz', 'sales_report', true, :'emp', 'verified');
insert into employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by) values (:'emp', '${staff}', ${GP}, 'ap-staff@example.invalid', '${owner}');
create temp table d as select (india_today() - g)::date as day from generate_series(1, 7) g;
insert into reports(id, store_id, report_type, report_date, status, row_count, is_current) select gen_random_uuid(), ${GP}, 'sales', day, 'processed', 1, true from d;
insert into sales_rows(report_id, store_id, sale_date, bill_no, item_name, quantity, net_sale, staff_name, raw_data)
  select r.id, r.store_id, r.report_date, x.bill || r.report_date, 'Item', x.qty, x.net, x.staff, '{}'::jsonb
  from reports r, (values ('A', 1, 3000, 'RAHIM'), ('B', 1, 2000, 'RAHIM S'), ('C', 1, 4000, 'SHABAZ'), ('D', 4, 1200, 'KUMAR'), ('E', 1, 900, 'NIL')) x(bill, qty, net, staff)
  where r.store_id = ${GP} and r.report_type = 'sales' and r.report_date in (select day from d);
reset request.jwt.claim.sub;
`;

test("Star of the week: merged names, top 3 with amounts for owner, per-bill awards need 5+ bills", () => {
  const stars = JSON.parse(sql(`${seed} ${as(owner)} select store_week_stars(${GP}); rollback;`).split("\n").filter(Boolean).at(-1));
  assert.deepEqual(stars.top.map((p) => [p.name, Number(p.sale), p.bills]), [["RAHIM", 35000, 14], ["SHABAZ", 28000, 7], ["KUMAR", 8400, 7]]);
  assert.deepEqual([stars.best_bill.name, Number(stars.best_bill.value)], ["SHABAZ", 4000]);
  assert.deepEqual([stars.most_items.name, Number(stars.most_items.value)], ["KUMAR", 4]);
  assert.equal(stars.staff_count, 3, "NIL is not a person");
});

test("staff: own week and rank; others by name only; managers of other stores and staff are refused store stars", () => {
  const mine = JSON.parse(sql(`${seed} ${as(staff)} select my_week_highlights(); rollback;`).split("\n").filter(Boolean).at(-1));
  assert.deepEqual([mine.linked, Number(mine.sale), mine.bills, mine.rank, mine.of], [true, 28000, 7, 2, 3]);
  assert.deepEqual(mine.stars.top.map((p) => [p.name, p.sale, p.bills]), [["RAHIM", null, null], ["SHABAZ", null, null], ["KUMAR", null, null]]);
  assert.equal(mine.stars.best_bill.value, null, "no amounts of other people for staff");
  fails(`${seed} ${as(staff)} select store_week_stars(${GP}); rollback;`, /Store access denied/);
  fails(`${seed} ${as(bmManager)} select store_week_stars(${GP}); rollback;`, /Store access denied/);
  fails(`begin; ${as(owner)} select my_week_highlights(); rollback;`, /Staff access denied/);
  assert.equal(sql("select has_function_privilege('authenticated','public.staff_sales_window(uuid,date,date)','EXECUTE') or has_function_privilege('anon','public.store_week_stars(uuid)','EXECUTE');"), "f");
});
