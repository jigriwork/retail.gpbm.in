-- H10: new imports only. Legacy July batches are independent and untouched.
begin;
create table public.payroll_runs (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 firm_name text not null, salary_month date not null, source_label text not null,
 unique(store_id,firm_name,salary_month,source_label)
);
create table public.payroll_run_versions (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.payroll_runs(id),
 batch_id uuid not null references public.payslip_batches(id), previous_id uuid references public.payroll_run_versions(id),
 fingerprint text not null, is_current boolean not null default true, created_at timestamptz not null default now(),unique(run_id,batch_id)
);
create unique index payroll_one_current_version on public.payroll_run_versions(run_id) where is_current;
create table public.payroll_imports (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id),
 salary_month date not null, source_label text not null, fingerprint text not null, scope uuid[] not null,
 file_name text not null, file_path text not null unique, rows jsonb not null,
 comparison jsonb not null, comparison_token text not null,
 status text not null default 'processing' check(status in('processing','processed','failed')),
 batch_id uuid references public.payslip_batches(id), failure_message text, created_at timestamptz not null default now(),
 unique(salary_month,fingerprint,scope)
);
alter table public.payslip_batches add column payroll_import_id uuid references public.payroll_imports(id);
alter table public.payslip_rows add column payroll_version_id uuid references public.payroll_run_versions(id);
alter table public.salary_receivables add column payroll_version_id uuid references public.payroll_run_versions(id);
alter table public.salary_receivables add column is_current boolean not null default true;
revoke insert,delete on public.payslip_batches,public.payslip_rows from anon,authenticated;
-- Prevent browser changes to row/run identity and salary totals; C01 phone edits
-- remain supported. Batches are finalized by RPC only.
revoke update on public.payslip_batches,public.payslip_rows from anon,authenticated;
grant update(employee_phone,whatsapp_phone,warning_message) on public.payslip_rows to authenticated;
revoke insert,delete on public.salary_receivables from anon,authenticated;
revoke update on public.salary_receivables from anon,authenticated;
-- Payment changes also serialize against version replacement via an RPC.
do $$declare t text;begin
 foreach t in array array['payroll_runs','payroll_run_versions','payroll_imports'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(public.is_owner())',t);
 end loop;
end $$;

-- Only exposed through owner-authorized RPCs below; legacy batches are displayed
-- for comparison, never presumed to belong to or duplicate a new logical run.
create function public.payroll_comparison(p_month date,p_label text,p_scope uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('batch_id',b.id,'file_name',b.source_file_name,'legacy',b.payroll_import_id is null,
  'rows',(select count(*) from public.payslip_rows r where r.batch_id=b.id and r.store_id=any(p_scope)),
  'total',(select coalesce(sum(net_payable),0) from public.payslip_rows r where r.batch_id=b.id and r.store_id=any(p_scope)),
  'employees',(select coalesce(jsonb_agg(jsonb_build_object('store_id',r.store_id,'staff_name',r.staff_name,'net_payable',r.net_payable) order by r.store_id,r.staff_name,r.id),'[]') from public.payslip_rows r where r.batch_id=b.id and r.store_id=any(p_scope))) order by b.id),'[]')
 from public.payslip_batches b where b.salary_month=p_month and exists(select 1 from public.payslip_rows r where r.batch_id=b.id and r.store_id=any(p_scope))
 and (b.payroll_import_id is null or exists(select 1 from public.payroll_run_versions v join public.payroll_runs r on r.id=v.run_id where v.batch_id=b.id and v.is_current and r.source_label=p_label and r.store_id=any(p_scope)));
$$;
revoke all on function public.payroll_comparison(date,text,uuid[]) from public,anon,authenticated;

create function public.prepare_payroll_import(p_month date,p_label text,p_fingerprint text,p_file_name text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.payroll_imports; scope_ids uuid[]; v_comparison jsonb; token text; item jsonb; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_label is null or length(trim(p_label)) not between 1 and 80 or p_fingerprint !~ '^[a-f0-9]{64}$' or p_file_name is null or length(p_file_name)>255
 or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 5000 then raise exception 'Invalid payroll input'; end if;
 p_label:=lower(trim(p_label));
 select array_agg(distinct (value->>'store_id')::uuid order by (value->>'store_id')::uuid) into scope_ids from jsonb_array_elements(p_rows);
 for item in select value from jsonb_array_elements(p_rows) loop
  if item->>'store_id' is null or not public.can_access_store((item->>'store_id')::uuid) then raise exception 'Payroll store unavailable'; end if;
  if exists(select 1 from public.stores where id=(item->>'store_id')::uuid and nullif(firm_name,'') is null) then raise exception 'Firm mapping required'; end if;
  if nullif(item->>'employee_phone','') is not null and item->>'employee_phone' !~ '^91[6-9][0-9]{9}$' then raise exception 'Invalid payroll phone'; end if;
  if nullif(item->>'whatsapp_phone','') is not null and item->>'whatsapp_phone' !~ '^91[6-9][0-9]{9}$' then raise exception 'Invalid payroll phone'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_month::text||'payroll',0));
 select * into i from public.payroll_imports where salary_month=p_month and fingerprint=p_fingerprint and scope=scope_ids for update;
 if found then
  if i.rows<>p_rows then raise exception 'Fingerprint conflict'; end if;
  if i.status='failed' then update public.payroll_imports set status='processing',failure_message=null where id=i.id; i.status:='processing'; end if;
  return to_jsonb(i)-'rows'||jsonb_build_object('proposed_rows',jsonb_array_length(i.rows),'proposed_total',(select sum((value->>'net_payable')::numeric) from jsonb_array_elements(i.rows)));
 end if;
 v_comparison:=public.payroll_comparison(p_month,p_label,scope_ids);token:=md5(v_comparison::text);
 insert into public.payroll_imports(actor_id,salary_month,source_label,fingerprint,scope,file_name,file_path,rows,comparison,comparison_token)
 values(auth.uid(),p_month,p_label,p_fingerprint,scope_ids,p_file_name,'source-sheets/'||to_char(p_month,'YYYY-MM')||'/'||gen_random_uuid()||'.'||case when lower(p_file_name) like '%.csv' then 'csv' when lower(p_file_name) like '%.xls' then 'xls' else 'xlsx' end,p_rows,v_comparison,token) returning * into i;
 return to_jsonb(i)-'rows'||jsonb_build_object('proposed_rows',jsonb_array_length(i.rows),'proposed_total',(select sum((value->>'net_payable')::numeric) from jsonb_array_elements(i.rows)));
end $$;

create function public.commit_payroll_import(p_import uuid,p_confirm boolean default false,p_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.payroll_imports; batch uuid; s public.stores; v_run_id uuid; old_version uuid; version_id uuid;
 r public.payslip_rows; contact public.employee_contacts; raw jsonb; previous public.salary_receivables; key text; v_comparison jsonb;
begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into i from public.payroll_imports where id=p_import;
 if not found then raise exception 'Import unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(i.salary_month::text||'payroll',0));
 select * into i from public.payroll_imports where id=p_import for update;
 if i.status='processed' then return jsonb_build_object('ok',true,'batch_id',i.batch_id); end if;
 if exists(select 1 from unnest(i.scope) scoped_store(id) where not public.can_access_store(scoped_store.id)) then raise exception 'Payroll store unavailable'; end if;
 v_comparison:=public.payroll_comparison(i.salary_month,i.source_label,i.scope);
 if v_comparison<>i.comparison then
  update public.payroll_imports set comparison=v_comparison,comparison_token=md5(v_comparison::text) where id=i.id;
  return jsonb_build_object('ok',false,'review',true,'message','Payroll changed. Review the comparison again.','comparison',v_comparison,'comparison_token',md5(v_comparison::text));
 end if;
 if jsonb_array_length(v_comparison)>0 and (not coalesce(p_confirm,false) or p_token is distinct from i.comparison_token) then
  return jsonb_build_object('ok',false,'review',true,'message','Confirm the new payroll version after reviewing existing batches.');
 end if;
 begin
  if not exists(select 1 from storage.objects where bucket_id='payslips' and name=i.file_path) then raise exception 'Source missing'; end if;
  insert into public.payslip_batches(salary_month,source_file_name,source_file_path,status,uploaded_by,payroll_import_id,total_rows,valid_rows,warning_count,summary)
  values(i.salary_month,i.file_name,i.file_path,'review',auth.uid(),i.id,jsonb_array_length(i.rows),
   (select count(*) from jsonb_array_elements(i.rows) where value->>'status' in('ready','total_mismatch','generated')),
   (select count(*) from jsonb_array_elements(i.rows) where nullif(value->>'warning_message','') is not null),
   jsonb_build_object('fingerprint',i.fingerprint,'sourceLabel',i.source_label,'comparison',v_comparison)) returning id into batch;
  for s in select * from public.stores where id=any(i.scope) order by id loop
   insert into public.payroll_runs(store_id,firm_name,salary_month,source_label) values(s.id,s.firm_name,i.salary_month,i.source_label) on conflict do nothing;
   select id into v_run_id from public.payroll_runs where store_id=s.id and firm_name=s.firm_name and salary_month=i.salary_month and source_label=i.source_label;
   select id into old_version from public.payroll_run_versions where payroll_run_versions.run_id=v_run_id and is_current for update;
   perform 1 from public.salary_receivables where payroll_version_id=old_version order by id for update;
   -- Ambiguous same-name/payment changes require an explicit accounting review.
   if exists(select 1 from public.salary_receivables old where old.payroll_version_id=old_version and (old.received_amount>0 or old.status in('waived','disputed')) and
    ((select count(*) from jsonb_array_elements(i.rows) n where n->>'store_id'=s.id::text and lower(regexp_replace(trim(n->>'staff_name'),'\s+',' ','g'))=old.normalized_staff_name )<>1 or not exists(select 1 from jsonb_array_elements(i.rows) n where n->>'store_id'=s.id::text and lower(regexp_replace(trim(n->>'staff_name'),'\s+',' ','g'))=old.normalized_staff_name and (n->>'net_payable')::numeric<0) or
     (select count(*) from public.salary_receivables x where x.payroll_version_id=old_version and x.normalized_staff_name=old.normalized_staff_name)<>1)) then
    raise exception 'Paid or disputed payroll requires manual identity reconciliation';
   end if;
   update public.payroll_run_versions set is_current=false where id=old_version;
   insert into public.payroll_run_versions(run_id,batch_id,previous_id,fingerprint) values(v_run_id,batch,old_version,i.fingerprint) returning id into version_id;
   for raw in select value from jsonb_array_elements(i.rows) where value->>'store_id'=s.id::text loop
    r:=jsonb_populate_record(null::public.payslip_rows,raw);
    key:=lower(regexp_replace(trim(r.staff_name),'\s+',' ','g'));
    if nullif(key,'') is not null then
     insert into public.employee_contacts(store_id,staff_name,normalized_staff_name,phone,normalized_phone,whatsapp_phone,is_active,created_by)
     values(s.id,r.staff_name,key,r.employee_phone,r.employee_phone,r.whatsapp_phone,true,auth.uid()) on conflict(store_id,normalized_staff_name) do nothing;
     select * into contact from public.employee_contacts where store_id=s.id and normalized_staff_name=key for update;
     if contact.normalized_phone is null and r.employee_phone is not null then
      update public.employee_contacts set phone=r.employee_phone,normalized_phone=r.employee_phone,whatsapp_phone=r.whatsapp_phone where id=contact.id;
     end if;
     if r.employee_phone is null and contact.is_active=true then r.employee_phone:=contact.normalized_phone;r.whatsapp_phone:=coalesce(contact.whatsapp_phone,contact.normalized_phone); end if;
     if r.employee_phone is not null and contact.normalized_phone is not null and r.employee_phone<>contact.normalized_phone then r.warning_message:=concat_ws(' ',r.warning_message,'Phone differs from saved employee contact.'); end if;
    end if;
    insert into public.payslip_rows(batch_id,store_id,firm_name,store_name,salary_month,staff_name,salary_amount,divided_by_days,abs_days,abs_amount,sunday_pay,sunday_present,sunday_pay_amount,advance,commission,uploaded_total_amount,calculated_total_amount,net_payable,warning_message,status,raw_data,employee_phone,whatsapp_phone,payroll_version_id)
    values(batch,s.id,s.firm_name,s.name,i.salary_month,r.staff_name,r.salary_amount,r.divided_by_days,r.abs_days,r.abs_amount,r.sunday_pay,r.sunday_present,r.sunday_pay_amount,r.advance,r.commission,r.uploaded_total_amount,r.calculated_total_amount,r.net_payable,r.warning_message,r.status,r.raw_data,r.employee_phone,r.whatsapp_phone,version_id) returning * into r;
    if r.net_payable<0 then
     previous:=null;
     select * into previous from public.salary_receivables where payroll_version_id=old_version and normalized_staff_name=key order by id limit 1;
     insert into public.salary_receivables(payslip_row_id,batch_id,store_id,staff_name,normalized_staff_name,firm_name,store_name,salary_month,net_payable,receivable_amount,received_amount,balance_amount,status,received_at,received_by,note,payroll_version_id)
     values(r.id,batch,s.id,coalesce(r.staff_name,'Unknown'),key,s.firm_name,s.name,i.salary_month,r.net_payable,abs(r.net_payable),coalesce(previous.received_amount,0),
      case when previous.status='waived' then 0 else greatest(0,abs(r.net_payable)-coalesce(previous.received_amount,0)) end,
      case when previous.status in('waived','disputed') then previous.status when coalesce(previous.received_amount,0)=0 then 'pending' when previous.received_amount>=abs(r.net_payable) then 'received' else 'partial' end,
      previous.received_at,previous.received_by,previous.note,version_id);
    end if;
   end loop;
   update public.salary_receivables set is_current=false where payroll_version_id=old_version;
  end loop;
  insert into public.audit_logs(actor_id,actor_role,entity_type,entity_id,action,metadata)
  values(auth.uid(),'owner','payslip_batch',batch,'payroll_version_imported',jsonb_build_object('import_id',i.id,'fingerprint',i.fingerprint,'comparison',v_comparison,'source_retained',true));
  update public.payroll_imports set status='processed',batch_id=batch,failure_message=null where id=i.id;
  return jsonb_build_object('ok',true,'batch_id',batch);
 exception when others then
  update public.payroll_imports set status='failed',failure_message=case when sqlerrm='Paid or disputed payroll requires manual identity reconciliation' then sqlerrm else 'Payroll import failed. No partial batch was published; retry the same workbook.' end where id=i.id;
  return jsonb_build_object('ok',false,'message',(select failure_message from public.payroll_imports where id=i.id));
 end;
end $$;

-- Legacy synchronization remains available without merging historical batches.
-- Row uniqueness, a DB lock and atomic insert prevent concurrent duplicate debt.
create function public.sync_payroll_receivables(p_batch uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n int;begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-receivables-sync',0));
 insert into public.salary_receivables(payslip_row_id,batch_id,store_id,staff_name,normalized_staff_name,firm_name,store_name,salary_month,net_payable,receivable_amount,balance_amount,payroll_version_id,generated_payslip_id)
 select r.id,r.batch_id,r.store_id,coalesce(r.staff_name,'Unknown'),lower(regexp_replace(trim(r.staff_name),'\s+',' ','g')),r.firm_name,r.store_name,r.salary_month,r.net_payable,abs(r.net_payable),abs(r.net_payable),r.payroll_version_id,
 (select id from public.generated_payslips where payslip_row_id=r.id and is_current order by created_at desc,id desc limit 1)
 from public.payslip_rows r where r.net_payable<0 and (p_batch is null or r.batch_id=p_batch) and public.can_access_store(r.store_id)
 and (r.payroll_version_id is null or exists(select 1 from public.payroll_run_versions where id=r.payroll_version_id and is_current)) on conflict(payslip_row_id) do nothing;
 get diagnostics n=row_count;
 return jsonb_build_object('ok',true,'created',n,'updated',0,'skipped',0,'message','Receivables synchronized without replacing payment history.');
end $$;
revoke all on function public.prepare_payroll_import(date,text,text,text,jsonb),public.commit_payroll_import(uuid,boolean,text),public.sync_payroll_receivables(uuid) from public,anon;
grant execute on function public.prepare_payroll_import(date,text,text,text,jsonb),public.commit_payroll_import(uuid,boolean,text),public.sync_payroll_receivables(uuid) to authenticated;
create function public.record_payroll_receivable(p_id uuid,p_action text,p_amount numeric default null,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.salary_receivables; paid numeric; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into r from public.salary_receivables where id=p_id and is_current for update;
 if not found or not public.can_access_store(r.store_id) then raise exception 'Current receivable unavailable'; end if;
 if p_action not in('received','partial','waived','disputed','pending') or length(p_note)>1000 then raise exception 'Invalid payment action'; end if;
 if p_action='partial' and (p_amount is null or p_amount<=0 or p_amount::text in('NaN','Infinity','-Infinity')) then raise exception 'Invalid payment amount'; end if;
 paid:=case when p_action='received' then r.receivable_amount when p_action='partial' then coalesce(r.received_amount,0)+p_amount when p_action='pending' then 0 else coalesce(r.received_amount,0) end;
 update public.salary_receivables set received_amount=paid,balance_amount=case when p_action='waived' then 0 else greatest(0,receivable_amount-paid) end,
 status=case when p_action='partial' and paid>=receivable_amount then 'received' else p_action end,
 received_at=case when p_action='pending' then null else now() end,received_by=auth.uid(),note=coalesce(p_note,note) where id=r.id;
 insert into public.audit_logs(actor_id,actor_role,entity_type,entity_id,store_id,action,metadata)
 values(auth.uid(),'owner','salary_receivable',r.id,r.store_id,'receivable_'||p_action,jsonb_build_object('payroll_version_id',r.payroll_version_id,'previous_received',r.received_amount,'received',paid));
 return jsonb_build_object('ok',true,'message','Receivable updated.');
end $$;
revoke all on function public.record_payroll_receivable(uuid,text,numeric,text) from public,anon;
grant execute on function public.record_payroll_receivable(uuid,text,numeric,text) to authenticated;
commit;
