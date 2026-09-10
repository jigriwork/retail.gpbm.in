// Local measurement only: no Supabase connection or environment files.
import {spawn,execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sizedWorkbook} from './helpers/upload-workbooks.mjs';
import {fixture} from '../tests/helpers/app-fixture.mjs';
const dir=process.argv[2]||'/tmp/retail-direct-upload';mkdirSync(dir,{recursive:true});
if(process.argv[3]==='child'){
 const data=readFileSync(process.argv[4]),start=performance.now();const result=await fixture().load('@/lib/reports/sales-parser').parseSalesFileDetailed(new File([data],'benchmark.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 process.send({rows:result.rows.length,seconds:(performance.now()-start)/1000});
}else{
 const results=[];
 for(const size of [1000000,4500000,6000000,15*1024*1024]){
  const {bytes,rows}=await sizedWorkbook(size),file=path.join(dir,`workbook-${size}.xlsx`);writeFileSync(file,bytes);
  let peak=0;const child=spawn(process.execPath,[process.argv[1],dir,'child',file],{env:{PATH:process.env.PATH,TZ:'Asia/Kolkata'},stdio:['ignore','ignore','ignore','ipc']});
  const sample=setInterval(()=>{try{const all=execFileSync('ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));const pids=new Set([child.pid]);let added;do{added=false;for(const [pid,ppid]of all)if(pids.has(ppid)&&!pids.has(pid)){pids.add(pid);added=true;}}while(added);peak=Math.max(peak,all.filter(([pid])=>pids.has(pid)).reduce((n,r)=>n+r[2],0));}catch{}},20);
  const result=await new Promise((resolve,reject)=>{child.on('message',resolve);child.on('exit',code=>{clearInterval(sample);if(code)reject(Error('Processing benchmark failed'));});child.on('error',reject);});
  await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));assert.equal(result.rows,rows);
  results.push({bytes:size,rows,parseSeconds:Number(result.seconds.toFixed(3)),peakProcessTreeMiB:Number((peak/1024).toFixed(1))});
 }
 writeFileSync(path.join(dir,'processing-measurements.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}
