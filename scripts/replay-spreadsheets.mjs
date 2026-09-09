// Read-only genuine-file replay. The baseline engine must be outside the app.
// Usage: node scripts/replay-spreadsheets.mjs FIXTURE_DIR BASELINE_XLSX_DIR [EXTRA_FILES...]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=process.cwd();
const [directory,baselineEngine,...extra]=process.argv.slice(2);
if(!directory||!baselineEngine)throw Error('Provide genuine fixture directory and isolated baseline engine directory.');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
function loader(baseline){const cache=new Map();return function load(name){
 if(name==='server-only')return {};
 if(name==='xlsx')return require(baseline?path.resolve(baselineEngine):'xlsx');
 if(['date-fns','date-fns-tz'].includes(name)||name.startsWith('node:'))return require(name);
 assert.ok(name.startsWith('@/'),'Unexpected parser dependency');if(cache.has(name))return cache.get(name);
 const relative=name.slice(2)+'.ts';const source=baseline?execFileSync('git',['show',`a540026:${relative}`],{encoding:'utf8'}):readFileSync(path.join(root,relative),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const loaded={exports:{}};vm.runInNewContext('(function(require,module,exports){'+compiled+'})',{File,FormData,Buffer,Date,console,process,setTimeout,clearTimeout})(load,loaded,loaded.exports);cache.set(name,loaded.exports);return loaded.exports;
};}
const old=loader(true),current=loader(false);
const stores=[{id:'gp',name:'Go Planet',code:'GP',firm_name:'Go Planet',is_active:true},{id:'bm',name:'Brand Mark',code:'BM',firm_name:'Go Planet',is_active:true}];
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const canonical=value=>typeof value==='string'?value.replaceAll('\r\n','\n'):Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,canonical(v)])):value;
function metrics(parsed,kind){const rows=parsed.rows??parsed;return {rows:rows.length,quantity:rows.reduce((s,r)=>s+Number(r.quantity??0),0),net:rows.reduce((s,r)=>s+Number(kind==='payslip'?r.net_payable:r.netSale??0),0),returns:rows.filter(r=>Number(r.quantity??0)<0||Number(r.netSale??0)<0).length,dates:digest([...new Set(rows.map(r=>r.saleDate??r.purchaseDate??r.salary_month??null))].sort()),brands:digest(rows.map(r=>r.brand??null)),categories:digest(rows.map(r=>r.category??null)),staff:digest(rows.map(r=>r.staffName??r.staff_name??null))};}
const results=[];
for(const name of [...files(directory).filter(f=>/\.(xlsx|xls|csv)$/i.test(f)),...extra]){
 const bytes=readFileSync(name),file=new File([bytes],path.basename(name));const beforeHash=digest(bytes);const kind=name.includes('/stock/')?'stock':name.includes('/sales')?'sales':'payslip';
 async function parse(load){return kind==='payslip'?await load('@/lib/payslips/parser').parsePayslipWorkbook({buffer:await file.arrayBuffer(),fileName:file.name,salaryMonth:'2026-07-01',stores}):await load(`@/lib/reports/${kind}-parser`)[`parse${kind[0].toUpperCase()+kind.slice(1)}FileDetailed`](file);}
 const before=await parse(old),after=await parse(current);const exact=JSON.stringify(before)===JSON.stringify(after);const normalized=JSON.stringify(canonical(before))===JSON.stringify(canonical(after));
 assert.deepEqual(metrics(before,kind),metrics(after,kind),'Requested business fields differ');assert.ok(normalized,'Unexplained parser difference');assert.equal(digest(readFileSync(name)),beforeHash,'Fixture changed');
 results.push({file:path.basename(name),kind,sha256:createHash('sha256').update(bytes).digest('hex'),exact,lineEndingsOnly:!exact&&normalized,...metrics(after,kind)});
}
const summary={engineBefore:'0.18.5',engineAfter:require('xlsx').version,files:results.length,exact:results.filter(x=>x.exact).length,lineEndingsOnly:results.filter(x=>x.lineEndingsOnly).length,unexplainedDifferences:0,groups:Object.fromEntries(['sales','stock','payslip'].map(kind=>[kind,{files:results.filter(x=>x.kind===kind).length,rows:results.filter(x=>x.kind===kind).reduce((n,x)=>n+x.rows,0)}])),results};
if(process.env.REPLAY_REPORT_PATH)writeFileSync(process.env.REPLAY_REPORT_PATH,JSON.stringify(summary,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({...summary,results:undefined},null,2));
