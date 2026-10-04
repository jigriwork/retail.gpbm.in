-- Daily WhatsApp summary for the owners (both stores in one message, sent
-- from the Go Planet number at 9:00 AM IST for the previous day).
--
-- owner_daily_summary_facts() gathers the figures; the app formats them into
-- the approved template. Staff names are merged with the same alias rule as
-- the Staff Sales report. Only the service role can call it.
begin;

alter table public.whatsapp_deliveries drop constraint if exists whatsapp_deliveries_kind_check;
alter table public.whatsapp_deliveries add constraint whatsapp_deliveries_kind_check
  check (kind in ('customer_thank_you', 'customer_follow_up', 'payslip', 'owner_summary'));

create or replace function public.owner_daily_summary_facts(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with month_start as (select date_trunc('month', p_day)::date as d),
  rep as (
    select r.id, r.store_id, r.report_date
    from public.reports r
    where r.report_type = 'sales' and r.is_current and r.status = 'processed'
      and r.report_date between least((select d from month_start), p_day - 34) and p_day
  ),
  lines as (
    select x.store_id, x.sale_date, nullif(btrim(x.bill_no), '') as bill_no, nullif(btrim(x.brand), '') as brand,
      coalesce(a.canonical_staff_name, nullif(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g'), '')) as staff,
      coalesce(x.net_sale, 0)::numeric as net, x.line_kind
    from public.sales_rows x
    join rep on rep.id = x.report_id
    left join public.staff_name_aliases a
      on a.store_id = x.store_id and a.source_type = 'sales_report' and a.is_active
      and a.normalized_source_name = lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g'))
  ),
  named as (
    select * from lines
    where staff is not null and staff !~* '^(nil|na|n/a|none|unspecified|-|0)$'
  )
  select jsonb_build_object(
    'day', p_day,
    'stores', coalesce((
      select jsonb_agg(store_facts order by store_facts->>'code')
      from (
        select jsonb_build_object(
          'code', s.code,
          'name', s.name,
          'status', case
            when not exists (select 1 from rep where rep.store_id = s.id and rep.report_date = p_day) then 'missing'
            when not exists (select 1 from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item') then 'summary_only'
            else 'bill_level' end,
          'sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day),
          'bills', (select count(distinct bill_no) from lines l where l.store_id = s.id and l.sale_date = p_day),
          'last_week_sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day - 7),
          'month_sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date between (select d from month_start) and p_day),
          'missing_days', (
            select count(*) from generate_series((select d from month_start), p_day, interval '1 day') g
            where not exists (select 1 from rep where rep.store_id = s.id and rep.report_date = g::date)),
          'summary_days', (
            select count(*) from rep
            where rep.store_id = s.id and rep.report_date >= (select d from month_start)
              and not exists (select 1 from lines l where l.store_id = s.id and l.sale_date = rep.report_date and l.line_kind = 'item')),
          'returns', (select -sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and net < 0),
          'return_brands', (
            select coalesce(jsonb_agg(brand order by amount desc), '[]'::jsonb) from (
              select brand, -sum(net) as amount from lines l
              where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and net < 0 and brand is not null
              group by brand order by 2 desc limit 2) b),
          'top_staff', (
            select jsonb_build_object('name', staff, 'sale', sale, 'bills', bills) from (
              select staff, sum(net) as sale, count(distinct bill_no) as bills from named n
              where n.store_id = s.id and n.sale_date = p_day and n.line_kind = 'item'
              group by staff having sum(net) > 0 order by 2 desc limit 1) t),
          'top_brands', (
            select coalesce(jsonb_agg(jsonb_build_object('name', brand, 'sale', sale) order by sale desc), '[]'::jsonb) from (
              select brand, sum(net) as sale from lines l
              where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and brand is not null
              group by brand having sum(net) > 0 order by 2 desc limit 2) b),
          -- Last 7 days per working day well below the person's own usual
          -- (previous 28 days, at least 5 working days). One day alone is noise.
          'attention', (
            select jsonb_build_object('name', staff, 'recent_per_day', round(recent_per_day), 'usual_per_day', round(usual_per_day)) from (
              select staff,
                sum(net) filter (where sale_date > p_day - 7) / nullif(count(distinct sale_date) filter (where sale_date > p_day - 7), 0) as recent_per_day,
                sum(net) filter (where sale_date <= p_day - 7) / nullif(count(distinct sale_date) filter (where sale_date <= p_day - 7), 0) as usual_per_day,
                count(distinct sale_date) filter (where sale_date > p_day - 7) as recent_days,
                count(distinct sale_date) filter (where sale_date <= p_day - 7) as usual_days
              from named n
              where n.store_id = s.id and n.line_kind = 'item' and n.sale_date between p_day - 34 and p_day
              group by staff) w
            where recent_days >= 2 and usual_days >= 5 and usual_per_day >= 1000 and recent_per_day < usual_per_day * 0.5
            order by recent_per_day / usual_per_day limit 1)
        ) as store_facts
        from public.stores s
        where s.is_active
      ) per_store
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.owner_daily_summary_facts(date) from public, anon, authenticated;
grant execute on function public.owner_daily_summary_facts(date) to service_role;

commit;

-- Exact 9:00 AM IST trigger (pg_cron runs in UTC: 03:30). Only where the
-- extensions exist (Supabase); the call does nothing until the secret
-- 'owner_summary_cron_secret' is stored in Vault (set outside migrations).
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('owner-daily-summary', '30 3 * * *', $job$
      select net.http_post(
        url := 'https://retail.gpbm.in/api/cron/owner-summary',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || s.decrypted_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000)
      from vault.decrypted_secrets s where s.name = 'owner_summary_cron_secret'
    $job$);
  end if;
end
$outer$;
