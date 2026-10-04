import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database (scripts/test-accounts-local.mjs); never production.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = text => execFileSync("psql", args, { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const lines = text => text.split("\n").filter(Boolean);
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const owner = "a1000000-0000-0000-0000-000000000001";
const gpManager = "a1000000-0000-0000-0000-000000000003";
const cashier = "a1000000-0000-0000-0000-000000000007";
const people = [[owner, "owner"], [gpManager, "manager"], [cashier, "cashier"]];
const gp = sql("select id from stores where code='GP'");
const bm = sql("select id from stores where code='BM'");
sql(`insert into auth.users(id,email) values ${people.map(([id], i) => `(${quote(id)},'cashier-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=v.role,is_active=true from (values ${people.map(([id, role]) => `(${quote(id)}::uuid,${quote(role)})`).join(",")}) v(id,role) where profiles.id=v.id;
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}),(${quote(gp)},${quote(cashier)}) on conflict do nothing;`);
const today = sql("select india_today()");
const day = offset => `(${quote(today)}::date - ${offset})`;
const sales = `reset role;
insert into reports(store_id,report_type,report_date,status,row_count,is_current) values(${quote(gp)},'sales',${day(1)},'processed',1,true) returning id as rep \\gset
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,raw_data) values(:'rep',${quote(gp)},${day(1)},'GP-1','Shirt',1,10000,'{"RCU MOBILE NO.":"9876543210"}');`;

test("cashier closes the day for their store but never sees Logic's sale, expected cash or the shortage", () => {
  const out = sql(`begin; ${sales} ${as(cashier)}
  select submit_day_close(${quote(gp)},${day(1)},1000,4000,5000,0,0,null,3000,null) as c \\gset
  select coalesce(logic_net_sale::text,'hidden'), coalesce(expected_cash::text,'hidden'), coalesce(difference::text,'hidden'), sales_report_uploaded from day_close_overview(${quote(gp)},${day(5)},${day(0)});
  ${as(owner)}
  select logic_net_sale, expected_cash, difference from day_close_overview(${quote(gp)},${day(5)},${day(0)});
  rollback;`);
  assert.deepEqual(lines(out), ["hidden|hidden|hidden|t", "10000|6000.00|-2000.00"]);
  assert.throws(() => sql(`begin; ${as(cashier)} select submit_day_close(${quote(bm)},${day(1)},0,100,0,0,0,null,0,null); rollback;`), /cannot close this store/);
});

test("cashier sees no sales, stock, customers or reports; managers keep their access", () => {
  const out = sql(`begin; ${sales} ${as(cashier)}
  select (select count(*) from sales_rows), (select count(*) from reports), (select count(*) from customer_list(${quote(gp)},'all',null,50,0)),
    (select count(*) from stores), (select count(*) from employee_contacts);
  ${as(gpManager)} select (select count(*) from sales_rows), (select count(*) from reports);
  rollback;`);
  assert.deepEqual(lines(out), ["0|0|0|1|0", "1|1"]);
  assert.throws(() => sql(`begin; ${as(cashier)} select store_profit(${quote(gp)},${quote(today)}); rollback;`), /Only the owner/);
});

test("cashier expenses: own store, own entries only", () => {
  const out = sql(`begin; ${as(gpManager)}
  insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(0)},'repairs',900,'cash');
  ${as(cashier)}
  insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(gp)},${day(0)},'tea_snacks',120,'cash');
  select count(*), sum(amount) from store_expenses;
  rollback;`);
  assert.deepEqual(lines(out), ["1|120.00"]);
  assert.throws(() => sql(`begin; ${as(cashier)} insert into store_expenses(store_id,expense_date,category,amount,paid_from) values(${quote(bm)},${day(0)},'tea_snacks',1,'cash'); rollback;`), /row-level security/);
});

test("cashier may start uploads of daily sales and stock only, for their store", () => {
  assert.equal(sql(`select upload_actor_allowed(${quote(cashier)},${quote(gp)},'sales'), upload_actor_allowed(${quote(cashier)},${quote(gp)},'stock'),
    upload_actor_allowed(${quote(cashier)},${quote(gp)},'payroll'), upload_actor_allowed(${quote(cashier)},${quote(gp)},'salary-attendance'),
    upload_actor_allowed(${quote(cashier)},${quote(bm)},'sales');`), "t|t|f|f|f");
  const out = sql(`begin; ${as(cashier)}
  select begin_report_import(${quote(gp)},'sales',repeat('e',64),'sale.xlsx',jsonb_build_array(jsonb_build_object('date','2099-01-02','row_count',1,'summary','{}'::jsonb)),'stop',false)->>'status';
  rollback;`);
  assert.equal(out, "processing");
  assert.throws(() => sql(`begin; ${as(cashier)} select begin_report_import(${quote(bm)},'sales',repeat('e',64),'sale.xlsx',jsonb_build_array(jsonb_build_object('date','2099-01-02','row_count',1,'summary','{}'::jsonb)),'stop',false); rollback;`), /Store access denied/);
});

test("cashier counts stock blind and never sees the differences, even after submitting", () => {
  const out = sql(`begin; reset role;
  insert into reports(store_id,report_type,report_date,period_month,status,row_count,is_current) values(${quote(gp)},'stock',${day(3)},date_trunc('month',${day(3)})::date,'processed',1,true) returning id as st \\gset
  insert into stock_rows(report_id,store_id,stock_month,brand,item_name,size,quantity,mrp,raw_data) values(:'st',${quote(gp)},date_trunc('month',${day(3)})::date,'MUFTI','SHIRT','M',5,2000,'{"LOT CODE":"Q1"}');
  ${as(cashier)}
  select refresh_stock_position(${quote(gp)}) as refreshed \\gset
  select stock_count_brands(${quote(gp)});
  select start_stock_count(${quote(gp)}, null, 'MUFTI', null) as c \\gset
  select record_stock_count(id, 3) from stock_count_sheet(:'c');
  select submit_stock_count(:'c');
  select coalesce(expected_qty::text,'hidden'), counted_qty from stock_count_sheet(:'c');
  select coalesce(stock_count_summary(:'c')->>'short_units','hidden');
  ${as(owner)} select expected_qty, counted_qty from stock_count_sheet(:'c');
  rollback;`);
  assert.deepEqual(lines(out), ["MUFTI", "hidden|3.000", "hidden", "5.000|3.000"]);
});

test("cashier requests a new staff member; only the owner decides", () => {
  const out = sql(`begin; ${as(cashier)}
  insert into staff_requests(store_id,staff_name,phone,designation) values(${quote(gp)},'Ravi Kumar','9876543210','Salesman') returning id as r \\gset
  update staff_requests set status='approved' where id=:'r';
  select status from staff_requests where id=:'r';
  ${as(gpManager)} select count(*) from staff_requests;
  ${as(owner)} update staff_requests set status='approved', decided_by=${quote(owner)}, decided_at=now() where id=:'r';
  select status from staff_requests where id=:'r';
  rollback;`);
  assert.deepEqual(lines(out), ["pending", "1", "approved"]);
  assert.throws(() => sql(`begin; ${as(cashier)} insert into staff_requests(store_id,staff_name,phone) values(${quote(bm)},'X Y','9876543210'); rollback;`), /row-level security/);
  assert.throws(() => sql(`begin; ${as(cashier)} insert into staff_requests(store_id,staff_name,phone,status) values(${quote(gp)},'X Y','9876543210','approved'); rollback;`), /row-level security/);
});
