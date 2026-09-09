// Starts a disposable database on fixed loopback ports. Never loads .env.local.
// Requires existing initdb/pg_ctl/psql/pg_isready and postgrest on PATH.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env={PATH:process.env.PATH,LANG:'en_US.UTF-8',TMPDIR:tmpdir(),...(process.env.DYLD_LIBRARY_PATH?{DYLD_LIBRARY_PATH:process.env.DYLD_LIBRARY_PATH}:{})};
const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:root,env,stdio:'inherit',...options});
for(const cmd of ['initdb','pg_ctl','psql','pg_isready','postgrest'])run(cmd,['--version']);
let occupied=false;
try{execFileSync('pg_isready',['-h','127.0.0.1','-p','55439'],{env,stdio:'ignore'});occupied=true;}catch{}
if(occupied)throw new Error('Port 55439 is occupied. Refusing to touch an existing database.');
const temp=mkdtempSync(path.join(tmpdir(),'retail-safety-'));
const data=path.join(temp,'pgdata');let started=false,rest;
try{
 run('initdb',['-D',data,'-A','trust','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',path.join(temp,'postgres.log'),'-o',`-h 127.0.0.1 -p 55439 -k ${temp}`,'-w','start']);started=true;
 run('createdb',['-h','127.0.0.1','-p','55439','retail_safety']);
 const args=['-X','-q','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1'];
 run('psql',args,{input:readFileSync(path.join(root,'tests/sql/bootstrap.sql')),stdio:['pipe','inherit','inherit']});
 run(process.execPath,['scripts/check-payroll-migration.mjs']);
 for(const file of readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())run('psql',[...args,'-f',path.join(root,'supabase/migrations',file)]);
 run(process.execPath,['--test','tests/database-safety.test.mjs']);
 rest=spawn('postgrest',[],{cwd:root,env:{...env,PGRST_DB_URI:'postgresql://authenticator@127.0.0.1:55439/retail_safety',PGRST_DB_SCHEMAS:'public,storage',PGRST_DB_ANON_ROLE:'anon',PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55440',PGRST_JWT_SECRET:'isolated-fixture-secret-never-use-in-production'},stdio:'ignore'});
 let ready=false;
 for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:55440/');ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
 if(!ready)throw new Error('Local PostgREST did not start.');
 run(process.execPath,['--test','tests/postgrest-safety.test.mjs']);
 run(process.execPath,['--test','tests/payroll-database.test.mjs']);
 run(process.execPath,['--test','tests/security-recovery.test.mjs','tests/analytics-safety.test.mjs','tests/import-lifecycle.test.mjs','tests/spreadsheet-security.test.mjs','tests/payroll-workflows.test.mjs']);
}finally{
 if(rest && rest.exitCode===null){rest.kill('SIGTERM');await new Promise(resolve=>rest.once('exit',resolve));}
 if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
 rmSync(temp,{recursive:true,force:true});
}
