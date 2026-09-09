import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { test } from "node:test";

// Fixed disposable database: deliberately does not accept DATABASE_URL or load
// .env.local. These tests can never select a production connection by accident.
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const owner = "00000000-0000-0000-0000-000000000001";
const gpManager = "00000000-0000-0000-0000-000000000002";
const bmManager = "00000000-0000-0000-0000-000000000003";
const inactive = "00000000-0000-0000-0000-000000000004";
const unassigned = "00000000-0000-0000-0000-000000000005";
function sql(text) { return execFileSync("psql", args, { input: "create or replace function pg_temp.assert_test(ok boolean, message text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception '%',message; end if; end $$;\n" + text, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim(); }
const as = actor => `set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role='authenticated'; set local role authenticated;`;
function result(text) { return JSON.parse(sql(text).split("\n").at(-1)); }
function check(condition, message) { return `select pg_temp.assert_test((${condition}),${quote(message)});`; }
const gp = sql("select id from stores where code='GP'");
const bm = sql("select id from stores where code='BM'");
sql(`insert into auth.users(id,email) values ${[owner,gpManager,bmManager,inactive,unassigned].map((id,i)=>`(${quote(id)},'fixture-${i}@example.invalid')`).join(",")} on conflict(id) do nothing;
update profiles set role=case when id=${quote(owner)} then 'owner' else 'manager' end,is_active=(id<>${quote(inactive)}) where id in(${[owner,gpManager,bmManager,inactive,unassigned].map(quote).join(",")});
insert into store_users(store_id,user_id) values(${quote(gp)},${quote(gpManager)}),(${quote(bm)},${quote(bmManager)}),(${quote(gp)},${quote(inactive)}) on conflict do nothing;`);
const report = "10000000-0000-0000-0000-000000000001";
const otherReport = "10000000-0000-0000-0000-000000000002";
const seed = `insert into reports(id,store_id,report_type,report_date,file_path,status,row_count) values
 (${quote(report)},${quote(gp)},'sales','2026-01-01','sales/gp/original.xlsx','processed',1),
 (${quote(otherReport)},${quote(bm)},'sales','2026-01-01','sales/bm/original.xlsx','processed',1);
 insert into sales_rows(report_id,store_id,sale_date,item_name,net_sale) values(${quote(report)},${quote(gp)},'2026-01-01','Original',100),(${quote(otherReport)},${quote(bm)},'2026-01-01','Other',200);
 insert into storage.objects(bucket_id,name) values('reports','sales/gp/original.xlsx'),('reports','sales/bm/original.xlsx');`;

for (const [actor, expected] of [[owner,2],[gpManager,1],[bmManager,1],[inactive,0],[unassigned,0]]) {
 test(`H03/H04 direct RLS using retained JWT for ${actor.slice(-1)}`, () => {
  const actual=result(`begin; ${seed} ${as(actor)} select jsonb_build_object('reports',(select count(*) from reports where id in(${quote(report)},${quote(otherReport)})), 'rows',(select count(*) from sales_rows where report_id in(${quote(report)},${quote(otherReport)})), 'files',(select count(*) from storage.objects where name in('sales/gp/original.xlsx','sales/bm/original.xlsx'))); rollback;`);
  assert.deepEqual(actual,{reports:expected,rows:expected,files:expected});
 });
}
test("H04 deactivation immediately denies the same authenticated database session", () => {
 sql(`begin; ${seed} ${as(gpManager)} ${check(`(select count(*) from sales_rows where report_id=${quote(report)})=1`,"Initial access missing")}
 reset role; update profiles set is_active=false where id=${quote(gpManager)}; set local role authenticated;
 ${check(`(select count(*) from sales_rows where report_id=${quote(report)})=0`,"Old JWT retained access")} rollback;`);
});
for (const actor of [bmManager,inactive,unassigned]) {
 test(`H03/H01 forged store RPC denied for ${actor.slice(-1)}`, () => {
  assert.throws(()=>sql(`begin; ${as(actor)} select analytics_data(array[${quote(gp)}::uuid],'2026-01-01','2026-01-31','{}'); rollback;`),/Store access denied/);
  assert.throws(()=>sql(`begin; ${as(actor)} select reserve_source_file(${quote(gp)},'reports','sales','forged.xlsx'); rollback;`),/Store access denied/);
 });
}
test("H03 reserved upload succeeds only for its trusted store; paths cannot be laundered", () => {
 sql(`begin; ${as(gpManager)} select reserve_source_file(${quote(gp)},'review-photos','rack','gp.jpg') as path \\gset
 insert into storage.objects(bucket_id,name) values('review-photos',:'path');
 ${check("(select count(*) from storage.objects where bucket_id='review-photos')=1","Reserved upload missing")}
 reset role; ${as(bmManager)} ${check("(select count(*) from storage.objects where bucket_id='review-photos')=0","Cross store photo leaked")} rollback;`);
 assert.throws(()=>sql(`begin; ${as(gpManager)} insert into storage.objects(bucket_id,name) values('reports','sales/bm/browser.xlsx'); rollback;`),/row-level security/);
 assert.throws(()=>sql(`begin; ${seed} ${as(gpManager)} insert into rack_reviews(store_id,review_date,photo_path,reviewed_by) values(${quote(gp)},'2026-01-01','sales/bm/original.xlsx',${quote(gpManager)}); rollback;`),/Photo must belong/);
});
test("H03 original evidence cannot be deleted or overwritten even by owner", () => {
 sql(`begin; ${seed} ${as(owner)} delete from storage.objects where name='sales/gp/original.xlsx'; update storage.objects set name='changed' where name='sales/gp/original.xlsx';
 ${check("exists(select 1 from storage.objects where name='sales/gp/original.xlsx')","Original evidence mutated")} rollback;`);
});

const manifest = (count=1,target=true) => JSON.stringify([{date:"2026-01-01",row_count:count,summary:{totalNetSale:150},...(target?{target_id:report}:{})}]);
function beginImport({ count=1,type="sales",bulk=false,mode="replace",key="a",target=true }={}) {
 return `select begin_report_import(${quote(gp)},${quote(type)},${quote(key.repeat(64))},'corrected.xlsx',${quote(manifest(count,target))},${quote(mode)},${bulk}) as run \\gset
 select :'run'::jsonb->>'id' as run_id, :'run'::jsonb->>'file_path' as path \\gset
 insert into storage.objects(bucket_id,name) values('reports',:'path');`;
}
const stage = `select stage_report_chunk(:'run_id',0,'[{"logical_date":"2026-01-01","net_sale":150,"item_name":"Corrected"}]');`;

test("H02/H09 successful replacement publishes complete version and preserves original", () => {
 sql(`begin; ${seed} ${as(owner)} ${beginImport()} ${stage} select commit_report_import(:'run_id') as committed \\gset
 ${check("(:'committed'::jsonb->>'ok')::boolean","Commit failed")}
 ${check(`(select count(*) from reports where store_id=${quote(gp)} and report_date='2026-01-01' and is_current)=1`,"Multiple active versions")}
 ${check(`(select count(*) from sales_rows where report_id=${quote(report)})=1`,"Original rows removed")}
 ${check(`not(select is_current from reports where id=${quote(report)})`,"Previous still active")}
 ${check("exists(select 1 from audit_logs where action='replace_sales_report')","Audit missing")}
 select commit_report_import(:'run_id');
 ${check(`(select count(*) from reports where store_id=${quote(gp)})=2`,"Retry duplicated version")} rollback;`);
});

// Test-only triggers inject failures at SQL boundaries without adding any
// bypass/test switch to production functions.
for (const [phase,table,event,condition] of [
 ["row insertion","sales_rows","insert","true"],
 ["version switch","reports","update","new.is_current and not old.is_current"],
 ["audit insertion","audit_logs","insert","new.action='replace_sales_report'"],
]) {
 test(`H09 ${phase} failure leaves old complete version active and retry succeeds`, () => {
  sql(`begin; ${seed}
 create function pg_temp.inject_failure() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'Fixture failure'; end if; return new; end $$;
 create trigger inject_failure before ${event} on ${table} for each row execute function pg_temp.inject_failure();
 ${as(owner)} ${beginImport()} ${stage} select commit_report_import(:'run_id') as committed \\gset
 ${check("not (:'committed'::jsonb->>'ok')::boolean","Failure was hidden")}
 ${check(`(select is_current from reports where id=${quote(report)})`,"Prior version lost")}
 ${check(`(select count(*) from sales_rows where report_id=${quote(report)})=1`,"Prior rows lost")}
 reset role; drop trigger inject_failure on ${table}; ${as(owner)}
 select begin_report_import(${quote(gp)},'sales',${quote('a'.repeat(64))},'corrected.xlsx',${quote(manifest())},'replace',false);
 select commit_report_import(:'run_id') as retried \\gset
 ${check("(:'retried'::jsonb->>'ok')::boolean","Retry failed")} rollback;`);
 });
}
for(const count of [999,1000,1001,23209,38129]) {
 test(`H01 exact aggregate reconciliation for ${count} rows`, () => {
  const actual=result(`begin; insert into reports(id,store_id,report_type,report_date,status) values(${quote(report)},${quote(gp)},'sales','2026-01-01','processed');
 insert into reports(id,store_id,report_type,period_month,status) values(${quote(otherReport)},${quote(gp)},'stock','2026-01-01','processed');
 insert into sales_rows(report_id,store_id,sale_date,bill_no,item_name,quantity,net_sale,brand,category,staff_name)
 select ${quote(report)},${quote(gp)},'2026-01-01',(i%100)::text,'Shirt',case when i%10=0 then -1 else 1 end,case when i%10=0 then -100.25 else 100.25 end,'Brand','Category','Alice' from generate_series(1,${count}) i;
 insert into stock_rows(report_id,store_id,stock_month,item_name,quantity,mrp,brand,category)
 select ${quote(otherReport)},${quote(gp)},'2026-01-01','Shirt',i%7,100.25,'Brand','Category' from generate_series(1,${count}) i;
 ${as(owner)} select analytics_data(array[${quote(gp)}::uuid],'2026-01-01','2026-01-01',array['2026-01-01'::date]); rollback;`);
  let cents=0,stock=0;for(let i=1;i<=count;i++){cents+=(i%10===0?-10025:10025);stock+=i%7;}
  assert.equal(actual.sales_row_count,count);assert.equal(actual.stock_row_count,count);
  assert.equal(actual.net_sale,cents/100);assert.equal(actual.stock_quantity,stock);
  assert.equal(actual.sales.reduce((n,row)=>n+row.source_row_count,0),count);
  assert.ok(actual.sales.length<=100,"Database did not aggregate repeated dimensions");
 });
}
for(const count of [1001,2001,3001]) {
 test(`H02 missing chunk at boundary ${count} cannot publish partial report`, () => {
  sql(`begin; ${seed} ${as(owner)} ${beginImport({count})} ${stage}
 select commit_report_import(:'run_id') as committed \\gset
 ${check("not (:'committed'::jsonb->>'ok')::boolean","Partial report published")}
 ${check(`(select is_current from reports where id=${quote(report)})`,"Prior version lost")} rollback;`);
 });
}
test("H09 archive and rollback are transactional and preserve original rows", () => {
 sql(`begin; ${seed} ${as(owner)} select archive_sales_report(${quote(report)});
 ${check(`(select count(*) from sales_rows where report_id=${quote(report)})=1`,"Archive deleted rows")}
 select restore_report_version(${quote(report)});
 ${check(`(select is_current from reports where id=${quote(report)})`,"Restore failed")} rollback;`);
});
test("H02 direct PostgREST-role inserts cannot bypass import protocol", () => {
 assert.throws(()=>sql(`begin; ${as(owner)} insert into reports(store_id,report_type,status) values(${quote(gp)},'sales','processed'); rollback;`),/permission denied/);
});
test("H02/H09 bulk transaction rolls back all days on second-day failure", () => {
 const days=[{date:'2026-01-01',row_count:1,summary:{}},{date:'2026-01-02',row_count:1,summary:{}}];
 sql(`begin; ${seed}
 create function pg_temp.inject_day_failure() returns trigger language plpgsql as $$ begin if new.sale_date='2026-01-02' then raise exception 'Second day failure'; end if; return new; end $$;
 create trigger inject_day_failure before insert on sales_rows for each row execute function pg_temp.inject_day_failure();
 ${as(owner)} select begin_report_import(${quote(gp)},'sales',${quote('b'.repeat(64))},'bulk.xlsx',${quote(JSON.stringify(days))},'replace',true) as run \\gset
 select :'run'::jsonb->>'id' as run_id, :'run'::jsonb->>'file_path' as path \\gset
 insert into storage.objects(bucket_id,name) values('reports',:'path');
 select stage_report_chunk(:'run_id',0,'[{"logical_date":"2026-01-01","net_sale":150},{"logical_date":"2026-01-02","net_sale":200}]');
 select commit_report_import(:'run_id') as committed \\gset
 ${check("not (:'committed'::jsonb->>'ok')::boolean","Partial batch published")}
 ${check(`(select is_current from reports where id=${quote(report)})`,"First day's prior version lost")}
 ${check("not exists(select 1 from sales_upload_batches)","Partial batch left behind")} rollback;`);
});
function asyncSql(text, onData) {
 return new Promise((resolve,reject)=>{
  const child=spawn('psql',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
  child.stdout.on('data',chunk=>{out+=chunk;onData?.(out);});child.stderr.on('data',chunk=>{err+=chunk;});
  child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));child.stdin.end(text);
 });
}
function cleanupRun(runId) {
 sql(`delete from sales_rows where report_id in(select id from reports where import_id=${quote(runId)});
 delete from stock_rows where report_id in(select id from reports where import_id=${quote(runId)});
 delete from reports where import_id=${quote(runId)};
 delete from report_import_chunks where import_id=${quote(runId)};
 delete from report_imports where id=${quote(runId)};`);
}
test('H02 two simultaneous identical uploads create one active report and one row',async()=>{
 const days=JSON.stringify([{date:'2026-02-01',row_count:1,summary:{}}]);
 const start=`begin; ${as(owner)} select begin_report_import(${quote(gp)},'sales',${quote('c'.repeat(64))},'concurrent.xlsx',${quote(days)},'stop',false); commit;`;
 const [a,b]=await Promise.all([asyncSql(start),asyncSql(start)]);const first=JSON.parse(a),second=JSON.parse(b);
 assert.equal(first.id,second.id);
 try {
  sql(`begin; ${as(owner)} insert into storage.objects(bucket_id,name) values('reports',${quote(first.file_path)});
   select stage_report_chunk(${quote(first.id)},0,'[{"logical_date":"2026-02-01","net_sale":123}]'); commit;`);
  const publish=`begin; ${as(owner)} select commit_report_import(${quote(first.id)}); commit;`;
  const [left,right]=await Promise.all([asyncSql(publish),asyncSql(publish)]);
  assert.equal(JSON.parse(left).ok,true);assert.deepEqual(JSON.parse(left),JSON.parse(right));
  assert.equal(Number(sql(`select count(*) from reports where import_id=${quote(first.id)} and is_current`)),1);
  assert.equal(Number(sql(`select count(*) from sales_rows where report_id in(select id from reports where import_id=${quote(first.id)})`)),1);
 }finally{cleanupRun(first.id);}
});
test('H09 connection interruption during commit leaves no active partial version; retry succeeds',async()=>{
 const days=JSON.stringify([{date:'2026-03-01',row_count:1,summary:{}}]);
 const run=result(`begin; ${as(owner)} select begin_report_import(${quote(gp)},'sales',${quote('d'.repeat(64))},'interrupted.xlsx',${quote(days)},'stop',false); commit;`);
 try{
  sql(`begin; ${as(owner)} insert into storage.objects(bucket_id,name) values('reports',${quote(run.file_path)});select stage_report_chunk(${quote(run.id)},0,'[{"logical_date":"2026-03-01","net_sale":123}]'); commit;`);
  let killed=false;
  await assert.rejects(asyncSql(`begin; ${as(owner)} select commit_report_import(${quote(run.id)});select 'READY:'||pg_backend_pid();select pg_sleep(30);commit;`,out=>{
   const match=out.match(/READY:(\d+)/);if(match&&!killed){killed=true;sql(`select pg_terminate_backend(${Number(match[1])})`);}
  }));
  assert.equal(killed,true);
  assert.equal(Number(sql(`select count(*) from reports where import_id=${quote(run.id)}`)),0);
  assert.equal(result(`begin; ${as(owner)} select commit_report_import(${quote(run.id)});commit;`).ok,true);
 }finally{cleanupRun(run.id);}
});
for(let boundary=0;boundary<39;boundary++) {
 test(`H02 stock staging failure at chunk ${boundary+1}/39 is safely resumable`,()=>{
  const count=38129,days=JSON.stringify([{date:'2026-04-01',row_count:count,summary:{}}]);
  sql(`begin; ${as(owner)} select begin_report_import(${quote(gp)},'stock',${quote('e'.repeat(64))},'stock.xlsx',${quote(days)},'stop',false) as run \\gset
 select :'run'::jsonb->>'id' as run_id \\gset
 select stage_report_chunk(:'run_id',${boundary},(select jsonb_agg(jsonb_build_object('logical_date','2026-04-01','quantity',1)) from generate_series(1,${boundary===38?129:1000})));
 select fail_report_import(:'run_id');
 ${check("not exists(select 1 from reports where import_id=:'run_id'::uuid)","Staging exposed business rows")}
 select begin_report_import(${quote(gp)},'stock',${quote('e'.repeat(64))},'stock.xlsx',${quote(days)},'stop',false);
 select stage_report_chunk(:'run_id',${boundary},(select jsonb_agg(jsonb_build_object('logical_date','2026-04-01','quantity',1)) from generate_series(1,${boundary===38?129:1000})));
 ${check("(select status from report_imports where id=:'run_id'::uuid)='processing'","Retry did not resume")}
 rollback;`);
 });
}
test('H02 full 38,129-row stock publication is complete and idempotent',()=>{
 sql(`begin; ${as(owner)} ${beginImport({count:38129,type:'stock',mode:'stop',target:false})}
 select stage_report_chunk(:'run_id',chunk,(select jsonb_agg(jsonb_build_object('logical_date','2026-01-01','quantity',3,'sku','SKU-'||i)) from generate_series(chunk*1000+1,least((chunk+1)*1000,38129)) i)) from generate_series(0,38) chunk;
 select commit_report_import(:'run_id') as committed \\gset
 ${check("(:'committed'::jsonb->>'ok')::boolean","Stock commit failed")}
 ${check("(select sum(row_count) from reports where import_id=:'run_id'::uuid and is_current)=38129","Incomplete stock report")}
 ${check("(select count(*) from stock_rows where report_id in(select id from reports where import_id=:'run_id'::uuid))=38129","Missing stock rows")}
 ${check("(select sum(quantity) from stock_rows where report_id in(select id from reports where import_id=:'run_id'::uuid))=114387","Stock quantity differs")}
 ${check("commit_report_import(:'run_id')=:'committed'::jsonb","Retry differs")} rollback;`);
});
test('H03 anonymous RPC denied and payslips remain owner-only',()=>{
 assert.throws(()=>sql(`begin;set local role anon;select begin_report_import(${quote(gp)},'sales',${quote('a'.repeat(64))},'x',${quote(manifest())},'stop',false);rollback;`),/permission denied/);
 sql(`begin;insert into storage.objects(bucket_id,name) values('payslips','private.pdf');${as(gpManager)}
 ${check("not exists(select 1 from storage.objects where bucket_id='payslips')","Manager can read payslip")}
 reset role;${as(owner)}${check("exists(select 1 from storage.objects where name='private.pdf')","Owner payslip access broken")}rollback;`);
});
test('H02 bulk publication retains exact batch totals and daily traceability',()=>{
 const days=JSON.stringify([{date:'2026-01-01',row_count:1,summary:{}},{date:'2026-01-02',row_count:1,summary:{}}]);
 sql(`begin; ${seed} ${as(owner)} select begin_report_import(${quote(gp)},'sales',${quote('b'.repeat(64))},'bulk.xlsx',${quote(days)},'replace',true) as run \\gset
 select :'run'::jsonb->>'id' as run_id,:'run'::jsonb->>'file_path' as path \\gset
 insert into storage.objects(bucket_id,name) values('reports',:'path');
 select stage_report_chunk(:'run_id',0,'[{"logical_date":"2026-01-01","net_sale":150,"quantity":2,"bill_no":"A"},{"logical_date":"2026-01-02","net_sale":200,"quantity":3,"bill_no":"A"}]');
 select commit_report_import(:'run_id') as committed \\gset
 ${check("(:'committed'::jsonb->>'ok')::boolean","Bulk failed")}
 ${check("exists(select 1 from sales_upload_batches where id=(:'committed'::jsonb->>'batch_id')::uuid and total_rows=2 and total_net_sale=350 and total_quantity=5 and total_bills=2 and replaced_dates=1 and imported_dates=1)","Incorrect batch totals")}
 ${check("(select count(*) from reports where import_id=:'run_id'::uuid and file_path=:'path' and sales_upload_batch_id=(:'committed'::jsonb->>'batch_id')::uuid)=2","Lost daily traceability")} rollback;`);
});
