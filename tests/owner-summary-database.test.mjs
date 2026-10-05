import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const sql = (q) => execFileSync("psql", ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"], { input: q, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

// Go Planet, 16 Apr – 20 May 2099: 10 May missing, 12 May summary-only.
// RAHIM sells ₹10,000/day, then ₹2,000/day in the last 7 days; SHABAZ and
// SHABAZ S (an alias) sell on the 20th; a MUFTI return; Brand Mark has nothing.
const seed = `
create temp table d as select g::date as day from generate_series('2099-04-16'::date, '2099-05-20'::date, interval '1 day') g where g::date <> '2099-05-10';
insert into reports(id,store_id,report_type,report_date,status,row_count,is_current)
  select gen_random_uuid(), (select id from stores where code='GP'), 'sales', day, 'processed', 1, true from d;
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,brand,quantity,net_sale,staff_name,raw_data)
  select r.id, r.store_id, r.report_date, 'R'||r.report_date, 'Shirt', 'PEPE', 1, case when r.report_date >= '2099-05-14' then 2000 else 10000 end, 'RAHIM', '{}'::jsonb
  from reports r where r.report_type='sales' and r.report_date between '2099-04-16' and '2099-05-20' and r.report_date <> '2099-05-12'
  union all
  select r.id, r.store_id, r.report_date, 'N'||r.report_date, 'Socks', 'PEPE', 1, 500, 'NIL', '{}'::jsonb
  from reports r where r.report_type='sales' and r.report_date between '2099-04-16' and '2099-05-20' and r.report_date <> '2099-05-12';
insert into sales_rows(report_id,store_id,sale_date,brand,quantity,net_sale,raw_data)
  select id, store_id, report_date, null, 4, 9999, '{}'::jsonb from reports where report_type='sales' and report_date='2099-05-12';
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,brand,quantity,net_sale,staff_name,raw_data)
  select id, store_id, report_date, x.bill, x.item, x.brand, x.qty, x.net, x.staff, '{}'::jsonb
  from reports, (values ('X1','Polo','US POLO',1,3000,'SHABAZ'), ('X2','Polo','US POLO',1,4000,'  shabaz   s '), ('RET','Jeans','MUFTI',-1,-2500,'NIL')) x(bill,item,brand,qty,net,staff)
  where report_type='sales' and report_date='2099-05-20';
-- MRP on the 20th's lines (discount) and a closed cash book day.
update sales_rows set mrp = 2500 where sale_date = '2099-05-20' and bill_no = 'R2099-05-20';
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','summary-owner@example.invalid') on conflict do nothing;
insert into cash_book_days(store_id,book_date,opening_balance,sale_amount,closing_balance,counted_cash,status) values ((select id from stores where code='GP'),'2099-05-20',1000,7000,5700,5500,'closed');
insert into staff_targets(store_id,month,staff_name,target) values ((select id from stores where code='GP'),'2099-05-01','RAHIM',200000),((select id from stores where code='GP'),'2099-05-01','SHABAZ',100000);
-- "S" = shop counter: KUMAR S and KUMAR are one person.
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,brand,quantity,net_sale,staff_name,raw_data)
  select id, store_id, report_date, x.bill, 'Belt', 'PEPE', 1, x.net, x.staff, '{}'::jsonb
  from reports, (values ('K1', 600, 'KUMAR'), ('K2', 900, 'KUMAR S')) x(bill,net,staff)
  where report_type='sales' and report_date='2099-05-19';
insert into staff_name_aliases(store_id,canonical_staff_name,normalized_canonical_staff_name,source_name,normalized_source_name,source_type,is_active)
  values ((select id from stores where code='GP'),'SHABAZ','shabaz','SHABAZ S','shabaz s','sales_report',true);
`;

test("owner summary facts: merged staff, attention by week vs usual, returns, missing and summary-only days", () => {
  const out = sql(`begin;${seed}
select jsonb_pretty(owner_daily_summary_facts('2099-05-20'));
rollback;`);
  const facts = JSON.parse(out);
  const gp = facts.stores.find((s) => s.code === "GP");
  const bm = facts.stores.find((s) => s.code === "BM");
  assert.equal(facts.day, "2099-05-20");
  assert.equal(gp.status, "bill_level");
  assert.equal(Number(gp.sale), 7000);
  assert.equal(gp.bills, 5);
  assert.equal(Number(gp.last_week_sale), 10500);
  assert.equal(Number(gp.month_sale), 148999); // incl. the KUMAR lines of the 19th
  assert.equal(gp.missing_days, 1);
  assert.equal(gp.summary_days, 1);
  assert.equal(Number(gp.returns), 2500);
  assert.deepEqual(gp.return_brands, ["MUFTI"]);
  assert.deepEqual({ ...gp.top_staff, sale: Number(gp.top_staff.sale) }, { name: "SHABAZ", sale: 7000, bills: 2 });
  assert.deepEqual(gp.top_brands.map((b) => [b.name, Number(b.sale)]), [["US POLO", 7000], ["PEPE", 2500]]);
  assert.deepEqual({ ...gp.attention, recent_per_day: Number(gp.attention.recent_per_day), usual_per_day: Number(gp.attention.usual_per_day) },
    { name: "RAHIM", recent_per_day: 2000, usual_per_day: 10000 });
  // Detail: discount on lines with MRP (2,500 MRP sold for 2,000); cash book CB 5,700, counted 5,500.
  assert.equal(Number(gp.qty), 3); // 4 sold, 1 returned
  assert.equal(Number(gp.discount_pct), 20);
  // 20 May 2099 is a Wednesday (bank day) and no deposit was entered.
  assert.deepEqual({ ...gp.cash, book: Number(gp.cash.book), counted: Number(gp.cash.counted) },
    { status: "closed", book: 5700, counted: 5500, bank_day: true, deposit: false });
  assert.equal(gp.month_days, 20);
  assert.equal(Number(gp.last_month_same_days_sale), 52500);
  assert.equal(Number(gp.month_target), 300000);
  assert.deepEqual(gp.top_staffs.map((p) => [p.name, Number(p.sale)]), [["SHABAZ", 7000], ["RAHIM", 2000]]);
  const may19 = JSON.parse(sql(`begin;${seed} select owner_daily_summary_facts('2099-05-19')->'stores'; rollback;`)).find((s) => s.code === "GP");
  assert.deepEqual([may19.top_staff.name, Number(may19.top_staff.sale), may19.top_staff.bills], ["RAHIM", 2000, 1]);
  assert.deepEqual(may19.top_staffs.map((p) => [p.name, Number(p.sale)]), [["RAHIM", 2000], ["KUMAR", 1500]]);
  assert.equal(bm.status, "missing");
  assert.equal(bm.sale, null);
  assert.equal(bm.top_staff, null);
});

test("owner summary facts are only for the server: signed-in users and anonymous cannot call them", () => {
  assert.equal(sql("select has_function_privilege('authenticated','public.owner_daily_summary_facts(date)','EXECUTE');"), "f");
  assert.equal(sql("select has_function_privilege('anon','public.owner_daily_summary_facts(date)','EXECUTE');"), "f");
});

test("owner summary deliveries are a separate kind (allowed, distinct from customer messages)", () => {
  assert.match(sql("select pg_get_constraintdef(oid) from pg_constraint where conname='whatsapp_deliveries_kind_check';"), /owner_summary/);
});
