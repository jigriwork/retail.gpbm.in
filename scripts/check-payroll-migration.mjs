// Rehearse additive payroll migrations on a separate disposable database.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const name='payroll_migration_'+randomUUID().replaceAll('-','');
const connection=['-h','127.0.0.1','-p','55439'];
const run=(cmd,args,input)=>execFileSync(cmd,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const sql=query=>run('psql',['-XqAt',...connection,'-d',name,'-v','ON_ERROR_STOP=1'],query).trim();
run('createdb',[...connection,name]);
try{
 sql(readFileSync('tests/sql/bootstrap.sql','utf8').split('\n').filter(line=>!line.startsWith('create role ')).join('\n'));
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const file of migrations.filter(f=>f<'20260909110000'))sql(readFileSync('supabase/migrations/'+file,'utf8'));
 sql(`insert into auth.users(id,email) values('30000000-0000-0000-0000-000000000001','migration-fixture@example.invalid');
 insert into payslip_batches(id,salary_month,source_file_name) select ('30000000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid,'2026-07-01','legacy-'||n||'.xlsx' from generate_series(1,3)n;
 insert into payslip_rows(id,batch_id,store_id,firm_name,store_name,salary_month,staff_name,salary_amount,net_payable,status)
 select ('30000000-0000-0000-0002-'||lpad(n::text,12,'0'))::uuid,('30000000-0000-0000-0001-'||lpad((1+n%3)::text,12,'0'))::uuid,(select id from stores where code='GP'),'Go Planet','Go Planet','2026-07-01','Fixture Employee',1000,1000,'generated' from generate_series(1,221)n;
 insert into generated_payslips(id,payslip_row_id,batch_id,store_id,firm_name,store_name,salary_month,staff_name,pdf_file_path,sent_status,sent_method,sent_at)
 select ('30000000-0000-0000-0003-'||lpad(n::text,12,'0'))::uuid,('30000000-0000-0000-0002-'||lpad(n::text,12,'0'))::uuid,('30000000-0000-0000-0001-'||lpad((1+n%3)::text,12,'0'))::uuid,(select id from stores where code='GP'),'Go Planet','Go Planet','2026-07-01','Fixture Employee','legacy/'||n||'.pdf','sent','whatsapp_manual','2026-07-31' from generate_series(1,221)n;
 insert into storage.objects(bucket_id,name) select 'payslips','legacy/'||n||case when n<=221 then '.pdf' else '.xlsx' end from generate_series(1,226)n;`);
 const tables=['public.payslip_batches','public.payslip_rows','public.generated_payslips','public.salary_receivables','storage.objects'];
 const snapshots=tables.map(table=>{const [schema,t]=table.split('.');const columns=JSON.parse(sql(`select json_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='${schema}' and table_name='${t}'`));const query=`select coalesce(json_agg(x order by id),'[]') from(select ${columns.map(c=>'"'+c+'"').join(',')} from ${table})x`;return {table,query,digest:createHash('sha256').update(sql(query)).digest('hex')};});
 for(const file of migrations.filter(f=>f>='20260909110000'))sql(readFileSync('supabase/migrations/'+file,'utf8'));
 for(const before of snapshots)assert.equal(createHash('sha256').update(sql(before.query)).digest('hex'),before.digest,`${before.table} changed`);
 assert.equal(sql('select count(*) from generated_payslips'),'221');assert.equal(sql("select count(*) from storage.objects where bucket_id='payslips'"),'226');
 assert.equal(sql('select count(*) from payslip_batches where payroll_import_id is null'),'3');assert.equal(sql('select count(*) from payroll_runs'),'0');
 console.log('PASS: migration rehearsal preserves every existing payroll field, 221 generated records, 226 Storage objects and three separate July batches.');
}finally{run('dropdb',[...connection,name]);}
