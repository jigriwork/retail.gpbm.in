-- Stock finalization: bound JSON materialization to one staged chunk.
-- No historical data, permissions, platform timeouts or upload limits change.
begin;
create or replace function public.commit_report_import(p_import uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.report_imports; item jsonb; previous public.reports; new_report_id uuid;
 batch_id uuid; failure text; skipped int:=0; replaced int:=0; n int; inserted int; expected int; staged_rows jsonb; v_result jsonb; ids jsonb:='[]'; history jsonb; summary jsonb;
begin
 select * into run from public.report_imports where id=p_import;
 if not found or not public.can_access_store(run.store_id) or (run.actor_id<>auth.uid() and not public.is_owner()) then raise exception 'Import access denied'; end if;
 if (run.mode='replace' or run.is_bulk) and not public.is_owner() then raise exception 'Owner required'; end if;
 if run.status='processed' then return run.result; end if;
 if run.status<>'processing' then return jsonb_build_object('ok',false,'message','Retry this import before committing.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(run.store_id::text||run.report_type,0));
 select * into run from public.report_imports where id=p_import for update;
 if run.status='processed' then return run.result; end if;
 if run.status<>'processing' then return jsonb_build_object('ok',false,'message','Retry this import before committing.'); end if;
 -- Exceptions roll back this entire subtransaction, including version switches,
 -- batch records and audits. The failure status is persisted outside it.
 begin
  if not exists(select 1 from storage.objects where bucket_id='reports' and name=run.file_path) then raise exception 'Original source upload is missing'; end if;
  -- Validate the private chunks without materializing a workbook-sized JSONB value.
  select sum((value->>'row_count')::int) into expected from jsonb_array_elements(run.manifest);
  if coalesce((select sum(jsonb_array_length(c.rows)) from public.report_import_chunks c where c.import_id=run.id),0)<>expected then raise exception 'Incomplete staged row count'; end if;
  if exists(select 1 from public.report_import_chunks c cross join lateral jsonb_array_elements(c.rows) r
    where c.import_id=run.id and not exists(select 1 from jsonb_array_elements(run.manifest) m where m->>'date'=r->>'logical_date')) then raise exception 'Row outside manifest'; end if;
  if run.is_bulk then
   insert into public.sales_upload_batches(store_id,uploaded_by,upload_mode,original_file_name,file_path,status)
   values(run.store_id,auth.uid(),'bulk',run.file_name,run.file_path,'uploaded') returning id into batch_id;
  end if;
  for item in select value from jsonb_array_elements(run.manifest) order by value->>'date' loop
   previous:=null;
   select * into previous from public.reports p where p.store_id=run.store_id and p.report_type=run.report_type and p.is_current
    and case when run.report_type='sales' then p.report_date=(item->>'date')::date else p.period_month=(item->>'date')::date end
    order by p.created_at desc,p.id limit 1 for update;
   if previous.id is not null then
    if run.mode='stop' then raise exception 'An active report already exists. Use owner correction.'; end if;
    if run.mode='skip' then skipped:=skipped+1; continue; end if;
    replaced:=replaced+1;
    if item->>'target_id' is not null and previous.id<>(item->>'target_id')::uuid then raise exception 'Active version changed. Review replacement again.'; end if;
   elsif item->>'target_id' is not null then raise exception 'Replacement target is no longer active';
   end if;
   summary:=coalesce(item->'summary','{}')-'recovery_sources';
   history:='[]';
   if previous.id is not null then
    history:=coalesce(previous.summary->'recovery_sources','[]')||jsonb_build_array(jsonb_build_object('report_id',previous.id,'file_name',previous.file_name,'file_path',previous.file_path,'sales_upload_batch_id',previous.sales_upload_batch_id));
    summary:=summary||jsonb_build_object('recovery_sources',history);
   end if;
   insert into public.reports(store_id,uploaded_by,report_type,report_date,period_month,file_name,file_path,status,row_count,summary,is_current,replaces_report_id,import_id,sales_upload_batch_id)
   values(run.store_id,auth.uid(),run.report_type,case when run.report_type='sales' then (item->>'date')::date else (now() at time zone 'Asia/Kolkata')::date end,
    case when run.report_type<>'sales' then (item->>'date')::date end,run.file_name,run.file_path,'processing',0,summary,false,previous.id,run.id,batch_id) returning id into new_report_id;
   n:=0;
   -- Each insert consumes at most the existing 1,000-row staging limit. All
   -- chunks, reports, version switches and audits still share this transaction.
   for staged_rows in select c.rows from public.report_import_chunks c where c.import_id=run.id order by c.chunk_no loop
   if run.report_type='sales' then
    insert into public.sales_rows(report_id,store_id,sale_date,bill_no,item_name,sku,barcode,brand,category,size,color,quantity,mrp,discount,net_sale,staff_name,customer_name,customer_phone,raw_data)
    select new_report_id,run.store_id,(item->>'date')::date,r.bill_no,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.quantity,r.mrp,r.discount,r.net_sale,r.staff_name,r.customer_name,r.customer_phone,r.raw_data
    from jsonb_populate_recordset(null::public.sales_rows,(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(staged_rows) where value->>'logical_date'=item->>'date')) r;
   elsif run.report_type='stock' then
    insert into public.stock_rows(report_id,store_id,stock_month,item_name,sku,barcode,brand,category,size,color,quantity,mrp,cost_price,supplier,purchase_date,ageing_days,raw_data)
    select new_report_id,run.store_id,(item->>'date')::date,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.quantity,r.mrp,r.cost_price,r.supplier,r.purchase_date,r.ageing_days,r.raw_data
    from jsonb_populate_recordset(null::public.stock_rows,(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(staged_rows) where value->>'logical_date'=item->>'date')) r;
   end if;
    if run.report_type<>'salary_attendance' then
     get diagnostics inserted=row_count;
     n:=n+inserted;
    end if;
   end loop;
   if run.report_type<>'salary_attendance' and n<>(item->>'row_count')::int then raise exception 'Daily row count mismatch'; end if;
   -- Serialize all versions by store/type lock; no blind store/date uniqueness.
   update public.reports p set is_current=false where p.store_id=run.store_id and p.report_type=run.report_type and p.is_current
    and case when run.report_type='sales' then p.report_date=(item->>'date')::date else p.period_month=(item->>'date')::date end;
   update public.reports set is_current=true,status='processed',row_count=n where id=new_report_id;
   insert into public.audit_logs(actor_id,actor_role,entity_type,entity_id,store_id,report_date,action,metadata)
   values(auth.uid(),case when public.is_owner() then 'owner' else 'manager' end,'report',new_report_id,run.store_id,(item->>'date')::date,
     case when previous.id is null then 'report_imported' else 'replace_sales_report' end,
     jsonb_build_object('import_id',run.id,'previous_report_id',previous.id,'new_file_path',run.file_path,'recovery_sources',coalesce(history,'[]'),'source_retained',true));
   ids:=ids||jsonb_build_array(new_report_id);
  end loop;
  if batch_id is not null then
   update public.sales_upload_batches set status='processed',total_dates=jsonb_array_length(run.manifest),imported_dates=jsonb_array_length(ids)-replaced,skipped_dates=skipped,replaced_dates=replaced,
    total_rows=(select count(*) from public.sales_rows where report_id in(select value::uuid from jsonb_array_elements_text(ids))),
    total_net_sale=(select coalesce(sum(net_sale),0) from public.sales_rows where report_id in(select value::uuid from jsonb_array_elements_text(ids))),
    total_quantity=(select coalesce(sum(quantity),0) from public.sales_rows where report_id in(select value::uuid from jsonb_array_elements_text(ids))),
    total_bills=(select count(distinct (sale_date,bill_no)) from public.sales_rows where report_id in(select value::uuid from jsonb_array_elements_text(ids)) and nullif(trim(bill_no),'') is not null),
    unmatched_staff_count=(select count(distinct name) from public.reports p cross join lateral jsonb_array_elements_text(coalesce(p.summary->'unmatchedStaffNames','[]')) name where p.id in(select value::uuid from jsonb_array_elements_text(ids))),
    detected_start_date=(select min((value->>'date')::date) from jsonb_array_elements(run.manifest)),detected_end_date=(select max((value->>'date')::date) from jsonb_array_elements(run.manifest)),
    summary=jsonb_build_object('import_id',run.id,'report_ids',ids) where id=batch_id;
  end if;
  v_result:=jsonb_build_object('ok',true,'report_ids',ids,'batch_id',batch_id,'message','Import processed. Original evidence and prior versions retained.');
  update public.report_imports set status='processed',failure_message=null,result=v_result where id=run.id;
  return v_result;
 exception when others then
  -- Only known validation messages may reach the UI; never expose arbitrary
  -- database errors, row values, credentials or internal trigger diagnostics.
  failure:=case when sqlerrm in (
   'Original source upload is missing','Incomplete staged row count','Row outside manifest',
   'An active report already exists. Use owner correction.',
   'Active version changed. Review replacement again.','Replacement target is no longer active',
   'Daily row count mismatch'
  ) then sqlerrm||' No partial report was published.'
  else 'Import failed; no partial report was published. Retry the same file or review the current version.' end;
  update public.report_imports set status='failed',failure_message=failure where id=run.id;
  return jsonb_build_object('ok',false,'message',failure);
 end;
end $$;


commit;
