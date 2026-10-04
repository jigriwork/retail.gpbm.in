-- Owner summary: a trailing " S" on a staff name marks the shop counter, so
-- "SHAIK SHABAZ S" and "SHAIK SHABAZ" are one person (owner, 4 Oct 2026).
-- Applies to the summary only; Staff Sales and incentives use their aliases.
begin;

create or replace function public.owner_daily_summary_facts(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('month', p_day)::date as month_start,
           (date_trunc('month', p_day) - interval '1 month')::date as prev_start,
           (date_trunc('month', p_day) - interval '1 day')::date as prev_end
  ),
  rep as (
    select r.id, r.store_id, r.report_date
    from public.reports r
    where r.report_type = 'sales' and r.is_current and r.status = 'processed'
      and r.report_date between least((select prev_start from bounds), p_day - 34) and p_day
  ),
  lines as (
    select x.store_id, x.sale_date, nullif(btrim(x.bill_no), '') as bill_no, nullif(btrim(x.brand), '') as brand,
      -- A trailing " S" marks the shop counter ("SHAIK SHABAZ S" = "SHAIK SHABAZ").
      nullif(regexp_replace(coalesce(a.canonical_staff_name, a2.canonical_staff_name,
        regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')), '\s+[sS]$', ''), '') as staff,
      coalesce(x.net_sale, 0)::numeric as net, coalesce(x.quantity, 0)::numeric as qty,
      case when x.mrp > 0 then x.mrp * coalesce(x.quantity, 0) end as mrp_value, x.line_kind
    from public.sales_rows x
    join rep on rep.id = x.report_id
    left join public.staff_name_aliases a
      on a.store_id = x.store_id and a.source_type = 'sales_report' and a.is_active
      and a.normalized_source_name = lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g'))
    left join public.staff_name_aliases a2
      on a.id is null and a2.store_id = x.store_id and a2.source_type = 'sales_report' and a2.is_active
      and a2.normalized_source_name = regexp_replace(lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')), ' s$', '')
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
          'qty', (select sum(qty) from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item'),
          -- Discount = 1 - net / MRP value, on lines that carry an MRP.
          'discount_pct', (select round(100 * (1 - sum(net) / nullif(sum(mrp_value), 0)), 1) from lines l
            where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and l.mrp_value is not null),
          'usual_discount_pct', (select round(100 * (1 - sum(net) / nullif(sum(mrp_value), 0)), 1) from lines l
            where l.store_id = s.id and l.sale_date between p_day - 28 and p_day - 1 and l.line_kind = 'item' and l.mrp_value is not null),
          'last_week_sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day - 7),
          'month_sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date between (select month_start from bounds) and p_day),
          'month_days', p_day - (select month_start from bounds) + 1,
          'last_month_same_days_sale', (select sum(net) from lines l where l.store_id = s.id
            and l.sale_date between (select prev_start from bounds)
              and least((select prev_start from bounds) + (p_day - (select month_start from bounds)), (select prev_end from bounds))),
          'month_target', (select sum(t.target) from public.staff_targets t where t.store_id = s.id and t.month = (select month_start from bounds)),
          'missing_days', (
            select count(*) from generate_series((select month_start from bounds), p_day, interval '1 day') g
            where not exists (select 1 from rep where rep.store_id = s.id and rep.report_date = g::date)),
          'summary_days', (
            select count(*) from rep
            where rep.store_id = s.id and rep.report_date >= (select month_start from bounds)
              and not exists (select 1 from lines l where l.store_id = s.id and l.sale_date = rep.report_date and l.line_kind = 'item')),
          'returns', (select -sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and net < 0),
          'return_brands', (
            select coalesce(jsonb_agg(brand order by amount desc), '[]'::jsonb) from (
              select brand, -sum(net) as amount from lines l
              where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and net < 0 and brand is not null
              group by brand order by 2 desc limit 2) b),
          -- Cash check, same rule as the Money screen: counted minus
          -- (opening + sale - UPI - card - other - cash expenses).
          'day_close', (
            select jsonb_build_object(
              'status', c.status,
              'difference', case when exists (select 1 from rep where rep.store_id = s.id and rep.report_date = p_day)
                then c.cash_counted - (c.opening_cash
                  + coalesce((select sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind in ('item', 'summary')), 0)
                  - c.upi_amount - c.card_amount - c.other_amount
                  - coalesce((select sum(e.amount) from public.store_expenses e where e.store_id = s.id and e.expense_date = p_day
                      and e.paid_from = 'cash' and e.status <> 'rejected'), 0)) end)
            from public.store_day_closes c where c.store_id = s.id and c.close_date = p_day),
          'top_staff', (
            select jsonb_build_object('name', staff, 'sale', sale, 'bills', bills) from (
              select staff, sum(net) as sale, count(distinct bill_no) as bills from named n
              where n.store_id = s.id and n.sale_date = p_day and n.line_kind = 'item'
              group by staff having sum(net) > 0 order by 2 desc limit 1) t),
          'top_staffs', (
            select coalesce(jsonb_agg(jsonb_build_object('name', staff, 'sale', sale, 'bills', bills) order by sale desc), '[]'::jsonb) from (
              select staff, sum(net) as sale, count(distinct bill_no) as bills from named n
              where n.store_id = s.id and n.sale_date = p_day and n.line_kind = 'item'
              group by staff having sum(net) > 0 order by 2 desc limit 2) t),
          'top_brands', (
            select coalesce(jsonb_agg(jsonb_build_object('name', brand, 'sale', sale) order by sale desc), '[]'::jsonb) from (
              select brand, sum(net) as sale from lines l
              where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and brand is not null
              group by brand having sum(net) > 0 order by 2 desc limit 3) b),
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
