import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './helpers/app-fixture.mjs';

const input=()=>({file:new File(['original workbook bytes'],'sales.xlsx'),storeId:'gp',type:'sales',manifest:[{date:'2026-01-01',row_count:1,summary:{}}],rows:[{logical_date:'2026-01-01',net_sale:100}]});
test('H02 upload failure never publishes a report and preserves retry state',async()=>{
 const f=fixture({role:'owner'});f.failWhen((table,operation)=>table==='storage'&&operation==='upload');
 const result=await f.load('@/lib/reports/import-lifecycle').importReportFile(input());
 assert.equal(result.ok,false);assert.equal(f.db.reports.length,0);assert.equal(f.db.sales_rows.length,0);
 assert.equal(f.db.report_imports[0].status,'failed');
 f.failWhen(()=>false);
 assert.equal((await f.load('@/lib/reports/import-lifecycle').importReportFile(input())).ok,true);
 assert.equal(f.db.reports.length,1);assert.equal(f.db.sales_rows.length,1);
});
test('H02 lost successful commit response is retryable without duplicate rows',async()=>{
 const f=fixture({role:'owner'});const rpc=f.client.rpc;let once=true;
 f.client.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='commit_report_import'&&once){once=false;return {data:null,error:{message:'Connection interrupted'}};}return result;};
 const action=f.load('@/lib/reports/import-lifecycle').importReportFile;
 assert.equal((await action(input())).ok,false);
 assert.equal(f.db.report_imports[0].status,'processed');
 assert.equal((await action(input())).ok,true);
 assert.equal(f.db.reports.length,1);assert.equal(f.db.sales_rows.length,1);
});
test('H09 invalid replacement parsing leaves the original version untouched',async()=>{
 const f=fixture({role:'owner'});
 f.db.reports.push({id:'old',report_type:'sales',store_id:'gp',report_date:'2026-01-01',file_path:'original.xlsx',is_current:true});
 f.files.set('original.xlsx','original bytes');
 const before=JSON.stringify(f.db);const data=new FormData();data.set('reportId','old');data.set('confirmation','REPLACE SALES 2026-01-01');data.set('file',new File(['invalid'],'bad.csv'));
 const result=await f.load('@/lib/reports/sales-correction').replaceSalesReport({ok:false,message:''},data);
 assert.equal(result.ok,false);assert.equal(JSON.stringify(f.db),before);assert.equal(f.files.get('original.xlsx'),'original bytes');
});
test('H02 staging retry verifies immutable uploaded bytes before resuming',async()=>{
 const f=fixture({role:'owner'});const rpc=f.client.rpc;let once=true;
 f.client.rpc=async(name,args)=>{if(name==='stage_report_chunk'&&once){once=false;return {data:null,error:{message:'Interrupted'}};}return rpc(name,args);};
 const action=f.load('@/lib/reports/import-lifecycle').importReportFile;
 assert.equal((await action(input())).ok,false);
 assert.equal((await action(input())).ok,true);
 assert.equal(f.db.sales_rows.length,1);
});
test('H02 retry refuses a different object at the reserved original path',async()=>{
 const f=fixture({role:'owner'});const rpc=f.client.rpc;
 f.client.rpc=async(name,args)=>name==='stage_report_chunk'?{data:null,error:{message:'Interrupted'}}:rpc(name,args);
 const action=f.load('@/lib/reports/import-lifecycle').importReportFile;
 assert.equal((await action(input())).ok,false);
 f.files.set(f.db.report_imports[0].file_path,'different original bytes');f.client.rpc=rpc;
 assert.equal((await action(input())).ok,false);
 assert.equal(f.db.reports.length,0);
});

test('Stock RPC diagnostics identify timeout phase without exposing database details or uploaded values',async()=>{
 const events=[];
 const f=fixture({role:'owner',globals:{console:{info:(...args)=>events.push(args),error:(...args)=>events.push(args)}}});
 const rpc=f.client.rpc;
 f.client.rpc=async(name,args)=>name==='commit_report_import'?{data:null,error:{code:'57014',message:'private workbook value',details:'sensitive credential'}}:rpc(name,args);
 const result=await f.load('@/lib/reports/import-lifecycle').importReportFile(input());
 assert.equal(result.ok,false);
 assert.equal(events[0][0],'report_import_failed');assert.equal(events[0][1].phase,'commit');assert.equal(events[0][1].code,'57014');
 assert.equal(JSON.stringify(events).includes('private workbook'),false);assert.equal(JSON.stringify(events).includes('sensitive credential'),false);
 assert.equal(f.db.reports.length,0);
});
