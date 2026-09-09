// Run the worker with only files included in Next's production trace.
import { readFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
const root=process.cwd(),trace=path.join(root,'.next/server/app/app/reports/correction/page.js.nft.json');
const temp=mkdtempSync(path.join(tmpdir(),'retail-parser-artifact-'));
try {
 const files=JSON.parse(readFileSync(trace,'utf8')).files;
 let count=0;
 for(const entry of files){const source=path.resolve(path.dirname(trace),entry);const relative=path.relative(root,source);
  if(!['lib/spreadsheets/worker.cjs','node_modules/xlsx/','node_modules/jszip/'].some(prefix=>relative.startsWith(prefix)))continue;
  const target=path.join(temp,relative);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(source,target);count++;
 }
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Name','Amount'],['Fixture',100]]),'Payroll');
 const worker=spawn(process.execPath,['--max-old-space-size=256',path.join(temp,'lib/spreadsheets/worker.cjs')],{cwd:temp,env:{NODE_ENV:'production'},serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.kill('SIGKILL');reject(Error('Packaged worker timed out'));},15000);worker.once('error',reject);worker.once('exit',()=>{clearTimeout(timer);reject(Error('Packaged worker failed'));});worker.once('message',result=>{clearTimeout(timer);resolve(result);});worker.send({bytes:XLSX.write(book,{type:'buffer'}),name:'fixture.xlsx',mime:''});});
 assert.equal(result.ok,true);assert.deepEqual(result.workbook.SheetNames,['Payroll']);
 console.log(`PASS: isolated production worker parsed XLSX using only ${count} traced files; no project env or other installed packages.`);
}finally{rmSync(temp,{recursive:true,force:true});}
