import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const sql=q=>execFileSync('psql',['-XqAt','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const owner='00000000-0000-0000-0000-000000000001';
sql(`insert into auth.users(id,email) values('${owner}','stock-owner@example.invalid') on conflict(id) do nothing; update profiles set role='owner',is_active=true where id='${owner}';`);
const setup=(count,bad=false)=>`begin;
set local request.jwt.claim.sub='${owner}';set local role authenticated;
select begin_report_import((select id from stores where code='GP'),'stock',repeat('c',64),'bounded-stock.xlsx',jsonb_build_array(jsonb_build_object('date','2099-11-01','row_count',${count},'summary','{}'::jsonb)),'stop',false) run \\gset
select :'run'::jsonb->>'id' id,:'run'::jsonb->>'file_path' path \\gset
reset role;insert into storage.objects(bucket_id,name) values('reports',:'path');
insert into report_import_chunks select :'id'::uuid,(i-1)/1000,jsonb_agg(jsonb_build_object('logical_date','2099-11-01','item_name','Stock item','quantity',${bad?`case when i=${count} then 'invalid' else '2' end`:'2'},'mrp',100,'raw_data',jsonb_build_object('source',repeat('untrusted workbook cell ',40)))) from generate_series(1,${count}) i group by (i-1)/1000;
set local role authenticated;set local statement_timeout='8s';
`;
for(const rows of [24954,13175])test(`Atomic stock finalization publishes all ${rows} rows within unchanged 8s statement limit`,()=>{
const r=sql(`${setup(rows)}select commit_report_import(:'id')->>'ok';
select count(*),sum(quantity),sum(quantity*mrp) from stock_rows where report_id in(select id from reports where import_id=:'id');
select commit_report_import(:'id')->>'ok';
select count(*) from reports where import_id=:'id';rollback;`);
assert.deepEqual(r.split('\n'),['true',`${rows}|${rows*2}|${rows*200}`,'true','1']);
});
test('Stock-only finalization publishes directly from bounded chunks and is idempotent',()=>{
 const r=sql(`${setup(24954)}select commit_stock_report_import(:'id')->>'ok';select count(*) from stock_rows where report_id in(select id from reports where import_id=:'id');select commit_stock_report_import(:'id')->>'ok';rollback;`);
 assert.deepEqual(r.split('\n'),['true','24954','true']);
});
test('Stock-only finalization is not executable anonymously',()=>{
 assert.equal(sql("select has_function_privilege('anon','public.commit_stock_report_import(uuid)','EXECUTE');"),'f');
 assert.throws(()=>sql("set role anon;select commit_stock_report_import(gen_random_uuid());"));
});
test('Invalid final stock chunk rolls back every report, row, audit and version switch; retry remains possible',()=>{
const r=sql(`${setup(24954,true)}select commit_report_import(:'id')->>'ok';
select count(*) from reports where import_id=:'id';select count(*) from stock_rows where stock_month='2099-11-01';
select status from report_imports where id=:'id';
reset role;update report_import_chunks set rows=jsonb_set(rows,'{953,quantity}','2') where import_id=:'id' and chunk_no=24;update report_imports set status='processing' where id=:'id';set local role authenticated;
select commit_report_import(:'id')->>'ok';select count(*) from stock_rows where report_id in(select id from reports where import_id=:'id');rollback;`);
assert.deepEqual(r.split('\n'),['false','0','0','failed','true','24954']);
});

test('Complete stock analytics uses active versions without serializing large recovery summaries per row',()=>{
const r=sql(`${setup(24954)}select commit_report_import(:'id')->>'ok';
reset role;update reports set summary=jsonb_build_object('recovery_evidence',repeat('retained source metadata ',10000)) where import_id=:'id';set local role authenticated;
select analytics_data(array[(select id from stores where code='GP')],null,null,array['2099-11-01'::date])->>'stock_row_count';
reset role;update reports set is_current=false where import_id=:'id';set local role authenticated;
select analytics_data(array[(select id from stores where code='GP')],null,null,array['2099-11-01'::date])->>'stock_row_count';rollback;`);
assert.deepEqual(r.split('\n'),['true','24954','0']);
});

// Go Planet, Oct 2026: 50,073 rows timed out (57014) as one publish. Realistic
// Logic rows (the derive trigger's columns filled) published in parts.
const logicSetup=(count,fp='e')=>`begin;
set local request.jwt.claim.sub='${owner}';set local role authenticated;
select begin_report_import((select id from stores where code='GP'),'stock',repeat('${fp}',64),'GP OCT STOCK.xlsx',jsonb_build_array(jsonb_build_object('date','2099-10-01','row_count',${count},'summary','{}'::jsonb)),'stop',false) run \\gset
select :'run'::jsonb->>'id' id,:'run'::jsonb->>'file_path' path \\gset
reset role;insert into storage.objects(bucket_id,name) values('reports',:'path');
insert into report_import_chunks(import_id,chunk_no,rows) select :'id'::uuid,(i-1)/1000,jsonb_agg(jsonb_build_object('logical_date','2099-10-01','item_name','SHIRT '||i,'brand','PEPE','barcode','8905875'||lpad(i::text,6,'0'),'quantity',1,'mrp',2999,
  'raw_data',jsonb_build_object('LOT CODE',(700000+i)::text,'LOT NUMBER','PP26-'||(i%300),'ADDITIONAL ITEM CODE','8905875'||lpad(i::text,6,'0'),'PURCHASE RATE','1,404.10','BASIC RATE',case when i%7=0 then 'n/a' else '1337.24' end,'HSN CODE','6205','ITEM NAME','SHIRT '||i,'SUPPLIER','VIKASH'))) from generate_series(1,${count}) i group by (i-1)/1000;
set local role authenticated;set local statement_timeout='8s';
`;
const visible=`(select count(*) from stock_rows k join reports r on r.id=k.report_id and r.is_current where r.import_id=:'id')`;
test('50,073-row stock file publishes in parts, each inside the 8s limit, hidden until the final step',()=>{
 const r=sql(`${logicSetup(50073)}
\\timing on
select publish_stock_import_part(:'id')->>'remaining';
select publish_stock_import_part(:'id')->>'remaining';
select publish_stock_import_part(:'id')->>'remaining';
select publish_stock_import_part(:'id')->>'remaining';
select publish_stock_import_part(:'id')->>'remaining';
select publish_stock_import_part(:'id')->>'remaining';
\\timing off
select ${visible};
\\timing on
select commit_stock_report_import(:'id')->>'ok';
\\timing off
select ${visible};
select count(*) filter (where purchase_rate=1404.10 and lot_code=(700000+substring(item_name from 7)::int)::text and lot_number like 'PP26-%' and article_code=barcode and hsn_code='6205'),
       count(*) filter (where basic_rate is null), count(*) filter (where basic_rate=1337.24) from stock_rows where report_id in (select id from reports where import_id=:'id');
select commit_stock_report_import(:'id')->>'ok';
select count(*) from reports where import_id=:'id';rollback;`);
 const lines=r.split('\n');const times=lines.filter(l=>l.startsWith('Time:')).map(l=>Number(l.match(/([\d.]+) ms/)[1]));
 const values=lines.filter(l=>!l.startsWith('Time:'));
 console.log(`parts ms: ${times.slice(0,6).map(Math.round).join(', ')}; final step ms: ${Math.round(times[6])}`);
 assert.deepEqual(values,['41','31','21','11','1','0','0','true','50073','50073|7153|42920','true','1']);
 // Each part is one fifth of the work that timed out; the final step only flips the version.
 assert.ok(Math.max(...times.slice(0,6))<Math.max(400,times[6]*20));
});
test('A failed part resumes on retry without duplicate rows; the derive trigger still runs for other inserts',()=>{
 const r=sql(`${logicSetup(25000,'f')}
select publish_stock_import_part(:'id')->>'remaining';
select publish_stock_import_part(:'id')->>'remaining';
select fail_report_import(:'id');
select publish_stock_import_part(:'id')->>'ok';
select begin_report_import((select id from stores where code='GP'),'stock',repeat('f',64),'GP OCT STOCK.xlsx',jsonb_build_array(jsonb_build_object('date','2099-10-01','row_count',25000,'summary','{}'::jsonb)),'stop',false)->>'status';
select publish_stock_import_part(:'id')->>'remaining';
select commit_stock_report_import(:'id')->>'ok';
select ${visible}, count(distinct k.barcode) from stock_rows k where k.report_id in (select id from reports where import_id=:'id');
reset role;
select current_setting('app.stock_rows_derived', true);
insert into stock_rows(report_id,store_id,stock_month,item_name,quantity,raw_data) select id,store_id,'2099-10-01','Trigger check',1,'{"PURCHASE RATE":"₹ 1,200.50","LOT CODE":" 9 "}' from reports where import_id=:'id' returning purchase_rate, lot_code;
rollback;`);
 assert.deepEqual(r.split('\n'),['15','5','','false','processing','0','true','25000|25000','off','1200.50|9']);
});
test('Final step refuses when another current report for the month appeared meanwhile; nothing becomes current',()=>{
 const r=sql(`${logicSetup(3000,'a')}
select publish_stock_import_part(:'id')->>'remaining';
reset role;insert into reports(store_id,report_type,report_date,period_month,file_name,status,row_count,is_current) values((select id from stores where code='GP'),'stock','2099-10-02','2099-10-01','other.xlsx','processed',1,true);
set local role authenticated;
select commit_stock_report_import(:'id')->>'message';
select ${visible};rollback;`);
 assert.deepEqual(r.split('\n'),['0','An active report already exists. Use owner correction. No partial report was published.','0']);
});
test('Publishing parts is not available anonymously; the internal row writer is not callable by users',()=>{
 assert.equal(sql("select has_function_privilege('anon','public.publish_stock_import_part(uuid)','EXECUTE');"),'f');
 assert.equal(sql("select has_function_privilege('authenticated','public.insert_staged_stock_rows(uuid,uuid,uuid,date,integer[])','EXECUTE');"),'f');
});
