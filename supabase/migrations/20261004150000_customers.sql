-- Customers from the bills: Logic's bill-wise report already carries the
-- customer's mobile (RCU MOBILE NO.) and name (RCU NAME) on most bills.
-- Each sales line gets a cleaned mobile and name; a customer is one mobile
-- across all stores. Profiles hold the birthday and marketing consent (DPDP:
-- offers only to customers who agreed; withdrawal at any time). A message log
-- records which WhatsApp messages were opened for sending.
--
-- Managers see the customers who bought at their store, and only the purchases
-- made there; the owner sees everyone.
begin;

-- Indian mobile: 10 digits starting 6-9, after removing +91 / 0 prefixes.
create function public.normalize_in_mobile(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when d ~ '^[6-9][0-9]{9}$' then d end
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^(91|0)(?=[6-9][0-9]{9}$)', '') as d) x
$$;

-- Customer name, ignoring Logic's placeholders (NIL, NILL, NIL NIL NIL, CASH ...).
create function public.clean_customer_name(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when n = '' or n ~ '^(NIL+|NA|N/A|CASH|CUSTOMER|WALK ?IN|\.|-)( (NIL+|NA|CASH|CUSTOMER))*$' then null else initcap(lower(n)) end
  from (select upper(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))) as n) x
$$;

-- customer_phone (raw, from the parser) and customer_name (never filled until now) already exist.
alter table public.sales_rows add column customer_mobile text;

create or replace function public.sales_rows_derive_fields() returns trigger
language plpgsql set search_path = '' as $$
declare r jsonb := coalesce(new.raw_data, '{}'::jsonb);
begin
  new.unit_rate := public.finance_num(r->>'RATE');
  new.gross_amount := public.finance_num(r->>'GROSS AMOUNT');
  new.cd_percent := public.finance_num(r->>'CD(%)');
  new.cd_amount := public.finance_num(r->>'CD VALUE');
  new.scheme_unit_amount := public.finance_num(r->>'SCH.(Unit)');
  new.scheme_amount := public.finance_num(r->>'SCH.(RS.)');
  new.taxable_amount := public.finance_num(r->>'TAXABLE AMOUNT');
  new.cgst_rate := public.finance_num(r->>'CGST %');
  new.cgst_amount := public.finance_num(r->>'CGST (RS)');
  new.sgst_rate := public.finance_num(r->>'SGST %');
  new.sgst_amount := public.finance_num(r->>'SGST (RS)');
  new.tax_amount := public.finance_num(r->>'TOTAL TAX');
  new.hsn_code := nullif(btrim(r->>'HSN CODE'), '');
  new.lot_code := nullif(btrim(r->>'LOT CODE'), '');
  new.lot_number := nullif(btrim(r->>'LOT NUMBER'), '');
  new.article_code := nullif(btrim(r->>'ADDITIONAL ITEM CODE'), '');
  new.source_line_no := case when btrim(r->>'SNO.') ~ '^[0-9]{1,9}$' then btrim(r->>'SNO.')::integer end;
  new.customer_mobile := coalesce(public.normalize_in_mobile(r->>'RCU MOBILE NO.'), public.normalize_in_mobile(new.customer_phone));
  new.customer_name := coalesce(public.clean_customer_name(r->>'RCU NAME'), public.clean_customer_name(new.customer_name));
  new.line_kind := case
    when new.bill_no is null and new.item_name is null then 'summary'
    when new.quantity is null and new.net_sale is null then 'no_amount'
    else 'item' end;
  new.amounts_reconciled := case
    when new.gross_amount is null or new.net_sale is null then null
    else abs(new.net_sale - (new.gross_amount + coalesce(new.cd_amount, 0) + coalesce(new.scheme_unit_amount, 0) + coalesce(new.scheme_amount, 0))) <= 1
      and (new.taxable_amount is null or new.tax_amount is null or abs(new.net_sale - (new.taxable_amount + new.tax_amount)) <= 0.05)
    end;
  return new;
end $$;

-- Existing rows (updating these two columns does not fire the trigger).
update public.sales_rows
set customer_mobile = coalesce(public.normalize_in_mobile(raw_data->>'RCU MOBILE NO.'), public.normalize_in_mobile(customer_phone)),
    customer_name = coalesce(public.clean_customer_name(raw_data->>'RCU NAME'), public.clean_customer_name(customer_name))
where raw_data ? 'RCU MOBILE NO.' or raw_data ? 'RCU NAME' or customer_phone is not null or customer_name is not null;

create index sales_rows_customer on public.sales_rows (customer_mobile, store_id, sale_date) where customer_mobile is not null;

alter table public.stores add column google_review_url text
  check (google_review_url is null or (google_review_url ~ '^https://' and length(google_review_url) <= 300));

create table public.customer_profiles (
  mobile text primary key check (mobile ~ '^[6-9][0-9]{9}$'),
  preferred_name text check (preferred_name is null or length(preferred_name) <= 80),
  birthday date,
  anniversary date,
  marketing_consent boolean not null default false,
  consent_source text check (consent_source is null or consent_source in ('in_store', 'whatsapp_reply', 'form')),
  consent_at timestamptz,
  consent_by uuid references public.profiles(id),
  withdrawn_at timestamptz,
  do_not_contact boolean not null default false,
  note text check (note is null or length(note) <= 300),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  store_id uuid not null references public.stores(id),
  kind text not null check (kind in ('thank_you', 'lapsed_offer', 'birthday', 'custom')),
  sent_by uuid not null default auth.uid() references public.profiles(id),
  sent_at timestamptz not null default now()
);
create index customer_messages_mobile on public.customer_messages (mobile, sent_at desc);

-- A manager may see a customer who has bought at one of their stores.
create function public.customer_visible(p_mobile text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (public.is_owner() or exists (
    select 1 from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current
    where s.customer_mobile = p_mobile and s.store_id in (select public.user_store_ids())))
$$;

alter table public.customer_profiles enable row level security;
alter table public.customer_messages enable row level security;
revoke all on public.customer_profiles, public.customer_messages from anon, authenticated;
grant select on public.customer_profiles, public.customer_messages to authenticated;
create policy customer_profiles_read on public.customer_profiles for select to authenticated using (public.customer_visible(mobile));
create policy customer_messages_read on public.customer_messages for select to authenticated
  using (public.is_active_user() and public.can_access_store(store_id));

-- Saves the birthday / name / consent; consent changes are timestamped and audited.
create function public.save_customer_profile(p_mobile text, p_name text, p_birthday date, p_anniversary date,
  p_consent boolean, p_source text, p_do_not_contact boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.customer_profiles;
begin
  if not public.customer_visible(p_mobile) then raise exception 'Customer not found.'; end if;
  if coalesce(p_consent, false) and coalesce(p_source, '') not in ('in_store', 'whatsapp_reply', 'form') then raise exception 'Say how the customer agreed.'; end if;
  select * into v_old from public.customer_profiles where mobile = p_mobile;
  insert into public.customer_profiles(mobile, preferred_name, birthday, anniversary, marketing_consent, consent_source, consent_at, consent_by,
    withdrawn_at, do_not_contact, note, updated_by, updated_at)
  values (p_mobile, nullif(btrim(coalesce(p_name, '')), ''), p_birthday, p_anniversary, coalesce(p_consent, false) and not coalesce(p_do_not_contact, false),
    case when p_consent then p_source end, case when p_consent then now() end, case when p_consent then auth.uid() end,
    null, coalesce(p_do_not_contact, false), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (mobile) do update set preferred_name = excluded.preferred_name, birthday = excluded.birthday, anniversary = excluded.anniversary,
    marketing_consent = excluded.marketing_consent,
    consent_source = case when excluded.marketing_consent and not v_old.marketing_consent then excluded.consent_source
                          when excluded.marketing_consent then customer_profiles.consent_source end,
    consent_at = case when excluded.marketing_consent and not v_old.marketing_consent then now()
                      when excluded.marketing_consent then customer_profiles.consent_at end,
    consent_by = case when excluded.marketing_consent and not v_old.marketing_consent then auth.uid()
                      when excluded.marketing_consent then customer_profiles.consent_by end,
    withdrawn_at = case when v_old.marketing_consent and not excluded.marketing_consent then now() else customer_profiles.withdrawn_at end,
    do_not_contact = excluded.do_not_contact, note = excluded.note, updated_by = auth.uid(), updated_at = now();
  if coalesce(v_old.marketing_consent, false) is distinct from (coalesce(p_consent, false) and not coalesce(p_do_not_contact, false)) then
    insert into public.audit_logs(actor_id, actor_role, action, entity_type, metadata)
    values (auth.uid(), (select role from public.profiles where id = auth.uid()),
      case when p_consent and not coalesce(p_do_not_contact, false) then 'customer_consent_given' else 'customer_consent_withdrawn' end,
      'customer', jsonb_build_object('mobile_last4', right(p_mobile, 4), 'source', p_source));
  end if;
end $$;

-- Records a WhatsApp message being opened for sending. Offers need consent;
-- a thank-you needs a purchase at that store in the last 3 days.
create function public.log_customer_message(p_mobile text, p_store uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile public.customer_profiles;
begin
  if not public.can_access_store(p_store) then raise exception 'You cannot message for this store.'; end if;
  if not exists (select 1 from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current
                 where s.customer_mobile = p_mobile and s.store_id = p_store) then raise exception 'Customer not found.'; end if;
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

-- One row per customer for a store (or all stores for the owner).
-- Segments: all, new (first purchase in the last 30 days), repeat (2+ bills),
-- lapsed (2+ bills, none in 90 days), recent (bought in the last 3 days),
-- birthday (birthday in the next 7 days), top (by spend).
create function public.customer_list(p_store uuid, p_segment text, p_search text, p_limit integer, p_offset integer)
returns table (mobile text, name text, first_visit date, last_visit date, bills bigint, items numeric, spend numeric,
  store_count bigint, marketing_consent boolean, do_not_contact boolean, birthday date, last_message_at timestamptz, total_count bigint)
language sql stable security definer set search_path = '' as $$
  with scope as (
    select s.customer_mobile, s.customer_name, s.store_id, s.sale_date, s.bill_no, s.quantity, s.net_sale
    from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.customer_mobile is not null and s.line_kind = 'item'
      and ((p_store is null and public.is_owner()) or (p_store is not null and public.can_access_store(p_store) and s.store_id = p_store))
  ), agg as (
    select c.customer_mobile as mobile,
      (array_agg(c.customer_name order by c.sale_date desc) filter (where c.customer_name is not null))[1] as name,
      min(c.sale_date) as first_visit, max(c.sale_date) as last_visit,
      count(distinct c.store_id::text || c.bill_no) as bills, coalesce(sum(c.quantity), 0) as items, coalesce(sum(c.net_sale), 0) as spend,
      count(distinct c.store_id) as store_count
    from scope c group by c.customer_mobile
  ), joined as (
    select a.*, coalesce(p.preferred_name, a.name) as display_name, coalesce(p.marketing_consent, false) as consent,
      coalesce(p.do_not_contact, false) as dnc, p.birthday as bday,
      (select max(m.sent_at) from public.customer_messages m where m.mobile = a.mobile) as last_msg
    from agg a left join public.customer_profiles p on p.mobile = a.mobile
  ), filtered as (
    select * from joined j
    where (coalesce(p_search, '') = '' or j.mobile like '%' || regexp_replace(p_search, '[^0-9]', '', 'g') || '%' and regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
           or j.display_name ilike '%' || btrim(p_search) || '%')
      and case coalesce(p_segment, 'all')
        when 'new' then j.first_visit >= public.india_today() - 30
        when 'repeat' then j.bills >= 2
        when 'lapsed' then j.bills >= 2 and j.last_visit < public.india_today() - 90
        when 'recent' then j.last_visit >= public.india_today() - 3
        when 'birthday' then j.bday is not null and exists (
          select 1 from generate_series(public.india_today(), public.india_today() + 7, interval '1 day') d
          where to_char(d, 'MM-DD') = to_char(j.bday, 'MM-DD'))
        else true end
  )
  select f.mobile, f.display_name, f.first_visit, f.last_visit, f.bills, f.items, f.spend, f.store_count, f.consent, f.dnc, f.bday, f.last_msg,
    count(*) over ()
  from filtered f
  order by case when p_segment = 'top' then f.spend end desc nulls last,
           case when p_segment = 'lapsed' then f.last_visit end asc,
           f.last_visit desc, f.spend desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Headline numbers for a period: customers, new vs returning, capture rate.
create function public.customer_kpis(p_store uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with lines as (
    select s.customer_mobile, s.store_id, s.bill_no, s.sale_date, s.net_sale
    from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.line_kind = 'item' and s.bill_no is not null
      and ((p_store is null and public.is_owner()) or (p_store is not null and public.can_access_store(p_store) and s.store_id = p_store))
  ), period as (select * from lines where sale_date between p_from and p_to),
  firsts as (select customer_mobile, min(sale_date) as first_visit, count(distinct store_id::text || bill_no) as bills
             from lines where customer_mobile is not null group by customer_mobile)
  select jsonb_build_object(
    'bills', (select count(distinct store_id::text || bill_no) from period),
    'bills_with_mobile', (select count(distinct store_id::text || bill_no) from period where customer_mobile is not null),
    'customers', (select count(distinct customer_mobile) from period where customer_mobile is not null),
    'new_customers', (select count(*) from firsts f where f.first_visit between p_from and p_to),
    'returning_customers', (select count(distinct p.customer_mobile) from period p join firsts f using (customer_mobile) where f.first_visit < p_from),
    'repeat_customers_all_time', (select count(*) from firsts where bills >= 2),
    'customers_all_time', (select count(*) from firsts),
    'spend_known_customers', (select coalesce(sum(net_sale), 0) from period where customer_mobile is not null),
    'spend_all', (select coalesce(sum(net_sale), 0) from period))
  where (p_store is null and public.is_owner()) or (p_store is not null and public.can_access_store(p_store))
$$;

-- A customer's purchases at the stores the viewer may see.
create function public.customer_purchases(p_mobile text)
returns table (sale_date date, store_name text, bill_no text, item_name text, brand text, size text, quantity numeric, net_sale numeric, staff_name text, customer_name text)
language sql stable security definer set search_path = '' as $$
  select s.sale_date, st.name, s.bill_no, s.item_name, s.brand, s.raw_data->>'PACK / SIZE', s.quantity, s.net_sale, s.staff_name, s.customer_name
  from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
  join public.stores st on st.id = s.store_id
  where s.customer_mobile = p_mobile and s.line_kind = 'item' and public.can_access_store(s.store_id)
  order by s.sale_date desc, s.bill_no, s.source_line_no nulls last
  limit 500
$$;

revoke all on function public.normalize_in_mobile(text), public.clean_customer_name(text) from public, anon;
grant execute on function public.normalize_in_mobile(text), public.clean_customer_name(text) to authenticated, service_role;
revoke all on function public.customer_visible(text), public.save_customer_profile(text, text, date, date, boolean, text, boolean, text),
  public.log_customer_message(text, uuid, text), public.customer_list(uuid, text, text, integer, integer),
  public.customer_kpis(uuid, date, date), public.customer_purchases(text) from public, anon;
grant execute on function public.customer_visible(text), public.save_customer_profile(text, text, date, date, boolean, text, boolean, text),
  public.log_customer_message(text, uuid, text), public.customer_list(uuid, text, text, integer, integer),
  public.customer_kpis(uuid, date, date), public.customer_purchases(text) to authenticated;

commit;
