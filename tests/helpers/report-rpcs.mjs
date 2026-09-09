// Contract mock for action orchestration. Atomicity/security are independently
// tested against the actual PostgreSQL functions in database-safety.test.mjs.
export function reportRpcs(db, client) {
  const clone = x => JSON.parse(JSON.stringify(x));
  let sequence=0;
  const sources = report => [...(report.summary?.recovery_sources ?? []), { report_id: report.id, file_name: report.file_name, file_path: report.file_path, sales_upload_batch_id: report.sales_upload_batch_id }];
  async function checked(query) { const result=await query; if(result.error)throw new Error(result.error.message);return result.data; }
  return async function rpc(name,args) {
    const before=clone(db);
    try {
      if(name==='archive_sales_report') {
        const report=db.reports.find(r=>r.id===args.p_report);
        await checked(client.from('audit_logs').insert({action:'delete_sales_report',metadata:{recovery_sources:sources(report),storage_deleted:false}}));
        report.is_current=false;
        return {data:{ok:true,message:'Report archived'},error:null};
      }
      if(name==='begin_report_import') {
        let run=db.report_imports.find(r=>r.fingerprint===args.p_fingerprint);
        if(run){if(run.status==='failed')run.status='processing';return {data:clone(run),error:null};}
        run={id:`import-${++sequence}`,file_path:`sales/gp/reserved-${sequence}.xlsx`,status:'processing',fingerprint:args.p_fingerprint,
          manifest:args.p_manifest,store_id:args.p_store,report_type:args.p_type,mode:args.p_mode,is_bulk:args.p_bulk};
        await checked(client.from('audit_logs').insert({action:'sales_replacement_requested',metadata:{new_file_path:run.file_path}}));
        db.report_imports.push(run);
        return {data:clone(run),error:null};
      }
      if(name==='stage_report_chunk') { if(db.report_import_chunks.some(c=>c.import_id===args.p_import&&c.chunk_no===args.p_chunk))return {data:null,error:null}; db.report_import_chunks.push({import_id:args.p_import,chunk_no:args.p_chunk,rows:args.p_rows});return {data:null,error:null}; }
      if(name==='fail_report_import') { const run=db.report_imports.find(r=>r.id===args.p_import);if(run.status!=='processed')run.status='failed';return {data:null,error:null}; }
      if(name==='commit_report_import') {
        const run=db.report_imports.find(r=>r.id===args.p_import);
        let batch=null;
        if(run.is_bulk) batch=await checked(client.from('sales_upload_batches').insert({file_path:run.file_path}).select('id').single());
        const ids=[];
        for(const day of run.manifest){
          const old=db.reports.find(r=>r.store_id===run.store_id&&r.report_date===day.date&&r.is_current!==false);
          if(old&&run.mode==='skip')continue;
          const rows=db.report_import_chunks.filter(c=>c.import_id===run.id).flatMap(c=>c.rows).filter(r=>r.logical_date===day.date);
          const report=await checked(client.from('reports').insert({report_type:run.report_type,store_id:run.store_id,report_date:day.date,file_path:run.file_path,summary:{...day.summary,...(old?{recovery_sources:sources(old)}:{})},sales_upload_batch_id:batch?.id??null,is_current:true,status:'processed'}).select('id').single());
          await checked(client.from('sales_rows').insert(rows.map(row=>({...row,report_id:report.id}))));
          if(old)old.is_current=false;
          await checked(client.from('audit_logs').insert({action:'replace_sales_report',metadata:{new_file_path:run.file_path,recovery_sources:old?sources(old):[]}}));
          ids.push(report.id);
        }
        run.status='processed';run.result={ok:true,message:'Import processed',report_ids:ids,batch_id:batch?.id??null};
        return {data:clone(run.result),error:null};
      }
      throw new Error(`Unexpected RPC ${name}`);
    }catch(error){
      Object.assign(db,before);
      return {data:null,error:{message:error.message}};
    }
  };
}
