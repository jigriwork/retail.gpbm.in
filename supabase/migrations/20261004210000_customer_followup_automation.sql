-- Budgeted customer follow-up automation and delivery-cost evidence.
begin;

alter table public.whatsapp_deliveries drop constraint if exists whatsapp_deliveries_kind_check;
alter table public.whatsapp_deliveries add constraint whatsapp_deliveries_kind_check
  check (kind in ('customer_thank_you', 'customer_follow_up', 'payslip'));

alter table public.whatsapp_deliveries
  add column unit_cost_inr numeric(10,4) not null default 0,
  add column brand_code text check (brand_code is null or brand_code in ('GP', 'BM'));

update public.whatsapp_deliveries
set unit_cost_inr = case when kind = 'payslip' then 0.115 else 0.8631 end
where unit_cost_inr = 0;

update public.whatsapp_deliveries d set brand_code = s.code
from public.stores s
where s.id = d.store_id and s.code in ('GP', 'BM') and d.brand_code is null;

create index whatsapp_deliveries_monthly_budget_idx on public.whatsapp_deliveries(store_id, created_at, status);
create index whatsapp_deliveries_recipient_frequency_idx on public.whatsapp_deliveries(store_id, recipient, kind, created_at desc);

create or replace function public.customer_followup_candidates(p_store uuid, p_limit integer default 50)
returns table(mobile text, name text, last_visit date, bills bigint, spend numeric)
language sql stable security definer set search_path = '' as $$
  with purchases as (
    select regexp_replace(coalesce(s.customer_mobile, s.customer_phone, ''), '[^0-9]', '', 'g') as mobile,
      (array_agg(nullif(btrim(s.customer_name), '') order by s.sale_date desc)
        filter (where nullif(btrim(s.customer_name), '') is not null))[1] as name,
      max(s.sale_date) as last_visit,
      count(distinct s.sale_date::text || ':' || coalesce(s.bill_no, '')) as bills,
      coalesce(sum(s.net_sale), 0) as spend
    from public.sales_rows s
    join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.store_id = p_store and s.sale_date is not null
    group by regexp_replace(coalesce(s.customer_mobile, s.customer_phone, ''), '[^0-9]', '', 'g')
  )
  select p.mobile, coalesce(cp.preferred_name, p.name, 'Customer'), p.last_visit, p.bills, p.spend
  from purchases p join public.customer_profiles cp on cp.mobile = p.mobile
  where p.mobile ~ '^[6-9][0-9]{9}$'
    and p.last_visit < public.india_today() - 60
    and cp.marketing_consent and not cp.do_not_contact
    and not exists (
      select 1 from public.whatsapp_deliveries d
      where d.store_id = p_store and d.recipient = '91' || p.mobile and d.kind = 'customer_follow_up'
        and d.status in ('processing', 'accepted', 'delivered', 'read')
        and d.created_at >= now() - interval '60 days'
    )
  order by case when p.last_visit >= public.india_today() - 90 then 0 else 1 end,
    p.spend desc, p.last_visit desc, p.mobile
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.customer_followup_candidates(uuid, integer) from public, anon, authenticated;
grant execute on function public.customer_followup_candidates(uuid, integer) to service_role;

commit;
