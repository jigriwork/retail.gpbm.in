-- H02/H09. Staging is private; the entire publication/version switch and its
-- audit are one PostgreSQL transaction. No existing rows are rewritten/deleted.
begin;
create table public.report_imports (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 actor_id uuid not null references public.profiles(id), fingerprint text not null,
 report_type text not null check(report_type in('sales','stock','salary_attendance')),
 mode text not null check(mode in('stop','skip','replace')), is_bulk boolean not null default false,
 file_path text not null, file_name text not null, manifest jsonb not null,
 status text not null default 'processing' check(status in('processing','processed','failed')),
 failure_message text, result jsonb, created_at timestamptz not null default now(),
 unique(store_id,report_type,fingerprint)
);
create table public.report_import_chunks (
 import_id uuid not null references public.report_imports(id), chunk_no int not null check(chunk_no>=0),
 rows jsonb not null check(jsonb_typeof(rows)='array'), primary key(import_id,chunk_no)
);
alter table public.reports add column is_current boolean not null default true;
alter table public.reports add column replaces_report_id uuid references public.reports(id);
alter table public.reports add column import_id uuid references public.report_imports(id);
create index reports_current_lookup on public.reports(store_id,report_type,report_date,period_month) where is_current;
alter table public.report_imports enable row level security;
alter table public.report_import_chunks enable row level security;
revoke all on public.report_imports,public.report_import_chunks from anon,authenticated;
grant select on public.report_imports to authenticated;
create policy import_read on public.report_imports for select to authenticated using(public.can_access_store(store_id));
-- Published report data may only be changed through the transactional RPCs.
-- Salary attendance is also routed through this lifecycle (metadata-only).
revoke insert,update,delete on public.reports,public.sales_rows,public.stock_rows,public.sales_upload_batches from anon,authenticated;

create function public.begin_report_import(p_store uuid,p_type text,p_fingerprint text,p_file_name text,p_manifest jsonb,p_mode text,p_bulk boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.report_imports; item jsonb; path text; begin
 if not public.can_access_store(p_store) then raise exception 'Store access denied'; end if;
 if p_type not in('sales','stock','salary_attendance') or p_mode not in('stop','skip','replace') or p_manifest is null or jsonb_typeof(p_manifest)<>'array' or jsonb_array_length(p_manifest)=0
   or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid import'; end if;
 if p_bulk and p_type<>'sales' then raise exception 'Only sales imports support bulk mode'; end if;
 if (p_mode='replace' or p_bulk) and not public.is_owner() then raise exception 'Only owner can replace or bulk import'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store::text||p_type,0));
 select * into run from public.report_imports where store_id=p_store and report_type=p_type and fingerprint=p_fingerprint for update;
 if found then
  if (select jsonb_agg(value-'summary') from jsonb_array_elements(run.manifest))<>(select jsonb_agg(value-'summary') from jsonb_array_elements(p_manifest)) or run.mode<>p_mode or run.is_bulk<>p_bulk then raise exception 'Import key conflict'; end if;
  if run.status='failed' then update public.report_imports set status='processing',failure_message=null where id=run.id; run.status:='processing'; end if;
  return to_jsonb(run);
 end if;
 for item in select value from jsonb_array_elements(p_manifest) loop
  if item->>'row_count' is null or (item->>'row_count')::int<0 or (p_type<>'salary_attendance' and (item->>'row_count')::int=0)
     or nullif(item->>'date','') is null then raise exception 'Invalid report manifest'; end if;
  perform (item->>'date')::date;
  if item->>'target_id' is not null and not exists(select 1 from public.reports where id=(item->>'target_id')::uuid and store_id=p_store and report_type=p_type and is_current) then raise exception 'Replacement target unavailable'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_manifest))<>(select count(distinct value->>'date') from jsonb_array_elements(p_manifest)) then raise exception 'Duplicate manifest date'; end if;
 path:=public.reserve_source_file(p_store,'reports',case when p_bulk then 'sales-bulk' when p_type='salary_attendance' then 'salary-attendance' else p_type end,p_file_name);
 insert into public.report_imports(store_id,actor_id,fingerprint,report_type,mode,is_bulk,file_path,file_name,manifest)
 values(p_store,auth.uid(),p_fingerprint,p_type,p_mode,p_bulk,path,p_file_name,p_manifest) returning * into run;
 insert into public.audit_logs(actor_id,actor_role,entity_type,entity_id,store_id,action,metadata)
 values(auth.uid(),case when public.is_owner() then 'owner' else 'manager' end,'report_import',run.id,run.store_id,
   case when p_bulk then 'bulk_sales_upload_requested' when p_mode='replace' then 'sales_replacement_requested' else 'report_import_requested' end,
   jsonb_build_object('new_file_path',path,'fingerprint',p_fingerprint,'source_retained',true));
 return to_jsonb(run);
end $$;

create function public.stage_report_chunk(p_import uuid,p_chunk int,p_rows jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare run public.report_imports; old_rows jsonb; begin
 select * into run from public.report_imports where id=p_import for update;
 if not found or not public.can_access_store(run.store_id) or (run.actor_id<>auth.uid() and not public.is_owner()) then raise exception 'Import access denied'; end if;
 if run.status='processed' then return; end if;
 if run.status<>'processing' or p_chunk<0 or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then raise exception 'Invalid chunk'; end if;
 select rows into old_rows from public.report_import_chunks where import_id=p_import and chunk_no=p_chunk;
 if found then
   if old_rows<>p_rows then raise exception 'Chunk conflict'; end if;
   return;
 end if;
 insert into public.report_import_chunks values(p_import,p_chunk,p_rows);
end $$;

create function public.fail_report_import(p_import uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.report_imports set status='failed',failure_message='Import interrupted. Retry the same file to resume safely.'
 where id=p_import and status<>'processed' and public.can_access_store(store_id) and (actor_id=auth.uid() or public.is_owner());
end $$;

create function public.commit_report_import(p_import uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.report_imports; item jsonb; previous public.reports; new_report_id uuid;
 batch_id uuid; failure text; skipped int:=0; replaced int:=0; n int; expected int; all_rows jsonb; v_result jsonb; ids jsonb:='[]'; history jsonb; summary jsonb;
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
  select coalesce(jsonb_agg(r.value order by c.chunk_no,r.ordinality),'[]') into all_rows
    from public.report_import_chunks c cross join lateral jsonb_array_elements(c.rows) with ordinality r(value,ordinality) where c.import_id=run.id;
  select sum((value->>'row_count')::int) into expected from jsonb_array_elements(run.manifest);
  if jsonb_array_length(all_rows)<>expected then raise exception 'Incomplete staged row count'; end if;
  if exists(select 1 from jsonb_array_elements(all_rows) r where not exists(select 1 from jsonb_array_elements(run.manifest) m where m->>'date'=r->>'logical_date')) then raise exception 'Row outside manifest'; end if;
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
   if run.report_type='sales' then
    insert into public.sales_rows(report_id,store_id,sale_date,bill_no,item_name,sku,barcode,brand,category,size,color,quantity,mrp,discount,net_sale,staff_name,customer_name,customer_phone,raw_data)
    select new_report_id,run.store_id,(item->>'date')::date,r.bill_no,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.quantity,r.mrp,r.discount,r.net_sale,r.staff_name,r.customer_name,r.customer_phone,r.raw_data
    from jsonb_populate_recordset(null::public.sales_rows,(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(all_rows) where value->>'logical_date'=item->>'date')) r;
   elsif run.report_type='stock' then
    insert into public.stock_rows(report_id,store_id,stock_month,item_name,sku,barcode,brand,category,size,color,quantity,mrp,cost_price,supplier,purchase_date,ageing_days,raw_data)
    select new_report_id,run.store_id,(item->>'date')::date,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.quantity,r.mrp,r.cost_price,r.supplier,r.purchase_date,r.ageing_days,r.raw_data
    from jsonb_populate_recordset(null::public.stock_rows,(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(all_rows) where value->>'logical_date'=item->>'date')) r;
   end if;
   if run.report_type<>'salary_attendance' then
    get diagnostics n=row_count;
    if n<>(item->>'row_count')::int then raise exception 'Daily row count mismatch'; end if;
   else n:=0; end if;
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

create function public.archive_sales_report(p_report uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reports; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into r from public.reports where id=p_report and report_type='sales';
 if not found or not public.can_access_store(r.store_id) then raise exception 'Report unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.store_id::text||'sales',0));
 select * into r from public.reports where id=p_report for update;
 if not r.is_current then return jsonb_build_object('ok',true,'message','Report already archived.'); end if;
 update public.reports set is_current=false where id=r.id;
 insert into public.audit_logs(actor_id,actor_role,entity_type,entity_id,store_id,report_date,action,metadata)
 values(auth.uid(),'owner','report',r.id,r.store_id,r.report_date,'delete_sales_report',jsonb_build_object('source_retained',true,'file_path',r.file_path,'summary',r.summary,'version_retained',true));
 return jsonb_build_object('ok',true,'message','Report archived. Original source and rows retained.');
end $$;
revoke all on function public.begin_report_import(uuid,text,text,text,jsonb,text,boolean),public.stage_report_chunk(uuid,int,jsonb),public.fail_report_import(uuid),public.commit_report_import(uuid),public.archive_sales_report(uuid) from public,anon;
grant execute on function public.begin_report_import(uuid,text,text,text,jsonb,text,boolean),public.stage_report_chunk(uuid,int,jsonb),public.fail_report_import(uuid),public.commit_report_import(uuid),public.archive_sales_report(uuid) to authenticated;
commit;
