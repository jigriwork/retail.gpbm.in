import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { fixture } from './helpers/app-fixture.mjs';
const kind='sales',mime='text/csv';
const metadata=bytes=>({name:'fixture.csv',size:bytes,mime,sha256:'a'.repeat(64)});
for(const bytes of [1000000,4500000,6000000,15*1024*1024])test(`Direct upload accepts ${bytes} bytes metadata without file payload`,()=>{
 const v=fixture({directUploads:true}).load('@/lib/uploads/validation');assert.equal(v.validateUpload(kind,metadata(bytes)).size,bytes);
 const form=new FormData();form.set('uploadIntentId','00000000-0000-0000-0000-000000000001');form.set('storeId','gp');v.metadataOnly(form);
 assert.ok(JSON.stringify([...form.entries()]).length<256);
});
for(const [name,change]of [['oversize',{size:15*1024*1024+1}],['MIME mismatch',{mime:'text/html'}],['malicious extension',{name:'fixture.html'}],['path filename',{name:'../fixture.csv'}],['bad fingerprint',{sha256:'forged'}]])test(`Direct upload rejects ${name}`,()=>{
 assert.throws(()=>fixture({directUploads:true}).load('@/lib/uploads/validation').validateUpload(kind,{...metadata(100),...change}));
});
test('Server Action rejects File bytes and oversized metadata',()=>{
 const v=fixture({directUploads:true}).load('@/lib/uploads/validation');const form=new FormData();form.set('file',new File(['bytes'],'test.csv'));assert.throws(()=>v.metadataOnly(form));form.delete('file');form.set('notes','x'.repeat(33000));assert.throws(()=>v.metadataOnly(form));
});
function setup(options={}){
 const f=fixture({directUploads:true,...options});const data='Name,Amount\nFixture,100\n';
 const intent={id:'intent',actor_id:'actor',store_id:'gp',kind,bucket:'reports',file_path:'uploads/gp/unique.csv',file_name:'fixture.csv',mime_type:mime,byte_size:Buffer.byteLength(data),fingerprint:createHash('sha256').update(data).digest('hex'),status:'processing',lease_id:'lease'};
 const calls=[];f.client.rpc=async(name,args)=>{calls.push({name,args});return {data:name==='claim_upload_intent'?intent:null,error:null};};
 f.client.storage.from=()=>({download:async path=>({data:path===intent.file_path?new Blob([data],{type:mime}):null,error:null})});
 const form=new FormData();form.set('storeId','gp');form.set('uploadIntentId','intent');
 return {...f,intent,form,calls};
}
for(const [name,options]of [['anonymous',{anonymous:true}],['inactive',{active:false}],['unassigned',{assigned:[]}],['cross-store',{assigned:['bm']} ]])test(`Finalization denies ${name} user before privileged claim`,async()=>{
 const f=setup(options);let executed=false;const r=await f.load('@/lib/uploads/server').withDirectUpload(f.form,kind,async()=>{executed=true;return {ok:true,message:'Done'};});assert.equal(r.ok,false);assert.equal(executed,false);assert.equal(f.calls.length,0);
});
for(const role of ['manager','owner'])test(`Authorized ${role} verifies stored bytes and supplies trusted File internally`,async()=>{
 const f=setup({role});const r=await f.load('@/lib/uploads/server').withDirectUpload(f.form,kind,async form=>{assert.ok(form.get('file') instanceof File);assert.equal(f.load('@/lib/uploads/server').verifiedSource(form.get('file')).id,'intent');return {ok:true,message:'Done'};});assert.equal(r.ok,true);assert.ok(f.calls.some(c=>c.name==='verify_upload_intent'));assert.ok(f.calls.some(c=>c.name==='finish_upload_intent'&&c.args.p_ok));
});
for(const reason of ['fingerprint','missing','path-store','parser'])test(`Finalization ${reason} failure retains source and fails attempt`,async()=>{
 const f=setup();if(reason==='fingerprint')f.intent.fingerprint='b'.repeat(64);if(reason==='missing')f.client.storage.from=()=>({download:async()=>({data:null,error:{}})});if(reason==='path-store')f.intent.store_id='bm';
 let execute=0;const r=await f.load('@/lib/uploads/server').withDirectUpload(f.form,kind,async()=>{execute++;throw Error('Parser rejected workbook');});assert.equal(r.ok,false);assert.equal(execute,reason==='parser'?1:0);assert.ok(f.calls.some(c=>c.name==='finish_upload_intent'&&!c.args.p_ok));
});
test('Browser-supplied object path never selects downloaded object',async()=>{
 const f=setup();f.form.set('path','other-store/secrets.csv');let requested;f.client.storage.from=()=>({download:async path=>{requested=path;return {data:null,error:{}};}});await f.load('@/lib/uploads/server').withDirectUpload(f.form,kind,async()=>({ok:true,message:'Done'}));assert.equal(requested,'uploads/gp/unique.csv');
});
test('Consumed intent returns cached completion without parsing or mutating',async()=>{
 const f=setup();f.intent.status='processed';f.intent.result={ok:true,message:'Already done'};let calls=0;const r=await f.load('@/lib/uploads/server').withDirectUpload(f.form,kind,async()=>{calls++;return {ok:true,message:''};});assert.equal(calls,0);assert.equal(r.message,'Already done');assert.equal(f.calls.length,1);
});
test('Concurrent or expired claim is denied without executing business handler',async()=>{
 const f=setup();f.client.rpc=async()=>({data:null,error:{message:'lease active or expired'}});let called=false;const r=await f.load('@/lib/uploads/server').withDirectUpload(f.form,kind,async()=>{called=true;return {ok:true,message:''};});assert.equal(r.ok,false);assert.equal(called,false);
});

test('Browser TUS sets one authorization header per request and resumes saved uploads',async()=>{
 const headers=[];let resumed=false;const progress=[];
 const session={user:{id:'actor'},access_token:'local-fixture-token'};
 class MockUpload {
  constructor(_file,options){this.options=options;assert.equal(options.headers.authorization,undefined);assert.equal(options.headers['x-upsert'],'false');assert.equal(options.chunkSize,6*1024*1024);}
  async findPreviousUploads(){return [{uploadUrl:'http://localhost/resume'}];}
  resumeFromPreviousUpload(){resumed=true;}
  async start(){await this.options.onBeforeRequest({setHeader:(key,value)=>headers.push([key,value])});this.options.onProgress(10,10);this.options.onSuccess();}
 }
 const intent={id:'intent',bucket:'reports',path:'uploads/gp/unique.csv',mime:'text/csv',status:'created'};
 const f=fixture({directUploads:true,modules:{'tus-js-client':{Upload:MockUpload},'@/lib/supabase/client':{createClient:()=>({auth:{getSession:async()=>({data:{session}})},rpc:async()=>({error:null})})},'@/lib/uploads/actions':{createDirectUpload:async()=>intent}},globals:{crypto:(await import('node:crypto')).webcrypto,localStorage:{getItem:()=>null,setItem(){}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'http://localhost:55721'}}}});
 const form=new FormData();form.set('storeId','gp');form.set('file',new File(['name,total\nA,1'],'fixture.csv',{type:'text/csv'}));
 const result=await f.load('@/lib/uploads/browser').transferDirect(form,'sales',p=>progress.push(p));
 assert.equal(headers.length,1);assert.equal(headers[0][0],'authorization');assert.equal(resumed,true);assert.equal(result.get('uploadIntentId'),'intent');assert.equal(result.get('file'),null);assert.equal(progress.at(-1).percent,100);
});

test('Payslip PDF download redirects to a short-lived private URL without proxying bytes',async()=>{
 const f=fixture({role:'owner',globals:{Response,Request}});f.db.generated_payslips[0].is_current=true;f.db.generated_payslips[0].pdf_file_path='retained.pdf';
 f.client.storage.from=bucket=>({createSignedUrl:async(path,seconds)=>{assert.equal(bucket,'payslips');assert.equal(path,'retained.pdf');assert.equal(seconds,60);return {data:{signedUrl:'http://localhost/private.pdf'},error:null};}});
 const response=await f.load('@/app/app/payslips/[batchId]/rows/[rowId]/download/route').GET(new Request('http://localhost/download'),{params:Promise.resolve({batchId:'jan',rowId:'a1'})});
 assert.equal(response.status,303);assert.equal(await response.text(),'');
});
test('Large ZIP is stored at a unique immutable path and redirected, never returned through Next',async()=>{
 const f=fixture({role:'owner',globals:{Response,Request},modules:{'@/lib/payslips/zip':{buildPayslipZip:async()=>({ok:true,bytes:new Uint8Array(5*1024*1024)})}}});
 f.db.payslip_batches=[{id:'jan',salary_month:'2099-01-01'}];f.db.generated_payslips[0].is_current=true;
 const paths=[];f.client.storage.from=()=>({upload:async(path,bytes,options)=>{assert.equal(options.upsert,false);assert.equal(bytes.length,5*1024*1024);paths.push(path);return {error:null};},createSignedUrl:async(_path,seconds)=>{assert.equal(seconds,60);return {data:{signedUrl:'http://localhost/private.zip'},error:null};}});
 const route=f.load('@/app/app/payslips/[batchId]/zip/route');
 for(let i=0;i<2;i++){const response=await route.GET(new Request('http://localhost/zip'),{params:Promise.resolve({batchId:'jan'})});assert.equal(response.status,303);assert.equal(await response.text(),'');}
 assert.notEqual(paths[0],paths[1]);assert.ok(paths.every(path=>path.startsWith('exports/jan/')));
});
test('Private PDF and ZIP redirects deny anonymous, inactive owners and managers',async()=>{
 for(const options of [{anonymous:true},{role:'owner',active:false},{role:'manager'}]){
  const f=fixture({...options,globals:{Response,Request}});
  for(const path of ['@/app/app/payslips/[batchId]/zip/route','@/app/app/payslips/[batchId]/rows/[rowId]/download/route'])assert.equal((await f.load(path).GET(new Request('http://localhost/download'),{params:Promise.resolve({batchId:'jan',rowId:'a1'})})).status,403);
 }
});
