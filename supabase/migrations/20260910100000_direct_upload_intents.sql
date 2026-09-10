-- Direct browser uploads. Additive: retain every historical row and source.
begin;
create table public.upload_intents (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id),
 store_id uuid not null references public.stores(id), kind text not null check(kind in('sales','sales-bulk','sales-replacement','stock','salary-attendance','payroll','rack','cleaning','manager-updates')),
 bucket text not null check(bucket in('reports','payslips','review-photos')), file_path text not null unique,
 file_name text not null, mime_type text not null, byte_size bigint not null check(byte_size between 1 and 15728640),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 status text not null default 'created' check(status in('created','uploading','uploaded','processing','processed','failed')),
 expires_at timestamptz not null default now()+interval '24 hours', created_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, verified_at timestamptz, request_hash text,
 report_import_id uuid references public.report_imports(id), payroll_import_id uuid references public.payroll_imports(id),
 result jsonb, failure_message text
);
alter table public.upload_intents enable row level security;
revoke all on public.upload_intents from public,anon,authenticated;
grant select on public.upload_intents to authenticated;
grant all on public.upload_intents to service_role;
create policy upload_intent_read on public.upload_intents for select to authenticated using
 (public.is_active_user() and (public.is_owner() or (actor_id=auth.uid() and public.can_access_store(store_id))));
create function public.upload_actor_allowed(p_actor uuid,p_store uuid,p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.stores s on s.id=p_store and s.is_active=true
 where p.id=p_actor and p.is_active=true and (p.role='owner' or (p.role='manager' and p_kind not in('payroll','sales-bulk','sales-replacement')
 and exists(select 1 from public.store_users u where u.user_id=p.id and u.store_id=s.id))));
$$;
revoke all on function public.upload_actor_allowed(uuid,uuid,text) from public,anon,authenticated;
create function public.create_upload_intent(p_store uuid,p_kind text,p_name text,p_mime text,p_size bigint,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.upload_intents; bucket_name text; ext text; path text; begin
 if not public.upload_actor_allowed(auth.uid(),p_store,p_kind) then raise exception 'Upload access denied';end if;
 if p_name is null or length(p_name) not between 1 and 180 or p_name ~ '[[:cntrl:]/\\]' or p_size is null or p_size not between 1 and 15728640 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid upload metadata';end if;
 ext:=lower(substring(p_name from '\.([^.]+)$'));
 if p_kind in('rack','cleaning','manager-updates') then
  bucket_name:='review-photos';
  if not ((ext in('jpg','jpeg') and p_mime='image/jpeg') or (ext='png' and p_mime='image/png') or (ext='webp' and p_mime='image/webp')) then raise exception 'Invalid photo type';end if;
 else
  bucket_name:=case when p_kind='payroll' then 'payslips' else 'reports' end;
  if not ((ext='xlsx' and p_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') or (ext='xls' and p_mime='application/vnd.ms-excel') or (ext='csv' and p_mime in('text/csv','application/csv','text/plain','application/vnd.ms-excel')) or (p_kind='salary-attendance' and ext='pdf' and p_mime='application/pdf')) then raise exception 'Invalid workbook type';end if;
 end if;
 if ext is null or p_mime is null then raise exception 'File type required';end if;
 path:='uploads/'||p_store||'/'||gen_random_uuid()||'.'||ext;
 insert into public.upload_intents(actor_id,store_id,kind,bucket,file_path,file_name,mime_type,byte_size,fingerprint)
 values(auth.uid(),p_store,p_kind,bucket_name,path,p_name,p_mime,p_size,p_hash) returning * into i;
 if bucket_name<>'payslips' then insert into public.source_files(bucket_id,file_path,store_id,created_by,original_file_name) values(bucket_name,path,p_store,auth.uid(),p_name);end if;
 return to_jsonb(i)-'lease_id';
end $$;
create function public.can_upload_intent(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.upload_intents i where i.bucket=p_bucket and i.file_path=p_path and i.actor_id=auth.uid()
 and i.expires_at>now() and i.status in('created','uploading') and public.upload_actor_allowed(auth.uid(),i.store_id,i.kind));
$$;
create policy direct_upload_intent_scope on storage.objects as restrictive for insert to authenticated
 with check(name not like 'uploads/%' or public.can_upload_intent(bucket_id,name));
-- Existing reservations remain compatible until the coordinated release. New
-- browser workflows exclusively use uploads/ paths, checked above and at claim.
create function public.start_upload_intent(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.upload_intents set status='uploading' where id=p_id and actor_id=auth.uid() and expires_at>now() and status in('created','uploading') and public.upload_actor_allowed(auth.uid(),store_id,kind);
 if not found then raise exception 'Upload unavailable or expired';end if;
end $$;
create function public.upload_object_arrived() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.upload_intents;begin
 -- Storage's TUS permission probe inserts NULL metadata in a rolled-back transaction.
 -- Never transition an intent on that probe; final objects supply size/MIME.
 if new.metadata is null then return new;end if;
 if new.name like 'uploads/%' then
  select * into i from public.upload_intents where bucket=new.bucket_id and file_path=new.name;
  if not found or i.expires_at<=now() or i.status not in('created','uploading') or (new.metadata->>'size')::bigint is distinct from i.byte_size or new.metadata->>'mimetype' is distinct from i.mime_type then raise exception 'Upload object does not match its intent';end if;
  update public.upload_intents set status='uploaded' where id=i.id;
 end if;
 return new;
end $$;
create trigger upload_object_received after insert on storage.objects for each row execute function public.upload_object_arrived();
revoke all on function public.start_upload_intent(uuid),public.upload_object_arrived() from public,anon,authenticated;
grant execute on function public.start_upload_intent(uuid) to authenticated;
create function public.claim_upload_intent(p_id uuid,p_actor uuid,p_kind text,p_request_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.upload_intents; begin
 select * into i from public.upload_intents where id=p_id for update;
 if not found or i.actor_id<>p_actor or i.kind<>p_kind or not public.upload_actor_allowed(p_actor,i.store_id,i.kind) then raise exception 'Upload access denied';end if;
 if i.status='processed' then return to_jsonb(i)-'lease_id';end if;
 if i.expires_at<=now() then raise exception 'Upload intent expired. Select the file for a new upload.';end if;
 if i.status='processing' and i.lease_until>now() then raise exception 'Upload is already processing. Wait before retrying.';end if;
 if i.request_hash is not null and i.request_hash<>p_request_hash then raise exception 'Upload form changed. Start a new upload.';end if;
 if not exists(select 1 from storage.objects where bucket_id=i.bucket and name=i.file_path and (metadata->>'size')::bigint=i.byte_size and metadata->>'mimetype'=i.mime_type) then raise exception 'Uploaded object missing or metadata differs';end if;
 update public.upload_intents set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '330 seconds',request_hash=p_request_hash,failure_message=null where id=i.id returning * into i;
 return to_jsonb(i);
end $$;
create function public.verify_upload_intent(p_id uuid,p_lease uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.upload_intents set verified_at=now() where id=p_id and lease_id=p_lease and status='processing' and lease_until>now() and fingerprint=p_hash;
 if not found then raise exception 'Upload verification failed';end if;
end $$;
create function public.bind_upload_import(p_id uuid,p_lease uuid,p_run uuid,p_payroll boolean) returns void
language plpgsql security definer set search_path='' as $$
declare i public.upload_intents; begin
 select * into i from public.upload_intents where id=p_id for update;
 if not found or i.lease_id is distinct from p_lease or i.status<>'processing' or i.verified_at is null or i.lease_until<=now() or not public.upload_actor_allowed(i.actor_id,i.store_id,i.kind) then raise exception 'Verified upload required';end if;
 if p_payroll then
  if i.kind<>'payroll' then raise exception 'Wrong upload module';end if;
  update public.payroll_imports set file_path=i.file_path where id=p_run and actor_id=i.actor_id and status<>'processed' and fingerprint=i.fingerprint;
  if not found then raise exception 'Payroll import unavailable';end if;
  update public.upload_intents set payroll_import_id=p_run where id=i.id;
 else
  update public.report_imports set file_path=i.file_path where id=p_run and actor_id=i.actor_id and store_id=i.store_id and status<>'processed'
   and report_type=case when i.kind in('sales','sales-bulk','sales-replacement') then 'sales' when i.kind='salary-attendance' then 'salary_attendance' else i.kind end;
  if not found then raise exception 'Report import unavailable';end if;
  update public.upload_intents set report_import_id=p_run where id=i.id;
 end if;
end $$;
create function public.finish_upload_intent(p_id uuid,p_lease uuid,p_ok boolean,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if pg_column_size(p_result)>65536 then raise exception 'Result too large';end if;
 update public.upload_intents set status=case when p_ok then 'processed' else 'failed' end,result=p_result,
 failure_message=case when p_ok then null else 'Processing did not complete. Original source retained; retry or review the file.' end,lease_until=null
 where id=p_id and lease_id=p_lease and status<>'processed';
end $$;
-- Completion follows publication inside the same database transaction, including
-- lost HTTP responses. Reusing a consumed intent returns its saved result.
create function public.complete_bound_upload() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='processed' then
  if tg_table_name='report_imports' then
   update public.upload_intents set status='processed',result=new.result,lease_until=null where report_import_id=new.id;
  else
   update public.upload_intents set status='processed',result=jsonb_build_object('ok',true,'message','Payroll imported.','batchId',new.batch_id),lease_until=null where payroll_import_id=new.id;
  end if;
 end if;
 return new;
end $$;
create trigger report_upload_completed after update of status on public.report_imports for each row execute function public.complete_bound_upload();
create trigger payroll_upload_completed after update of status on public.payroll_imports for each row execute function public.complete_bound_upload();
create function public.complete_photo_upload() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.photo_path is not distinct from old.photo_path then return new;end if;
 if new.photo_path like 'uploads/%' then
  update public.upload_intents set status='processed',result=jsonb_build_object('ok',true,'message','Photo and record saved.','recordId',new.id),lease_until=null
   where file_path=new.photo_path and bucket='review-photos' and store_id=new.store_id
   and actor_id=auth.uid() and public.upload_actor_allowed(auth.uid(),store_id,kind)
   and kind=case tg_table_name when 'rack_reviews' then 'rack' when 'cleaning_reviews' then 'cleaning' else 'manager-updates' end
   and status='processing' and verified_at is not null and lease_until>now();
  if not found then raise exception 'Verified photo intent required';end if;
 end if;
 return new;
end $$;
create trigger rack_upload_completed after insert or update of photo_path on public.rack_reviews for each row when (new.photo_path is not null) execute function public.complete_photo_upload();
create trigger cleaning_upload_completed after insert or update of photo_path on public.cleaning_reviews for each row when (new.photo_path is not null) execute function public.complete_photo_upload();
create trigger update_upload_completed after insert or update of photo_path on public.manager_updates for each row when (new.photo_path is not null) execute function public.complete_photo_upload();
revoke all on function public.create_upload_intent(uuid,text,text,text,bigint,text),public.can_upload_intent(text,text) from public,anon;
grant execute on function public.create_upload_intent(uuid,text,text,text,bigint,text),public.can_upload_intent(text,text) to authenticated;
revoke all on function public.claim_upload_intent(uuid,uuid,text,text),public.verify_upload_intent(uuid,uuid,text),public.bind_upload_import(uuid,uuid,uuid,boolean),public.finish_upload_intent(uuid,uuid,boolean,jsonb),public.complete_bound_upload(),public.complete_photo_upload() from public,anon,authenticated;
grant execute on function public.claim_upload_intent(uuid,uuid,text,text),public.verify_upload_intent(uuid,uuid,text),public.bind_upload_import(uuid,uuid,uuid,boolean),public.finish_upload_intent(uuid,uuid,boolean,jsonb) to service_role;
commit;
