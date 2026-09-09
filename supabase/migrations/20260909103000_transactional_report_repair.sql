begin;
create function public.repair_sales_report(p_report uuid,p_footer_ids uuid[],p_summary jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.reports; new_id uuid; n int; total numeric; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into old from public.reports where id=p_report and report_type='sales';
 if not found or not public.can_access_store(old.store_id) then raise exception 'Report unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(old.store_id::text||'sales',0));
 select * into old from public.reports where id=p_report for update;
 if not old.is_current then
  select id into new_id from public.reports where replaces_report_id=old.id and is_current;
  return jsonb_build_object('ok',new_id is not null,'message','Report already corrected; reload to see the current version.');
 end if;
 if p_footer_ids is null or exists(select 1 from unnest(p_footer_ids) i where not exists(select 1 from public.sales_rows where id=i and report_id=old.id)) then raise exception 'Invalid footer rows'; end if;
 select count(*),coalesce(sum(net_sale),0) into n,total from public.sales_rows where report_id=old.id and not(id=any(p_footer_ids));
 if n=0 then raise exception 'Repair would remove all rows'; end if;
 insert into public.reports(store_id,uploaded_by,report_type,report_date,file_name,file_path,status,row_count,summary,is_current,replaces_report_id,sales_upload_batch_id)
 values(old.store_id,auth.uid(),'sales',old.report_date,old.file_name,old.file_path,'processing',n,
  coalesce(old.summary,'{}')||coalesce(p_summary,'{}')||jsonb_build_object('totalNetSale',total,'rowCount',n,'recovery_sources',coalesce(old.summary->'recovery_sources','[]')||jsonb_build_array(jsonb_build_object('report_id',old.id,'file_name',old.file_name,'file_path',old.file_path,'sales_upload_batch_id',old.sales_upload_batch_id))),false,old.id,old.sales_upload_batch_id)
 returning id into new_id;
 insert into public.sales_rows(report_id,store_id,sale_date,bill_no,item_name,sku,barcode,brand,category,size,color,quantity,mrp,discount,net_sale,staff_name,customer_name,customer_phone,raw_data)
 select new_id,store_id,sale_date,bill_no,item_name,sku,barcode,brand,category,size,color,quantity,mrp,discount,net_sale,staff_name,customer_name,customer_phone,raw_data from public.sales_rows where report_id=old.id and not(id=any(p_footer_ids));
 update public.reports set is_current=false where id=old.id;
 update public.reports set is_current=true,status='processed' where id=new_id;
 insert into public.audit_logs(actor_id,actor_role,action,entity_type,entity_id,store_id,metadata)
 values(auth.uid(),'owner','repair_sales_report','report',new_id,old.store_id,jsonb_build_object('previous_report_id',old.id,'file_path',old.file_path,'source_retained',true));
 return jsonb_build_object('ok',true,'message','Report repaired as a new version. Original source and rows retained.');
end $$;
create function public.restore_report_version(p_report uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reports; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into r from public.reports where id=p_report and status='processed';
 if not found or not public.can_access_store(r.store_id) then raise exception 'Version unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.store_id::text||r.report_type,0));
 update public.reports p set is_current=false where p.store_id=r.store_id and p.report_type=r.report_type and p.is_current
  and case when r.report_type='sales' then p.report_date=r.report_date else p.period_month=r.period_month end;
 update public.reports set is_current=true where id=r.id;
 insert into public.audit_logs(actor_id,actor_role,action,entity_type,entity_id,store_id,metadata)
 values(auth.uid(),'owner','restore_report_version','report',r.id,r.store_id,jsonb_build_object('file_path',r.file_path,'source_retained',true));
 return jsonb_build_object('ok',true,'message','Prior version restored.');
end $$;
revoke all on function public.repair_sales_report(uuid,uuid[],jsonb),public.restore_report_version(uuid) from public,anon;
grant execute on function public.repair_sales_report(uuid,uuid[],jsonb),public.restore_report_version(uuid) to authenticated;
commit;
