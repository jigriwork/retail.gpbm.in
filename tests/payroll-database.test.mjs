import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { test } from 'node:test';
const args=['-XqAt','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1'];
const sql=text=>execFileSync('psql',args,{input:`create or replace function pg_temp.check_test(ok boolean) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'Regression assertion failed';end if;end$$;\n${text}`,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const owner='00000000-0000-0000-0000-000000000001',manager='00000000-0000-0000-0000-000000000002';
const gp=sql("select id from stores where code='GP'");
const as=id=>`set local request.jwt.claim.sub=${q(id)};set local request.jwt.claim.role='authenticated';set local role authenticated;`;
sql(`insert into auth.users(id,email) values('${owner}','payroll-owner@example.invalid'),('${manager}','payroll-manager@example.invalid') on conflict do nothing;update profiles set role='owner',is_active=true where id='${owner}';update profiles set role='manager',is_active=true where id='${manager}';`);
const row=(name='Same Name',amount=-100)=>({store_id:gp,staff_name:name,salary_amount:1000,advance:1000-amount,net_payable:amount,status:'ready',raw_data:{},employee_phone:null,whatsapp_phone:null});
function prepare(rows=[row()],key='a',label='monthly salary') {return `select prepare_payroll_import('2026-07-01',${q(label)},${q(key.repeat(64))},'salary.xlsx',${q(JSON.stringify(rows))}) as run \\gset
 select :'run'::jsonb->>'id' as import_id,:'run'::jsonb->>'file_path' as path,:'run'::jsonb->>'comparison_token' as token \\gset
 insert into storage.objects(bucket_id,name) values('payslips',:'path');`;}
const commit=`select commit_payroll_import(:'import_id',true,:'token') as committed \\gset
 select pg_temp.check_test((:'committed'::jsonb->>'ok')::boolean);select :'committed'::jsonb->>'batch_id' as batch_id \\gset
`;
const start=`begin;${as(owner)}`;
const check=condition=>`select pg_temp.check_test(${condition});`;
test('H10 identical workbook is idempotent across retries and source labels',()=>{
 sql(`${start}${prepare()}${commit}
 select prepare_payroll_import('2026-07-01','renamed source',${q('a'.repeat(64))},'renamed.xlsx',${q(JSON.stringify([row()]))}) as retry \\gset
 ${check("(:'retry'::jsonb->>'batch_id')=:'batch_id'")}
 ${check("(select count(*) from payslip_rows where batch_id=:'batch_id'::uuid)=1")}
 ${check("(select count(*) from salary_receivables where batch_id=:'batch_id'::uuid)=1")}
 ${check("(select count(*) from employee_contacts where store_id='"+gp+"' and normalized_staff_name='same name')=1")}
 ${check("commit_payroll_import(:'import_id')=:'committed'::jsonb")}rollback;`);
});
test('H10 revised workbook requires confirmation and preserves current receivable/payment version',()=>{
 sql(`${start}${prepare()}${commit}
 select id as receivable from salary_receivables where batch_id=:'batch_id'::uuid \\gset
 select record_payroll_receivable(:'receivable','partial',40);
 ${prepare([row('Same Name',-120)],'b')}
 ${check("not (commit_payroll_import(:'import_id')->>'ok')::boolean")}
 ${commit}
 ${check("(select count(*) from payroll_run_versions where is_current)=1")}
 ${check("(select count(*) from salary_receivables)=2")}
 ${check("(select balance_amount from salary_receivables where is_current)=80")}
 ${check("(select received_amount from salary_receivables where not is_current)=40")}
 ${check("(select count(*) from storage.objects where bucket_id='payslips')=2")}rollback;`);
});
for(const target of ['payslip_rows','employee_contacts','salary_receivables','audit_logs'])test(`H10 ${target} insertion failure rolls back the complete payroll batch`,()=>{
 sql(`begin;create function pg_temp.inject_failure() returns trigger language plpgsql as $$begin raise exception 'Injected fixture failure';end$$;
 create trigger fixture_failure before insert on public.${target} for each row execute function pg_temp.inject_failure();${as(owner)}${prepare()}
 ${check("not (commit_payroll_import(:'import_id')->>'ok')::boolean")}
 ${check("not exists(select 1 from payslip_batches)")}
 ${check("not exists(select 1 from payslip_rows)")}
 ${check("not exists(select 1 from payroll_run_versions)")}
 reset role;drop trigger fixture_failure on public.${target};${as(owner)}${commit}rollback;`);
});
test('H10 stale revision confirmation cannot overwrite a newer payroll version',()=>{
 sql(`${start}${prepare()}${commit}${prepare([row('Same Name',-120)],'b')}
 select :'import_id' as first_id,:'token' as first_token \\gset
 ${prepare([row('Same Name',-150)],'c')}${commit}
 ${check("not (commit_payroll_import(:'first_id',true,:'first_token')->>'ok')::boolean")}
 ${check("(select receivable_amount from salary_receivables where is_current)=150")}rollback;`);
});
test('H10 revised same-name employees with payments require explicit identity reconciliation',()=>{
 sql(`${start}${prepare()}${commit}select id as debt from salary_receivables where is_current \\gset
 select record_payroll_receivable(:'debt','partial',40);
 ${prepare([row(),row()],'b')}
 ${check("not (commit_payroll_import(:'import_id',true,:'token')->>'ok')::boolean")}
 ${check("(select balance_amount from salary_receivables where is_current)=60")}rollback;`);
});
const pdfStart=`select id as row_id from payslip_rows where batch_id=:'batch_id'::uuid order by id limit 1 \\gset
 select begin_payslip_pdf(:'row_id') as job \\gset
 select :'job'::jsonb->>'id' as job_id,:'job'::jsonb->>'file_path' as pdf_path \\gset
`;
const pdfCommit=`insert into storage.objects(bucket_id,name) values('payslips',:'pdf_path');select finish_payslip_pdf(:'job_id','same-name.pdf');`;
test('H08 duplicate staff names get distinct immutable PDF identities',()=>{
 sql(`${start}${prepare([row(),row()])}${commit}
 select begin_payslip_pdf(id) as job from payslip_rows where batch_id=:'batch_id'::uuid;
 reset role;${check("(select count(distinct file_path) from payslip_pdf_jobs)=2")}
 ${check("(select count(distinct row_id) from payslip_pdf_jobs)=2")}rollback;`);
});
test('H08 regeneration retains original PDF and delivery events; M05 share opened is not sent',()=>{
 sql(`${start}${prepare()}${commit}${pdfStart}${pdfCommit}
 select record_payslip_delivery(:'job_id','share_opened','whatsapp_text');
 ${check("(select sent_status from generated_payslips where id=:'job_id'::uuid)='not_sent'")}
 select record_payslip_delivery(:'job_id','sent','whatsapp_manual');
 select :'job_id' as old_id \\gset
 ${pdfStart}${pdfCommit}
 ${check("(select count(*) from generated_payslips)=2")}
 ${check("(select count(*) from generated_payslips where is_current)=1")}
 ${check("(select sent_status from generated_payslips where id=:'old_id'::uuid)='sent'")}
 ${check("(select count(*) from payslip_delivery_events where generated_id=:'old_id'::uuid)=2")}
 ${check("(select supersedes_id from generated_payslips where is_current)=:'old_id'::uuid")}
 delete from storage.objects where bucket_id='payslips';
 ${check("(select count(*) from storage.objects where bucket_id='payslips')=3")}rollback;`);
});
for(const failure of ['missing PDF','row changed','audit'])test(`H08 failed regeneration (${failure}) preserves the last valid PDF`,()=>{
 const action=failure==='row changed'?`update payslip_rows set warning_message='changed' where id=:'row_id'::uuid;`:
 failure==='audit'?`reset role;create function pg_temp.pdf_failure() returns trigger language plpgsql as $$begin raise exception 'Injected audit failure';end$$;create trigger pdf_failure before insert on audit_logs for each row execute function pg_temp.pdf_failure();${as(owner)}`:'';
 sql(`${start}${prepare()}${commit}${pdfStart}${pdfCommit}select :'job_id' as old_id \\gset
 ${pdfStart}${failure==='missing PDF'?'':"insert into storage.objects(bucket_id,name) values('payslips',:'pdf_path');"}${action}
 select set_config('fixture.job',:'job_id',true);
 do $$begin perform public.finish_payslip_pdf(current_setting('fixture.job')::uuid,'new.pdf');raise exception 'Expected failure' using errcode='XX001';exception when sqlstate 'XX001' then raise;when others then null;end$$;
 ${check("(select id from generated_payslips where is_current)=:'old_id'::uuid")}rollback;`);
});
for(const name of ['prepare_payroll_import','begin_payslip_pdf','sync_payroll_receivables'])test(`Owner-only ${name} denies manager`,()=>{
 const call=name==='prepare_payroll_import'?`prepare_payroll_import('2026-07-01','salary',${q('a'.repeat(64))},'a.xlsx',${q(JSON.stringify([row()]))})`:name==='begin_payslip_pdf'?"begin_payslip_pdf('00000000-0000-0000-0000-000000000000')":'sync_payroll_receivables()';
 assert.throws(()=>sql(`begin;${as(manager)}select ${call};rollback;`),/Owner required/);
});
function parallelSql(input){return new Promise((resolve,reject)=>{const child=spawn('psql',args,{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));child.stdin.end(input);});}
test('H10 simultaneous identical payroll uploads finalize once',async()=>{
 const rows=JSON.stringify([row('Concurrent Fixture')]);const prep=`begin;${as(owner)}select prepare_payroll_import('2099-01-01','concurrency',${q('d'.repeat(64))},'same.xlsx',${q(rows)});commit;`;
 const [left,right]=await Promise.all([parallelSql(prep),parallelSql(prep)]);const a=JSON.parse(left),b=JSON.parse(right);assert.equal(a.id,b.id);
 sql(`begin;${as(owner)}insert into storage.objects(bucket_id,name) values('payslips',${q(a.file_path)});commit;`);
 const commit=`begin;${as(owner)}select commit_payroll_import(${q(a.id)});commit;`;
 const [one,two]=await Promise.all([parallelSql(commit),parallelSql(commit)]);assert.deepEqual(JSON.parse(one),JSON.parse(two));assert.equal(JSON.parse(one).ok,true);
 assert.equal(Number(sql(`select count(*) from payslip_batches where payroll_import_id=${q(a.id)}`)),1);
});
