// Disposable PostgreSQL for the accounts module: applies every migration and
// runs the database tests that need only psql. Never loads .env.local.
// Requires initdb/pg_ctl/psql/pg_isready on PATH.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env={PATH:process.env.PATH,LANG:'en_US.UTF-8',TMPDIR:tmpdir(),PGOPTIONS:'-c client_min_messages=warning',...(process.env.DYLD_LIBRARY_PATH?{DYLD_LIBRARY_PATH:process.env.DYLD_LIBRARY_PATH}:{})};
const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:root,env,stdio:'inherit',...options});
for(const cmd of ['initdb','pg_ctl','psql','pg_isready'])run(cmd,['--version']);
let occupied=false;
try{execFileSync('pg_isready',['-h','127.0.0.1','-p','55439'],{env,stdio:'ignore'});occupied=true;}catch{}
if(occupied)throw new Error('Port 55439 is occupied. Refusing to touch an existing database.');
const temp=mkdtempSync(path.join(tmpdir(),'retail-accounts-'));
const data=path.join(temp,'pgdata');let started=false;
const tests=process.argv.slice(2).length?process.argv.slice(2):['tests/database-safety.test.mjs','tests/accounts-database.test.mjs','tests/accounts-ledger-database.test.mjs','tests/accounts-stock-database.test.mjs'];
try{
 run('initdb',['-D',data,'-A','trust','--no-locale','--encoding=UTF8'],{stdio:'ignore'});
 run('pg_ctl',['-D',data,'-l',path.join(temp,'postgres.log'),'-o',`-h 127.0.0.1 -p 55439 -k ${temp}`,'-w','start'],{stdio:'ignore'});started=true;
 run('createdb',['-h','127.0.0.1','-p','55439','retail_safety']);
 const args=['-X','-q','-h','127.0.0.1','-p','55439','-d','retail_safety','-v','ON_ERROR_STOP=1'];
 run('psql',args,{input:readFileSync(path.join(root,'tests/sql/bootstrap.sql')),stdio:['pipe','inherit','inherit']});
 for(const file of readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())run('psql',[...args,'-f',path.join(root,'supabase/migrations',file)],{stdio:['ignore','ignore','inherit']});
 const scripts=tests.filter(t=>t.startsWith('scripts/')),testFiles=tests.filter(t=>!t.startsWith('scripts/'));
 for(const script of scripts)run(process.execPath,[script]);
 if(testFiles.length)run(process.execPath,['--test',...testFiles]);
}finally{
 if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop'],{stdio:'ignore'});
 rmSync(temp,{recursive:true,force:true});
}
