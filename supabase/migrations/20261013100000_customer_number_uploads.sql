-- Customer numbers uploaded by the owner or a store's manager (Excel / CSV
-- with names). One contact per store and mobile; uploaded customers join the
-- customer list even before they buy. Consent ticked at upload is recorded as
-- source 'upload' (never over a customer who asked us to stop).
begin;

alter table public.customer_profiles drop constraint if exists customer_profiles_consent_source_check;
alter table public.customer_profiles add constraint customer_profiles_consent_source_check
  check (consent_source is null or consent_source in ('in_store', 'whatsapp_reply', 'form', 'upload'));

create table public.customer_import_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  file_name text not null check (length(file_name) between 1 and 200),
  consent boolean not null default false,
  rows_received integer not null default 0,
  rows_valid integer not null default 0,
  rows_new integer not null default 0,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.customer_contacts (
  store_id uuid not null references public.stores(id),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  name text check (name is null or length(name) <= 80),
  batch_id uuid references public.customer_import_batches(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, mobile)
);
create index customer_contacts_mobile on public.customer_contacts (mobile);

alter table public.customer_import_batches enable row level security;
alter table public.customer_contacts enable row level security;
revoke all on public.customer_import_batches, public.customer_contacts from anon, authenticated;
grant select on public.customer_import_batches, public.customer_contacts to authenticated;
create policy customer_import_batches_read on public.customer_import_batches for select to authenticated
  using (public.is_owner() or public.can_access_store(store_id));
create policy customer_contacts_read on public.customer_contacts for select to authenticated
  using (public.is_owner() or public.can_access_store(store_id));

create function public.can_upload_customers(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and public.can_access_store(p_store) and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'manager'))
$$;

create function public.start_customer_import(p_store uuid, p_file text, p_consent boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_upload_customers(p_store) then raise exception 'You cannot add customers for this store.'; end if;
  insert into public.customer_import_batches(store_id, file_name, consent)
  values (p_store, left(coalesce(nullif(btrim(p_file), ''), 'upload'), 200), coalesce(p_consent, false))
  returning id into v_id;
  return v_id;
end $$;

-- p_rows: [{"m": "<mobile as written>", "n": "<name>"}], at most 2,000 per call.
create function public.import_customer_contacts(p_batch uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.customer_import_batches;
  v_received integer;
  v_valid integer;
  v_new integer;
begin
  select * into b from public.customer_import_batches where id = p_batch;
  if not found or b.created_by <> auth.uid() or not public.can_upload_customers(b.store_id) then
    raise exception 'This upload is not yours.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'Send at most 2,000 rows at a time.'; end if;
  v_received := jsonb_array_length(p_rows);

  create temporary table if not exists pg_temp.customer_import_rows (mobile text primary key, name text) on commit drop;
  truncate pg_temp.customer_import_rows;
  insert into pg_temp.customer_import_rows(mobile, name)
  select distinct on (m) m, n from (
    select public.normalize_in_mobile(x->>'m') as m, left(public.clean_customer_name(x->>'n'), 80) as n, ord
    from jsonb_array_elements(p_rows) with ordinality as t(x, ord)
  ) r where m is not null
  order by m, (n is null), ord;
  get diagnostics v_valid = row_count;

  with up as (
    insert into public.customer_contacts(store_id, mobile, name, batch_id, created_by)
    select b.store_id, r.mobile, r.name, b.id, auth.uid() from pg_temp.customer_import_rows r
    on conflict (store_id, mobile) do update
      set name = coalesce(excluded.name, public.customer_contacts.name), batch_id = excluded.batch_id, updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new from up;

  if b.consent then
    insert into public.customer_profiles(mobile, marketing_consent, consent_source, consent_at, consent_by, updated_by)
    select r.mobile, true, 'upload', now(), auth.uid(), auth.uid() from pg_temp.customer_import_rows r
    on conflict (mobile) do update
      set marketing_consent = true, consent_source = 'upload', consent_at = now(), consent_by = auth.uid(), updated_by = auth.uid(), updated_at = now()
      where not public.customer_profiles.marketing_consent
        and not public.customer_profiles.do_not_contact
        and public.customer_profiles.withdrawn_at is null;
  end if;

  update public.customer_import_batches
  set rows_received = rows_received + v_received, rows_valid = rows_valid + v_valid, rows_new = rows_new + v_new
  where id = b.id;
  return jsonb_build_object('received', v_received, 'valid', v_valid, 'new', v_new);
end $$;

-- Uploaded customers are visible to the store that uploaded them.
create or replace function public.customer_visible(p_mobile text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (public.is_owner() or exists (
    select 1 from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current
    where s.customer_mobile = p_mobile and s.store_id in (select public.user_store_ids()))
    or exists (select 1 from public.customer_contacts c where c.mobile = p_mobile and c.store_id in (select public.user_store_ids())))
$$;

-- WhatsApp buttons also work for uploaded customers of the store.
create or replace function public.log_customer_message(p_mobile text, p_store uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile public.customer_profiles;
begin
  if not public.can_access_store(p_store) then raise exception 'You cannot message for this store.'; end if;
  if not exists (select 1 from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current
                 where s.customer_mobile = p_mobile and s.store_id = p_store)
     and not exists (select 1 from public.customer_contacts c where c.mobile = p_mobile and c.store_id = p_store) then
    raise exception 'Customer not found.';
  end if;
  select * into v_profile from public.customer_profiles where mobile = p_mobile;
  if coalesce(v_profile.do_not_contact, false) then raise exception 'This customer asked not to be contacted.'; end if;
  if p_kind = 'thank_you' then
    if not exists (select 1 from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current
                   where s.customer_mobile = p_mobile and s.store_id = p_store and s.sale_date >= public.india_today() - 3) then
      raise exception 'A thank-you is only for a purchase in the last 3 days.';
    end if;
  elsif p_kind in ('lapsed_offer', 'birthday', 'custom') then
    if not coalesce(v_profile.marketing_consent, false) then raise exception 'Offers need the customer''s consent. Record it first.'; end if;
  else raise exception 'Unknown message'; end if;
  insert into public.customer_messages(mobile, store_id, kind) values (p_mobile, p_store, p_kind);
end $$;

-- The list now includes uploaded customers (no visits yet: visit dates null)
-- and a segment for them.
drop function public.customer_list(uuid, text, text, integer, integer);
create function public.customer_list(p_store uuid, p_segment text, p_search text, p_limit integer, p_offset integer)
returns table (mobile text, name text, first_visit date, last_visit date, bills bigint, items numeric, spend numeric,
  store_count bigint, marketing_consent boolean, do_not_contact boolean, birthday date, last_message_at timestamptz,
  uploaded boolean, total_count bigint)
language sql stable security definer set search_path = '' as $$
  with scope as (
    select s.customer_mobile, s.customer_name, s.store_id, s.sale_date, s.bill_no, s.quantity, s.net_sale
    from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.customer_mobile is not null and s.line_kind = 'item'
      and ((p_store is null and (select public.is_owner())) or (p_store is not null and (select public.can_access_store(p_store)) and s.store_id = p_store))
  ), contacts as (
    select c.mobile, c.name, c.store_id from public.customer_contacts c
    where (p_store is null and (select public.is_owner())) or (p_store is not null and (select public.can_access_store(p_store)) and c.store_id = p_store)
  ), agg as (
    select c.customer_mobile as mobile,
      (array_agg(c.customer_name order by c.sale_date desc) filter (where c.customer_name is not null))[1] as name,
      min(c.sale_date) as first_visit, max(c.sale_date) as last_visit,
      count(distinct c.store_id::text || c.bill_no) as bills, coalesce(sum(c.quantity), 0) as items, coalesce(sum(c.net_sale), 0) as spend,
      count(distinct c.store_id) as store_count
    from scope c group by c.customer_mobile
  ), uploaded as (
    select c.mobile, (array_agg(c.name) filter (where c.name is not null))[1] as name, count(distinct c.store_id) as stores
    from contacts c group by c.mobile
  ), merged as (
    select coalesce(a.mobile, u.mobile) as mobile, coalesce(a.name, u.name) as name, a.first_visit, a.last_visit,
      coalesce(a.bills, 0) as bills, coalesce(a.items, 0) as items, coalesce(a.spend, 0) as spend,
      coalesce(a.store_count, u.stores) as store_count, u.mobile is not null as is_uploaded
    from agg a full join uploaded u on u.mobile = a.mobile
  ), joined as (
    select m.*, coalesce(p.preferred_name, m.name) as display_name, coalesce(p.marketing_consent, false) as consent,
      coalesce(p.do_not_contact, false) as dnc, p.birthday as bday,
      (select max(cm.sent_at) from public.customer_messages cm where cm.mobile = m.mobile) as last_msg
    from merged m left join public.customer_profiles p on p.mobile = m.mobile
  ), filtered as (
    select * from joined j
    where (coalesce(p_search, '') = '' or j.mobile like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%' and regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
           or j.display_name ilike '%' || btrim(p_search) || '%')
      and case coalesce(p_segment, 'all')
        when 'new' then j.first_visit >= public.india_today() - 30
        when 'repeat' then j.bills >= 2
        when 'lapsed' then j.bills >= 2 and j.last_visit < public.india_today() - 90
        when 'recent' then j.last_visit >= public.india_today() - 3
        when 'uploaded' then j.is_uploaded
        when 'birthday' then j.bday is not null and exists (
          select 1 from generate_series(public.india_today(), public.india_today() + 7, interval '1 day') d
          where to_char(d, 'MM-DD') = to_char(j.bday, 'MM-DD'))
        else true end
  )
  select f.mobile, f.display_name, f.first_visit, f.last_visit, f.bills, f.items, f.spend, f.store_count, f.consent, f.dnc, f.bday, f.last_msg,
    f.is_uploaded, count(*) over ()
  from filtered f
  order by case when p_segment = 'top' then f.spend end desc nulls last,
           case when p_segment = 'lapsed' then f.last_visit end asc,
           f.last_visit desc nulls last, f.spend desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.customer_list(uuid, text, text, integer, integer), public.can_upload_customers(uuid),
  public.start_customer_import(uuid, text, boolean), public.import_customer_contacts(uuid, jsonb) from public, anon;
grant execute on function public.customer_list(uuid, text, text, integer, integer), public.can_upload_customers(uuid),
  public.start_customer_import(uuid, text, boolean), public.import_customer_contacts(uuid, jsonb) to authenticated;

commit;
