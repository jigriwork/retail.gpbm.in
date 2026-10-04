import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database (scripts/test-accounts-local.mjs); never production.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(text) {
  return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
const as = actor => `reset role; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
const value = text => sql(text).split("\n").at(-1);

const owner = "d0000000-0000-0000-0000-000000000001";
const gpManager = "d0000000-0000-0000-0000-000000000003";
const bmManager = "d0000000-0000-0000-0000-000000000004";
const people = [[owner, "owner"], [gpManager, "manager"], [bmManager, "manager"]];
const gp = value("select id from stores where code='GP'");
const bm = value("select id from stores where code='BM'");
sql(`insert into auth.users(id,email) values ${people.map(([id], i) => `(${quote(id)},'buying-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=v.role,is_active=true from (values ${people.map(([id, role]) => `(${quote(id)}::uuid,${quote(role)})`).join(",")}) v(id,role) where profiles.id=v.id;
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}),(${quote(bm)},${quote(bmManager)}) on conflict do nothing;`);
const today = value("select india_today()");
const day = offset => `(${quote(today)}::date - ${offset})`;
const raw = (code, rate) => JSON.stringify({ "LOT CODE": code, ...(rate ? { "BASIC RATE": String(rate) } : {}) });

// GP stock 10 days ago: MUFTI SHIRT1 M ×5 (cost 800) and L ×1; PEPE JEANS1 32 ×3 (also in a stock report 100 days ago, never sold).
// GP sold SHIRT1 M ×4 in the last 30 days (2 after the stock report); an old sale 200 days ago starts the sales history.
// BM sold JEANS1 32 ×2 in the last 30 days and has none in stock.
const setup = `reset role;
insert into reports(store_id,report_type,report_date,period_month,status,row_count,is_current) values
 (${quote(gp)},'stock',${day(100)},date_trunc('month',${day(100)})::date,'processed',1,true),
 (${quote(gp)},'stock',${day(10)},date_trunc('month',${day(10)})::date,'processed',3,true),
 (${quote(bm)},'stock',${day(10)},date_trunc('month',${day(10)})::date,'processed',1,true);
insert into stock_rows(report_id,store_id,stock_month,brand,item_name,size,quantity,mrp,raw_data)
select r.id, r.store_id, coalesce(r.period_month, r.report_date), v.brand, v.item, v.size, v.qty, v.mrp, v.raw::jsonb
from reports r join (values
  (100, 'GP', 'PEPE', 'JEANS1', '32', 3, 3000, ${quote(raw("L3"))}),
  (10, 'GP', 'MUFTI', 'SHIRT1', 'M', 5, 2000, ${quote(raw("L1", 800))}),
  (10, 'GP', 'MUFTI', 'SHIRT1', 'L', 1, 2000, ${quote(raw("L2", 800))}),
  (10, 'GP', 'PEPE', 'JEANS1', '32', 3, 3000, ${quote(raw("L3"))}),
  (10, 'BM', 'MUFTI', 'OTHER', 'S', 1, 999, ${quote(raw("B9"))})
) v(ago, code, brand, item, size, qty, mrp, raw) on r.report_type = 'stock' and r.report_date = ${quote(today)}::date - v.ago
  and r.store_id = (select id from stores where code = v.code);
insert into reports(store_id,report_type,report_date,status,row_count,is_current) values
 (${quote(gp)},'sales',${day(200)},'processed',1,true),(${quote(gp)},'sales',${day(20)},'processed',1,true),(${quote(gp)},'sales',${day(5)},'processed',1,true),
 (${quote(bm)},'sales',${day(7)},'processed',1,true);
insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,brand,quantity,net_sale,raw_data)
select r.id, r.store_id, r.report_date, 'B'||v.ago, v.item, v.brand, v.qty, v.amount, jsonb_build_object('LOT CODE', v.lot, 'PACK / SIZE', v.size)
from reports r join (values
  (200, 'GP', 'OLDITEM', 'ARROW', 'X', 'Z1', 1, 500),
  (20, 'GP', 'SHIRT1', 'MUFTI', 'M', 'L1', 2, 3600),
  (5, 'GP', 'SHIRT1', 'MUFTI', 'M', 'L1', 2, 3600),
  (7, 'BM', 'JEANS1', 'PEPE', '32', 'BX', 2, 5400)
) v(ago, code, item, brand, size, lot, qty, amount) on r.report_type = 'sales' and r.report_date = ${quote(today)}::date - v.ago
  and r.store_id = (select id from stores where code = v.code);
${as(owner)} select refresh_stock_position(${quote(gp)}) as r1, refresh_stock_position(${quote(bm)}) as r2 \\gset
reset role;`;

test("stock position: latest stock report less units sold since; sell-through and cover by brand", () => {
  const out = sql(`begin; ${setup} ${as(gpManager)}
  select brand, sold_units, on_hand, sell_through_pct, days_cover, no_sale_90_units from brand_sell_through(${quote(gp)}, 30) order by brand;
  rollback;`);
  // MUFTI: sold 4 in 30 days; on hand M 5-2=3 + L 1 = 4 → 50%, cover 4/(4/30)=30 days. PEPE: 3 on hand, never sold.
  assert.deepEqual(out.split("\n"), ["MUFTI|4|4|50.0|30|1", "PEPE|0|3|0.0||3"]);
});

test("reorder by item and size, showing other stores' stock; transfers from a slow store to a selling one", () => {
  const out = sql(`begin; ${setup} ${as(gpManager)}
  select 'reorder', brand, item_name, size, sold, on_hand, suggest_qty from reorder_suggestions(${quote(gp)}, 30, 30);
  select 'transfer', item_name, size, from_store, to_store, from_on_hand, to_sold_30, qty from transfer_suggestions();
  ${as(bmManager)}
  select 'bm-sees-transfer', count(*) from transfer_suggestions();
  select 'bm-reorder-gp', count(*) from reorder_suggestions(${quote(gp)}, 30, 30);
  rollback;`);
  assert.deepEqual(out.split("\n"), [
    "reorder|MUFTI|SHIRT1|M|4|3|1",
    "transfer|JEANS1|32|Go Planet|Brand Mark|3|2|2",
    "bm-sees-transfer|1",
    "bm-reorder-gp|0",
  ]);
});

test("markdown list: in stock, no sale for 90+ days, seen in stock 60+ days ago; discount by age", () => {
  const out = sql(`begin; ${setup} ${as(owner)}
  select brand, item_name, on_hand, value_mrp, days_without_sale, suggested_pct from markdown_candidates(${quote(gp)});
  rollback;`);
  // Never sold since the sales history began 200 days ago → 30%.
  assert.equal(out, "PEPE|JEANS1|3|9000|200|30");
});

test("blind stock count: counters do not see expected stock; totals after submitting; store and owner rules", () => {
  const out = sql(`begin; ${setup} ${as(gpManager)}
  select start_stock_count(${quote(gp)}, null, 'mufti', null) as c \\gset
  select 'sheet', item_name, size, coalesce(expected_qty::text, 'hidden') from stock_count_sheet(:'c') order by size;
  select 'lines-table', count(*) from stock_count_lines;
  select record_stock_count(id, case when size='M' then 2 else 1 end) from stock_count_sheet(:'c');
  select add_stock_count_extra(:'c', 'X1', 'SHIRT9', 'XL', 1);
  select submit_stock_count(:'c');
  select 'after', item_name, size, expected_qty, counted_qty from stock_count_sheet(:'c') order by is_extra, size;
  select 'summary', s->>'short_units', s->>'over_units', s->>'short_value_mrp', s->>'net_value_mrp', s->>'net_value_cost' from (select stock_count_summary(:'c') s) x;
  ${as(owner)} select review_stock_count(:'c', 'Shirt M missing; check CCTV');
  select 'status', status from stock_counts where id = :'c';
  rollback;`);
  assert.deepEqual(out.split("\n").filter(Boolean), [
    "sheet|SHIRT1|L|hidden", "sheet|SHIRT1|M|hidden",
    "lines-table|0",
    "after|SHIRT1|L|1.000|1.000", "after|SHIRT1|M|3.000|2.000", "after|SHIRT9|XL|0.000|1.000",
    "summary|1.000|1.000|2000.00000|-2000.00000|-800.00000",
    "status|reviewed",
  ]);
  assert.throws(() => sql(`begin; ${setup} ${as(bmManager)} select start_stock_count(${quote(gp)}, null, 'MUFTI', null); rollback;`), /cannot count this store/);
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select start_stock_count(${quote(gp)}, null, 'MUFTI', null) as c \\gset
    select submit_stock_count(:'c'); rollback;`), /not counted yet/);
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select start_stock_count(${quote(gp)}, null, 'MUFTI', null) as c \\gset
    select record_stock_count(id, 1) from stock_count_sheet(:'c'); select submit_stock_count(:'c'); select review_stock_count(:'c', null); rollback;`), /Only the owner/);
  assert.throws(() => sql(`begin; ${setup} ${as(gpManager)} select start_stock_count(${quote(gp)}, null, 'NOBRAND', null); rollback;`), /Nothing in stock/);
});

test("buying budget against posted purchases and brand sales; owner only", () => {
  const out = sql(`begin; ${setup} reset role;
  insert into brands(name) values('Mufti') returning id as b \\gset
  ${as(owner)}
  insert into buying_budgets(brand_id, store_id, season, starts_on, ends_on, budget_amount) values(:'b', ${quote(gp)}, 'AW26', ${day(60)}, ${day(0)}, 100000);
  select brand, season, budget_amount, purchased, remaining, sold_units, net_sales from budget_status();
  ${as(gpManager)} select 'manager', count(*) from budget_status();
  rollback;`);
  assert.deepEqual(out.split("\n"), ["Mufti|AW26|100000.00|0|100000.00|4|7200", "manager|0"]);
  assert.throws(() => sql(`begin; reset role; insert into brands(name) values('Mufti') returning id as b \\gset
    ${as(gpManager)} insert into buying_budgets(brand_id, season, starts_on, ends_on, budget_amount) values(:'b','AW26','2026-10-01','2026-12-31',1); rollback;`), /row-level security/);
  assert.equal(sql("select has_function_privilege('authenticated','public.stock_position_internal(uuid)','EXECUTE');"), "f");
});

test("saved stock position is recalculated only when a report changes", () => {
  const out = sql(`begin; ${setup} ${as(gpManager)}
  select refresh_stock_position(${quote(gp)});
  reset role; insert into reports(store_id,report_type,report_date,status,row_count,is_current) values(${quote(gp)},'sales',${day(1)},'processed',1,true) returning id as r \\gset
  insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,brand,quantity,net_sale,raw_data) values(:'r',${quote(gp)},${day(1)},'N1','SHIRT1','MUFTI',1,1800,'{"LOT CODE":"L1","PACK / SIZE":"M"}');
  ${as(gpManager)} select refresh_stock_position(${quote(gp)});
  reset role; select on_hand from stock_position_cache where lot_code='L1';
  rollback;`);
  // L1: 5 in the stock report, 2 sold 5 days ago and 1 more yesterday → 2 left.
  assert.deepEqual(out.split("\n").filter(Boolean), ["f", "t", "2"]);
  assert.equal(sql("select has_table_privilege('authenticated','public.stock_position_cache','SELECT');"), "f");
});
