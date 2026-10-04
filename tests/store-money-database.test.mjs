import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database (scripts/test-accounts-local.mjs). Never reads
// DATABASE_URL or .env.local, so it cannot reach production.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(text) {
  return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const check = (condition, message) => `select pg_temp.assert_test((${condition}),${quote(message)});`;
const value = text => sql(text).split("\n").at(-1);

const owner = "b0000000-0000-0000-0000-000000000001";
const gpManager = "b0000000-0000-0000-0000-000000000003";
const bmManager = "b0000000-0000-0000-0000-000000000004";
const accountant = "b0000000-0000-0000-0000-000000000002";
const people = [[owner, "owner"], [accountant, "accountant"], [gpManager, "manager"], [bmManager, "manager"]];
const gp = value("select id from stores where code='GP'");
const bm = value("select id from stores where code='BM'");
sql(`insert into auth.users(id,email) values ${people.map(([id], i) => `(${quote(id)},'money-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=v.role,is_active=true from (values ${people.map(([id, role]) => `(${quote(id)}::uuid,${quote(role)})`).join(",")}) v(id,role) where profiles.id=v.id;
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}),(${quote(bm)},${quote(bmManager)}) on conflict do nothing;`);

const today = value("select india_today()");
const day = offset => `(${quote(today)}::date - ${offset})`;
// A GP sales report for a day: two bills worth ₹10,000 in all.
const salesDay = (offset) => `reset role;
insert into reports(store_id,report_type,report_date,status,row_count,is_current) values(${quote(gp)},'sales',${day(offset)},'processed',2,true) returning id as rep \\gset
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values
 (:'rep',${quote(gp)},${day(offset)},'GP-1','Shirt',1,6000,'{}'),(:'rep',${quote(gp)},${day(offset)},'GP-2','Jeans',1,4000,'{}');`;

test("blind day close: expected cash and difference, opening carried forward, locked until the owner reopens", () => {
  sql(`begin; ${salesDay(2)}
  ${as(gpManager)}
  insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(2)},'tea_snacks',300,'cash');
  insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(2)},'transport',1000,'cash') returning id as wrong \\gset
  ${as(owner)} update store_expenses set status='rejected', reject_reason='Not a store expense' where id=:'wrong';
  ${as(gpManager)}
  select submit_day_close(${quote(gp)},${day(2)},2000,5600,4000,2000,0,null,5000,null) as c1 \\gset
  ${check(`(select difference from day_close_overview(${quote(gp)},${day(10)},${day(0)}) where id=:'c1')=-100`, "Expected 2000+(10000-6000)-300 = 5700; counted 5600 → short 100")}
  ${check(`(select expected_cash from day_close_overview(${quote(gp)},${day(10)},${day(0)}) where id=:'c1')=5700`, "Rejected cash expense must not reduce expected cash")}
  select submit_day_close(${quote(gp)},${day(1)},99999,800,0,0,0,null,0,null) as c2 \\gset
  ${check(`(select opening_cash from store_day_closes where id=:'c2')=600`, "Opening cash is yesterday's 5600 - 5000 deposited, not what was typed")}
  ${check(`(select difference is null and not sales_report_uploaded from day_close_overview(${quote(gp)},${day(10)},${day(0)}) where id=:'c2')`, "No sales report yet → no difference")}
  rollback;`);
  assert.throws(() => sql(`begin; ${salesDay(2)} ${as(gpManager)}
    select submit_day_close(${quote(gp)},${day(2)},2000,5600,4000,2000,0,null,5000,null);
    select submit_day_close(${quote(gp)},${day(2)},2000,5700,4000,2000,0,null,5000,null); rollback;`), /already closed/);
  sql(`begin; ${salesDay(2)} ${as(gpManager)}
  select submit_day_close(${quote(gp)},${day(2)},2000,5600,4000,2000,0,null,5000,null) as c1 \\gset
  ${as(owner)} select review_day_close(:'c1','reopen','UPI total was wrong');
  ${as(gpManager)} select submit_day_close(${quote(gp)},${day(2)},2000,6300,3700,2000,0,null,5000,null);
  ${check(`(select difference from day_close_overview(${quote(gp)},${day(10)},${day(0)}) where id=:'c1')=0`, "Corrected close balances: 2000 + (10000 - 3700 - 2000) = 6300")}
  ${as(owner)} select review_day_close(:'c1','review','ok');
  ${check(`(select status from store_day_closes where id=:'c1')='reviewed'`, "Owner marks checked")}
  rollback;`);
});

test("day close permissions: own store only, no future, managers 3 days back, accountant sees nothing", () => {
  assert.throws(() => sql(`begin; ${as(gpManager)} select submit_day_close(${quote(bm)},${day(1)},0,100,0,0,0,null,0,null); rollback;`), /cannot close this store/);
  assert.throws(() => sql(`begin; ${as(gpManager)} select submit_day_close(${quote(gp)},${day(-1)},0,100,0,0,0,null,0,null); rollback;`), /today or an earlier date/);
  assert.throws(() => sql(`begin; ${as(gpManager)} select submit_day_close(${quote(gp)},${day(5)},0,100,0,0,0,null,0,null); rollback;`), /only be entered by the owner/);
  assert.throws(() => sql(`begin; ${as(gpManager)} select submit_day_close(${quote(gp)},${day(1)},0,100,0,0,50,null,0,null); rollback;`), /what the "other" payments were/);
  assert.throws(() => sql(`begin; ${as(gpManager)} select submit_day_close(${quote(gp)},${day(1)},0,100,0,0,0,null,200,null); rollback;`), /deposited cannot be more/);
  assert.throws(() => sql(`begin; ${as(gpManager)} select submit_day_close(${quote(gp)},${day(1)},0,100,0,0,0,null,0,null) as c \\gset
    select review_day_close(:'c','review',null); rollback;`), /Only the owner/);
  sql(`begin; ${as(owner)} select submit_day_close(${quote(gp)},${day(5)},1000,1000,0,0,0,null,0,null);
  ${as(gpManager)} select submit_day_close(${quote(gp)},${day(1)},0,1000,0,0,0,null,0,null);
  ${check(`(select count(*) from missing_day_closes(${quote(gp)},14))=3`, "Days 4, 3 and 2 are missing after the first close")}
  ${as(accountant)}
  ${check(`(select count(*) from store_day_closes)=0 and (select count(*) from day_close_overview(${quote(gp)},${day(10)},${day(0)}))=0`, "Accountant sees no closes")}
  ${as(bmManager)}
  ${check(`(select count(*) from store_day_closes)=0`, "Another store's manager sees no closes")}
  rollback;`);
});

test("expenses: own store, last 7 days, as yourself; only the owner checks or rejects", () => {
  for (const statement of [
    `insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(8)},'tea_snacks',50,'cash')`,
    `insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(-1)},'tea_snacks',50,'cash')`,
    `insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(bm)},${day(1)},'tea_snacks',50,'cash')`,
    `insert into store_expenses(store_id,expense_date,category,amount,paid_from,created_by) values(${quote(gp)},${day(1)},'tea_snacks',50,'cash',${quote(owner)})`,
    `insert into store_expenses(store_id,expense_date,category,amount,paid_from,status) values(${quote(gp)},${day(1)},'tea_snacks',50,'cash','checked')`,
  ]) assert.throws(() => sql(`begin; ${as(gpManager)} ${statement}; rollback;`), /row-level security/);
  sql(`begin; ${as(gpManager)}
  insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(1)},'repairs',450,'cash') returning id as e \\gset
  update store_expenses set status='checked' where id=:'e';
  ${check(`(select status from store_expenses where id=:'e')='recorded'`, "Manager cannot mark checked")}
  ${as(owner)} update store_expenses set status='checked', checked_by=${quote(owner)}, checked_at=now() where id=:'e';
  ${as(gpManager)} delete from store_expenses where id=:'e';
  ${check(`(select count(*) from store_expenses where id=:'e')=1`, "A checked expense cannot be removed by the manager")}
  insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(1)},'other',20,'cash') returning id as f \\gset
  delete from store_expenses where id=:'f';
  ${check(`(select count(*) from store_expenses where id=:'f')=0`, "Manager can remove their own unchecked entry")}
  ${as(accountant)} ${check(`(select count(*) from store_expenses)=0`, "Accountant sees no expenses")}
  rollback;`);
});

test("monthly profit: sales without GST, known/estimated cost, latest payslip upload, expenses and fixed costs", () => {
  const out = sql(`begin; reset role;
  update stores set estimated_margin_pct=40 where id=${quote(gp)};
  insert into reports(store_id,report_type,report_date,status,row_count,is_current) values(${quote(gp)},'sales','2026-08-10','processed',3,true) returning id as rep \\gset
  insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values
   (:'rep',${quote(gp)},'2026-08-10','GP-1','Shirt',2,2100,'{"TAXABLE AMOUNT":"2000","LOT CODE":"L1"}'),
   (:'rep',${quote(gp)},'2026-08-10','GP-2','Jacket',1,3540,'{"TAXABLE AMOUNT":"3000","LOT CODE":"L9"}'),
   (:'rep',${quote(gp)},'2026-08-10','GP-3','Shirt',1,1050,'{"LOT CODE":"L1"}');
  insert into reports(store_id,report_type,report_date,period_month,status,row_count,is_current) values(${quote(gp)},'stock','2026-08-01','2026-08-01','processed',1,true) returning id as st \\gset
  insert into stock_rows(report_id,store_id,stock_month,item_name,quantity,raw_data) values(:'st',${quote(gp)},'2026-08-01','Shirt',5,'{"LOT CODE":"L1","BASIC RATE":"600","PURCHASE RATE":"630"}');
  insert into payslip_batches(salary_month,source_file_name,created_at) values('2026-08-01','old.xlsx',now()-interval '2 days') returning id as old \\gset
  insert into payslip_rows(batch_id,store_id,firm_name,store_name,salary_month,staff_name,salary_amount) values(:'old',${quote(gp)},'Go Planet','Go Planet','2026-08-01','A',99999);
  insert into payslip_batches(salary_month,source_file_name) values('2026-08-01','aug salary.xlsx') returning id as b \\gset
  insert into payslip_rows(batch_id,store_id,firm_name,store_name,salary_month,staff_name,salary_amount,abs_amount,sunday_pay_amount,commission,advance) values
   (:'b',${quote(gp)},'Go Planet','Go Planet','2026-08-01','A',10000,1000,500,200,2000),
   (:'b',${quote(bm)},'Go Planet','Brand Mark','2026-08-01','B',8000,0,0,0,0);
  insert into store_expenses(store_id,expense_date,category,amount,paid_from,created_by) values
   (${quote(gp)},'2026-08-05','tea_snacks',300,'cash',${quote(owner)}),(${quote(gp)},'2026-08-06','repairs',500,'cash',${quote(owner)});
  update store_expenses set status='rejected' where category='repairs' and store_id=${quote(gp)} and expense_date='2026-08-06';
  insert into store_monthly_costs(store_id,name,amount,valid_from) values(${quote(gp)},'Rent',5000,'2026-01-01'),(${quote(gp)},'Old rent',4000,'2025-01-01');
  update store_monthly_costs set valid_to='2025-12-01' where name='Old rent';
  ${as(owner)}
  select p->>'sales_incl_gst', p->>'net_sales', p->>'gst', p->>'cost_known', p->>'cost_unknown_sales', p->>'cost_estimated', p->>'gross_profit',
         p->>'salaries', p->>'salary_file', p->>'expenses_total', p->>'fixed_total', p->>'net_profit', p->>'sales_days'
  from (select store_profit(${quote(gp)},'2026-08-15') p) x;
  rollback;`);
  assert.equal(out, "6690.00|6000.00|690.00|1800.00|3000.00|1800.00|2400.00|9700.00|aug salary.xlsx|300.00|5000.00|-12600.00|1");
  assert.throws(() => sql(`begin; ${as(gpManager)} select store_profit(${quote(gp)},'2026-08-01'); rollback;`), /Only the owner/);
  assert.equal(sql("select has_function_privilege('anon','public.store_profit(uuid,date)','EXECUTE');"), "f");
});
