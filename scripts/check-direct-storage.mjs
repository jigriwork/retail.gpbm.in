// Real local Auth + TUS + Storage + application finalization. Never loads .env.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {Upload} from 'tus-js-client';
import {fixture} from '../tests/helpers/app-fixture.mjs';
const dir=process.argv[2]||'/tmp/retail-direct-upload',config=JSON.parse(readFileSync(dir+'/local-status.json'));
assert.equal(config.API_URL,'http://127.0.0.1:55721');
const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const ok=r=>{if(r.error)throw Error('Isolated request: '+r.error.message);return r.data;};
const email=`direct-${randomUUID()}@example.invalid`,password=randomUUID()+'Aa9!';const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
ok(await admin.from('profiles').update({role:'owner',is_active:true}).eq('id',user.id));
const client=createClient(config.API_URL,config.ANON_KEY,options);const session=ok(await client.auth.signInWithPassword({email,password})).session;
const stores=ok(await client.from('stores').select('*')),gp=stores.find(s=>s.code==='GP');
const profile=ok(await client.from('profiles').select('*').eq('id',user.id).single());
const f=fixture({directUploads:true,modules:{'@/lib/supabase/server':{createClient:async()=>client,createAdminClient:()=>admin},'@/lib/auth/session':{requireProfile:async()=>({profile,user}),requireOwner:async()=>({profile,user}),canAccessStore:async id=>stores.some(s=>s.id===id&&s.is_active),getAccessibleStores:async()=>stores}},globals:{fetch}});
const results=[];let oldReport;
for(const size of [1000000,4500000,6000000,15*1024*1024]){
 const bytes=readFileSync(`${dir}/workbook-${size}.xlsx`),file={name:`fixture-${size}.xlsx`,size,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sha256:createHash('sha256').update(bytes).digest('hex')};
 const kind=oldReport?'sales-replacement':'sales';const form=new FormData();if(oldReport){form.set('reportId',oldReport);form.set('confirmation','REPLACE SALES 2099-01-01');}else{form.set('storeId',gp.id);form.set('reportDate','2099-01-01');}
 const intent=await f.load('@/lib/uploads/server').prepareUpload(kind,file,form);ok(await client.rpc('start_upload_intent',{p_id:intent.id}));
 let offset=0,interrupted=false,uploadUrl;const start=performance.now();
 await new Promise((resolve,reject)=>{
  const options={endpoint:config.API_URL+'/storage/v1/upload/resumable',chunkSize:6*1024*1024,uploadDataDuringCreation:true,retryDelays:[0,100,300],headers:{authorization:'Bearer '+session.access_token,'x-upsert':'false'},metadata:{bucketName:intent.bucket,objectName:intent.path,contentType:intent.mime},onError:reject,onSuccess:resolve,onChunkComplete:async(_chunk,sent)=>{
   offset=Math.max(offset,sent);
   if(size===15*1024*1024&&!interrupted&&sent<size){interrupted=true;uploadUrl=upload.url;await upload.abort(false);setTimeout(()=>{const resumed=new Upload(bytes,{...options,uploadUrl,onChunkComplete:(_n,s)=>{offset=Math.max(offset,s);}});resumed.start();},100);}
  }};
  const upload=new Upload(bytes,options);upload.start();
 });
 const uploadSeconds=(performance.now()-start)/1000;assert.equal(offset,size);
 form.set('uploadIntentId',intent.id);
 const wire=new Request('http://localhost/',{method:'POST',body:form});const payloadBytes=(await wire.arrayBuffer()).byteLength;assert.ok(payloadBytes<4096);
 const processStart=performance.now();const action=oldReport?f.load('@/lib/reports/sales-correction').replaceSalesReport:f.load('@/lib/reports/sales-actions').uploadSalesReport;
 const state=await action({ok:false,message:''},form);assert.equal(state.ok,true,state.message);
 const stored=ok(await client.from('upload_intents').select('status,report_import_id').eq('id',intent.id).single());assert.equal(stored.status,'processed');
 const report=ok(await client.from('reports').select('id,file_path').eq('import_id',stored.report_import_id).eq('is_current',true).single());assert.equal(report.file_path,intent.path);oldReport=report.id;
 const replay=await action({ok:false,message:''},form);assert.equal(replay.ok,true);assert.equal(ok(await client.from('reports').select('id').eq('import_id',stored.report_import_id)).length,1);
 results.push({bytes:size,payloadBytes,uploadSeconds:Number(uploadSeconds.toFixed(3)),processingSeconds:Number(((performance.now()-processStart)/1000).toFixed(3)),interruptedAndResumed:interrupted});
}
// Real simultaneous HTTP claims: exactly one lease, then fail safely without
// publishing a business record. Existing fixture sources remain immutable.
const original=readFileSync(`${dir}/workbook-1000000.xlsx`),probeForm=new FormData();probeForm.set('storeId',gp.id);probeForm.set('reportDate','2099-03-01');
const probe=await f.load('@/lib/uploads/server').prepareUpload('sales',{name:'concurrent.xlsx',size:original.length,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sha256:createHash('sha256').update(original).digest('hex')},probeForm);
ok(await client.storage.from(probe.bucket).upload(probe.path,original,{upsert:false,contentType:probe.mime}));
const claims=await Promise.all([1,2].map(()=>admin.rpc('claim_upload_intent',{p_id:probe.id,p_actor:user.id,p_kind:'sales',p_request_hash:'concurrent-fixture'})));
assert.equal(claims.filter(r=>!r.error).length,1);const claimed=claims.find(r=>!r.error).data;
ok(await admin.rpc('finish_upload_intent',{p_id:probe.id,p_lease:claimed.lease_id,p_ok:false,p_result:{ok:false,message:'Isolated concurrency fixture complete'}}));
// Exercise photo publication and payroll binding through the same real boundary.
async function uploadSmall(kind, form, name, mime, bytes) {
 const intent=await f.load('@/lib/uploads/server').prepareUpload(kind,{name,mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},form);
 ok(await client.rpc('start_upload_intent',{p_id:intent.id}));
 await new Promise((resolve,reject)=>new Upload(bytes,{endpoint:config.API_URL+'/storage/v1/upload/resumable',chunkSize:6*1024*1024,uploadDataDuringCreation:true,headers:{authorization:'Bearer '+session.access_token,'x-upsert':'false'},metadata:{bucketName:intent.bucket,objectName:intent.path,contentType:intent.mime},onSuccess:resolve,onError:reject}).start());
 form.set('uploadIntentId',intent.id);return intent;
}
const photoForm=new FormData();photoForm.set('storeId',gp.id);photoForm.set('reviewDate','2099-04-01');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=','base64');
const photoIntent=await uploadSmall('rack',photoForm,'fixture.png','image/png',png);
const photoState=await f.load('@/lib/reviews/actions').saveRackReview({ok:false,message:''},photoForm);assert.equal(photoState.ok,true,photoState.message);
assert.equal(ok(await client.from('upload_intents').select('status').eq('id',photoIntent.id).single()).status,'processed');
const payrollForm=new FormData();payrollForm.set('salaryMonth','2099-04');payrollForm.set('fallbackStoreId',gp.id);payrollForm.set('sourceLabel','isolated direct fixture');
const payrollIntent=await uploadSmall('payroll',payrollForm,'payroll.csv','text/csv',Buffer.from('Name,Salary,Net Payable,Store\nDirect Fixture Employee,1000,1000,GP\n'));
const payrollState=await f.load('@/lib/payslips/import').processPayrollUpload(payrollForm);assert.equal(payrollState.ok,true,payrollState.message);
assert.equal(ok(await client.from('upload_intents').select('status').eq('id',payrollIntent.id).single()).status,'processed');
assert.equal((await f.load('@/lib/payslips/import').processPayrollUpload(payrollForm)).batchId,payrollState.batchId);
console.log('PASS: real concurrent claims, atomic photo publication, payroll binding and consumed retry.');
writeFileSync(dir+'/direct-storage-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
// Private, local-only browser credentials: caller may use these for a loopback
// browser rehearsal; never commit or print the file.
writeFileSync(dir+'/browser-fixture.json',JSON.stringify({email,password}),{mode:0o600});
