import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const sql=q=>execFileSync('psql',['-XqAt','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const owner='00000000-0000-0000-0000-000000000001';
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
