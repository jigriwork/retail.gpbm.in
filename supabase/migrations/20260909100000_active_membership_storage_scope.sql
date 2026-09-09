-- H03/H04. Forward-only; no business rows or Storage objects are changed.
begin;
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_active=true);
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_active=true and role='owner');
$$;
create or replace function public.user_store_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select su.store_id from public.store_users su
  join public.profiles p on p.id=su.user_id
  join public.stores s on s.id=su.store_id
  where p.id=auth.uid() and p.is_active=true and p.role='manager' and s.is_active=true;
$$;
create or replace function public.can_access_store(p_store_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.stores s where s.id=p_store_id and s.is_active=true)
    and (public.is_owner() or p_store_id in(select public.user_store_ids()));
$$;
-- A restrictive policy ANDs with every existing permissive policy, including
-- direct user-id policies. Security-definer helpers avoid recursive profile RLS.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('drop policy if exists active_profile_required on public.%I',t.tablename);
    execute format('create policy active_profile_required on public.%I as restrictive for all to anon,authenticated using (public.is_active_user()) with check (public.is_active_user())',t.tablename);
  end loop;
end $$;
drop policy if exists tasks_manager_select_allowed on public.tasks;
drop policy if exists tasks_manager_update_allowed on public.tasks;
create policy tasks_manager_select_allowed on public.tasks for select to authenticated
 using (store_id in(select public.user_store_ids()) and coalesce(is_private,false)=false);
create policy tasks_manager_update_allowed on public.tasks for update to authenticated
 using (store_id in(select public.user_store_ids()) and coalesce(is_private,false)=false)
 with check (store_id in(select public.user_store_ids()) and coalesce(is_private,false)=false);

create table if not exists public.source_files (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null check(bucket_id in ('reports','review-photos')),
  file_path text not null,
  store_id uuid not null references public.stores(id),
  created_by uuid not null references public.profiles(id),
  original_file_name text not null,
  created_at timestamptz not null default now(),
  unique(bucket_id,file_path)
);
alter table public.source_files enable row level security;
revoke all on public.source_files from anon,authenticated;
grant select on public.source_files to authenticated;
create policy source_files_scoped_read on public.source_files for select to authenticated
 using (public.can_access_store(store_id));

-- The database chooses paths; callers cannot register a foreign existing object
-- as their own. Preserve GP/BM folder conventions and reject unrecognized kinds.
create or replace function public.reserve_source_file(p_store_id uuid,p_bucket text,p_kind text,p_file_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare code text; path text; begin
  if not public.can_access_store(p_store_id) then raise exception 'Store access denied'; end if;
  if not ((p_bucket='reports' and p_kind in('sales','sales-bulk','stock','salary-attendance'))
       or (p_bucket='review-photos' and p_kind in('rack','cleaning','manager-updates'))) then
    raise exception 'Invalid source kind';
  end if;
  if p_file_name is null or length(p_file_name)>255 then raise exception 'Invalid file name'; end if;
  select lower(s.code) into code from public.stores s where s.id=p_store_id;
  path:=p_kind||'/'||code||'/'||to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD')||'/'||gen_random_uuid()::text||'-'||regexp_replace(p_file_name,'[^a-zA-Z0-9._-]','-','g');
  insert into public.source_files(bucket_id,file_path,store_id,created_by,original_file_name)
   values(p_bucket,path,p_store_id,auth.uid(),p_file_name);
  return path;
end $$;

create or replace function public.can_read_source(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
 select public.is_active_user() and (
   exists(select 1 from public.source_files f where f.bucket_id=p_bucket and f.file_path=p_path and public.can_access_store(f.store_id))
   or (p_bucket='reports' and exists(select 1 from public.reports r where r.file_path=p_path and public.can_access_store(r.store_id)))
   or (p_bucket='reports' and exists(select 1 from public.sales_upload_batches b where b.file_path=p_path and public.can_access_store(b.store_id)))
   or (p_bucket='review-photos' and (
     exists(select 1 from public.rack_reviews r where r.photo_path=p_path and public.can_access_store(r.store_id))
     or exists(select 1 from public.cleaning_reviews r where r.photo_path=p_path and public.can_access_store(r.store_id))
     or exists(select 1 from public.manager_updates r where r.photo_path=p_path and public.can_access_store(r.store_id))
   ))
 );
$$;
create or replace function public.can_upload_source(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.source_files f where f.bucket_id=p_bucket and f.file_path=p_path
   and f.created_by=auth.uid() and public.can_access_store(f.store_id));
$$;
-- Prevent browser writes from laundering a foreign path through an assigned
-- review/update row. Existing unchanged legacy paths continue to work.
create function public.validate_photo_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.photo_path is null then return new; end if;
 if tg_op='UPDATE' and new.photo_path is not distinct from old.photo_path and new.store_id is not distinct from old.store_id then return new; end if;
 if not exists(select 1 from public.source_files f where f.bucket_id='review-photos' and f.file_path=new.photo_path and f.store_id=new.store_id) then
  raise exception 'Photo must belong to the report store';
 end if;
 return new;
end $$;
create trigger validate_rack_photo before insert or update on public.rack_reviews for each row execute function public.validate_photo_source();
create trigger validate_cleaning_photo before insert or update on public.cleaning_reviews for each row execute function public.validate_photo_source();
create trigger validate_update_photo before insert or update on public.manager_updates for each row execute function public.validate_photo_source();
revoke all on function public.validate_photo_source() from public,anon,authenticated;

-- Names verified against deployed pg_policies on 2026-09-09.
drop policy if exists storage_reports_owner_all on storage.objects;
drop policy if exists storage_reports_authenticated_insert on storage.objects;
drop policy if exists storage_reports_authenticated_select on storage.objects;
drop policy if exists storage_review_photos_owner_all on storage.objects;
drop policy if exists storage_review_photos_authenticated_insert on storage.objects;
drop policy if exists storage_review_photos_authenticated_select on storage.objects;
create policy sources_scoped_select on storage.objects for select to authenticated
 using (bucket_id in ('reports','review-photos') and public.can_read_source(bucket_id,name));
create policy sources_reserved_insert on storage.objects for insert to authenticated
 with check (bucket_id in ('reports','review-photos') and public.can_upload_source(bucket_id,name));
-- Defense against future broad permissive policies. No client physical deletion
-- or overwrite of original evidence, including owners. Payslips remain owner-only.
create policy source_read_guard on storage.objects as restrictive for select to anon,authenticated
 using (case when bucket_id in ('reports','review-photos') then public.can_read_source(bucket_id,name) else public.is_owner() end);
create policy source_insert_guard on storage.objects as restrictive for insert to anon,authenticated
 with check (case when bucket_id in ('reports','review-photos') then public.can_upload_source(bucket_id,name) else public.is_owner() end);
create policy source_update_guard on storage.objects as restrictive for update to anon,authenticated
 using (bucket_id not in ('reports','review-photos') and public.is_owner())
 with check (bucket_id not in ('reports','review-photos') and public.is_owner());
create policy source_delete_guard on storage.objects as restrictive for delete to anon,authenticated
 using (bucket_id not in ('reports','review-photos') and public.is_owner());

revoke all on function public.is_active_user(),public.is_owner(),public.user_store_ids(),public.can_access_store(uuid),public.reserve_source_file(uuid,text,text,text),public.can_read_source(text,text),public.can_upload_source(text,text) from public,anon;
grant execute on function public.is_active_user(),public.is_owner(),public.user_store_ids(),public.can_access_store(uuid),public.can_read_source(text,text),public.can_upload_source(text,text) to authenticated,anon;
grant execute on function public.reserve_source_file(uuid,text,text,text) to authenticated;
commit;
