-- H08/M05: append-only PDFs and delivery events. No existing rows/files changed.
begin;
alter table public.generated_payslips add column is_current boolean not null default true;
alter table public.generated_payslips add column supersedes_id uuid references public.generated_payslips(id);
create table public.payslip_pdf_jobs (
 id uuid primary key default gen_random_uuid(), row_id uuid not null references public.payslip_rows(id),
 actor_id uuid not null references public.profiles(id), previous_id uuid references public.generated_payslips(id),
 file_path text not null unique, row_snapshot jsonb not null, status text not null default 'processing' check(status in('processing','processed','failed')),
 created_at timestamptz not null default now()
);
create table public.payslip_delivery_events (
 id uuid primary key default gen_random_uuid(), generated_id uuid not null references public.generated_payslips(id),
 actor_id uuid not null references public.profiles(id), kind text not null check(kind in('share_opened','sent','not_sent','failed','skipped')),
 method text not null, note text, created_at timestamptz not null default now()
);
alter table public.payslip_pdf_jobs enable row level security;
alter table public.payslip_delivery_events enable row level security;
revoke all on public.payslip_pdf_jobs,public.payslip_delivery_events from anon,authenticated;
grant select on public.payslip_pdf_jobs,public.payslip_delivery_events to authenticated;
create policy pdf_jobs_owner_read on public.payslip_pdf_jobs for select to authenticated using(public.is_owner());
create policy delivery_events_owner_read on public.payslip_delivery_events for select to authenticated using(public.is_owner());
revoke insert,update,delete on public.generated_payslips from anon,authenticated;
-- C01 phone changes remain supported; version/delivery writes use RPCs only.
grant update(employee_phone,whatsapp_phone) on public.generated_payslips to authenticated;
create policy payslip_evidence_no_update on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'payslips') with check(bucket_id<>'payslips');
create policy payslip_evidence_no_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'payslips');

create function public.begin_payslip_pdf(p_row uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.payslip_rows; job public.payslip_pdf_jobs; previous uuid; job_id uuid:=gen_random_uuid(); begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into r from public.payslip_rows where id=p_row for update;
 if not found or not public.can_access_store(r.store_id) or coalesce(r.status,'') not in('ready','total_mismatch','generated') or r.staff_name is null or r.salary_amount is null then raise exception 'Row unavailable for generation'; end if;
 select id into previous from public.generated_payslips where payslip_row_id=r.id and is_current order by created_at desc,id desc limit 1;
 insert into public.payslip_pdf_jobs(id,row_id,actor_id,previous_id,file_path,row_snapshot)
 values(job_id,r.id,auth.uid(),previous,'generated/'||r.batch_id||'/'||r.id||'/'||job_id||'.pdf',to_jsonb(r)) returning * into job;
 return to_jsonb(job);
end $$;
create function public.finish_payslip_pdf(p_job uuid,p_file_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.payslip_pdf_jobs; r public.payslip_rows; current_id uuid; n int; valid int; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into job from public.payslip_pdf_jobs where id=p_job for update;
 if not found then raise exception 'Generation unavailable'; end if;
 if job.status='processed' then return jsonb_build_object('ok',true,'id',job.id); end if;
 select * into r from public.payslip_rows where id=job.row_id for update;
 if not public.can_access_store(r.store_id) or to_jsonb(r)<>job.row_snapshot then raise exception 'Payslip changed. Generate again.'; end if;
 select id into current_id from public.generated_payslips where payslip_row_id=r.id and is_current order by created_at desc,id desc limit 1;
 if current_id is distinct from job.previous_id then raise exception 'A newer PDF is already active'; end if;
 if not exists(select 1 from storage.objects where bucket_id='payslips' and name=job.file_path) then raise exception 'PDF upload missing'; end if;
 if p_file_name is null or length(p_file_name)>240 or p_file_name ~ '[\r\n/\\]' then raise exception 'Invalid PDF name'; end if;
 update public.generated_payslips set is_current=false where payslip_row_id=r.id and is_current;
 insert into public.generated_payslips(id,batch_id,payslip_row_id,store_id,staff_name,firm_name,store_name,salary_month,pdf_file_name,pdf_file_path,status,employee_phone,whatsapp_phone,supersedes_id)
 values(job.id,r.batch_id,r.id,r.store_id,r.staff_name,r.firm_name,r.store_name,r.salary_month,p_file_name,job.file_path,'generated',r.employee_phone,r.whatsapp_phone,job.previous_id);
 update public.payslip_rows set status='generated' where id=r.id;
 select count(*) into n from public.payslip_rows x where x.batch_id=r.batch_id and exists(select 1 from public.generated_payslips g where g.payslip_row_id=x.id and g.is_current);
 select count(*) into valid from public.payslip_rows where batch_id=r.batch_id and status in('ready','generated','total_mismatch');
 update public.payslip_batches set generated_count=n,status=case when n>=valid and valid>0 then 'generated' else 'partial' end where id=r.batch_id;
 update public.salary_receivables set generated_payslip_id=job.id where payslip_row_id=r.id;
 insert into public.audit_logs(actor_id,actor_role,entity_type,entity_id,store_id,action,metadata)
 values(auth.uid(),'owner','generated_payslip',job.id,r.store_id,'payslip_pdf_version_created',jsonb_build_object('previous_id',job.previous_id,'row_id',r.id,'source_retained',true));
 update public.payslip_pdf_jobs set status='processed' where id=job.id;
 return jsonb_build_object('ok',true,'id',job.id);
end $$;
create function public.record_payslip_delivery(p_generated uuid,p_kind text,p_method text,p_note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare g public.generated_payslips; begin
 if not public.is_owner() then raise exception 'Owner required'; end if;
 select * into g from public.generated_payslips where id=p_generated for update;
 if not found or not public.can_access_store(g.store_id) then raise exception 'Payslip unavailable'; end if;
 if p_kind not in('share_opened','sent','not_sent','failed','skipped') or p_method not in('whatsapp_text','whatsapp_pdf_share','copy_message','whatsapp_manual','download_only','other') or length(p_note)>1000 then raise exception 'Invalid delivery event'; end if;
 insert into public.payslip_delivery_events(generated_id,actor_id,kind,method,note) values(g.id,auth.uid(),p_kind,p_method,p_note);
 if p_kind='share_opened' then
  update public.generated_payslips set last_share_attempt_at=now(),last_share_method=p_method where id=g.id;
 else
  update public.generated_payslips set sent_status=p_kind,sent_at=case when p_kind='sent' then now() end,sent_by=auth.uid(),sent_method=p_method,sent_note=p_note where id=g.id;
 end if;
end $$;
revoke all on function public.begin_payslip_pdf(uuid),public.finish_payslip_pdf(uuid,text),public.record_payslip_delivery(uuid,text,text,text) from public,anon;
grant execute on function public.begin_payslip_pdf(uuid),public.finish_payslip_pdf(uuid,text),public.record_payslip_delivery(uuid,text,text,text) to authenticated;
commit;
