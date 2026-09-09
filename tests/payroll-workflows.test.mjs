import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './helpers/app-fixture.mjs';
test('M05 opening WhatsApp records share opened without delivery confirmation',async()=>{
 const f=fixture({role:'owner'});const calls=[];f.client.rpc=async(name,args)=>{calls.push({name,args});return {error:null};};
 await f.load('@/lib/payslips/actions').markPayslipWhatsAppTextSent('pdf');
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_kind,'share_opened');
 await f.load('@/lib/payslips/actions').markPayslipSent('pdf');assert.equal(calls[1].args.p_kind,'sent');
});
for(const failure of ['render','upload','finalize'])test(`H08 ${failure} failure retains last valid PDF`,async()=>{
 const f=fixture({role:'owner',modules:{'@/lib/payslips/pdf':{renderPayslipPdf:async()=>{if(failure==='render')throw Error('fail');return new Uint8Array([1,2,3]);}}}});
 f.db.generated_payslips=[{id:'old',payslip_row_id:'row',is_current:true,pdf_file_path:'old.pdf',sent_status:'sent'}];f.files.set('old.pdf','original');
 f.client.rpc=async(name)=>name==='begin_payslip_pdf'?{data:{id:'version',file_path:'generated/batch/row/version.pdf',row_snapshot:{id:'row',batch_id:'batch',store_id:'gp',store_name:'GP',staff_name:'Same Name',salary_month:'2026-07-01',salary_amount:1000}},error:null}:{data:null,error:{message:'failure'}};
 if(failure==='upload')f.failWhen((table,operation)=>table==='storage'&&operation==='upload');
 const form=new FormData();form.set('rowId','row');
 assert.equal((await f.load('@/lib/payslips/actions').generatePayslipForRow({ok:false,message:''},form)).ok,false);
 assert.equal(f.db.generated_payslips[0].is_current,true);assert.equal(f.db.generated_payslips[0].sent_status,'sent');assert.equal(f.files.get('old.pdf'),'original');
});
test('M06 ZIP uses bounded concurrency and distinct entry identities for duplicate names',async()=>{
 const f=fixture();const zip=f.load('@/lib/payslips/zip').buildPayslipZip;let active=0,max=0;
 const items=Array.from({length:13},(_,i)=>({id:`row-${i}`,pdf_file_name:'same.pdf',pdf_file_path:`${i}.pdf`}));
 const result=await zip(items,async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,3));active--;return {data:new Blob(['PDF']),error:null};});
 assert.equal(result.ok,true);assert.equal(max,4);
 const JSZip=(await import('jszip')).default;const archive=await JSZip.loadAsync(result.bytes);assert.equal(Object.keys(archive.files).length,13);
});
test('M06 ZIP reports every failed PDF instead of returning a partial archive',async()=>{
 const zip=fixture().load('@/lib/payslips/zip').buildPayslipZip;
 const result=await zip([{id:'good',pdf_file_path:'good'},{id:'bad',pdf_file_path:'bad'},{id:'missing',pdf_file_path:null}],async path=>({data:path==='good'?new Blob(['PDF']):null,error:path!=='good'}));
 assert.equal(result.ok,false);assert.deepEqual([...result.failures].sort(),['bad','missing']);assert.equal(result.bytes,undefined);
});
for(const source of ['identical','missing'])test(`H10 legacy source ${source} never creates another batch`,async()=>{
 const f=fixture({role:'owner',modules:{'@/lib/payslips/parser':{parsePayslipWorkbook:async()=>[{staff_name:'Fixture',store_id:'gp'}]}}});
 f.db.payslip_batches=[{id:'legacy',salary_month:'2026-07-01',status:'generated',payroll_import_id:null,source_file_path:'original.xlsx'}];
 if(source==='identical')f.files.set('original.xlsx','original fixture');
 let mutations=0;f.client.rpc=async()=>{mutations++;throw Error('Must not prepare');};
 const form=new FormData();form.set('salaryMonth','2026-07');form.set('file',new File(['original fixture'],'renamed.xlsx'));
 const result=await f.load('@/lib/payslips/import').processPayrollUpload(form);
 assert.equal(result.ok,source==='identical');assert.equal(result.batchId,source==='identical'?'legacy':undefined);
 assert.equal(mutations,0);assert.equal(f.db.payslip_batches.length,1);assert.equal(f.calls.filter(c=>c.operation==='upload').length,0);
});
test('H06 payroll parser failure cannot prepare or publish a batch',async()=>{
 const f=fixture({role:'owner',modules:{'@/lib/payslips/parser':{parsePayslipWorkbook:async()=>{throw Error('Malformed workbook');}}}});
 let calls=0;f.client.rpc=async()=>{calls++;throw Error('Must not prepare');};
 const form=new FormData();form.set('salaryMonth','2026-07');form.set('file',new File(['hostile'],'bad.xlsx'));
 assert.equal((await f.load('@/lib/payslips/import').processPayrollUpload(form)).ok,false);assert.equal(calls,0);
 assert.equal(f.calls.filter(c=>c.operation==='insert'||c.operation==='upload').length,0);
});
