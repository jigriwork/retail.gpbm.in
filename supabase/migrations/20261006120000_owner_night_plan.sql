-- 11 PM owner "plan for tomorrow": no sales figures (the 9 AM summary has
-- them), only what to act on: stock sitting idle (and why), sizes running
-- out, stock to move between stores, staff to praise / coach / check.
-- Facts for the WhatsApp message (cron, service role) and the full list page
-- (owners only).
begin;

create function public.owner_night_plan_internal(p_day date, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_stores jsonb := '[]'::jsonb;
  s record;
  v_idle_days constant integer := 60;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 300);
begin
  for s in select id, code, name from public.stores where is_active order by code loop
    v_stores := v_stores || jsonb_build_array((
      with items as (
        -- Stock now per item: sizes left, value at MRP, last sale, first stock report it appeared in.
        select p.brand, p.item_name as item, sum(greatest(p.on_hand, 0)) as pcs, sum(greatest(p.on_hand, 0) * coalesce(p.mrp, 0)) as value,
          max(p.last_sale) as last_sale, min(p.first_seen) as first_seen,
          count(distinct coalesce(nullif(p.size, ''), '—')) as sizes_all,
          count(distinct coalesce(nullif(p.size, ''), '—')) filter (where p.on_hand > 0) as sizes_left_count,
          string_agg(distinct coalesce(nullif(p.size, ''), '—'), ' ') filter (where p.on_hand > 0) as sizes_left
        from public.stock_position_cache p where p.store_id = s.id and p.item_name is not null
        group by 1, 2
      ), other_sales as (
        -- The same item selling in another store in the last 30 days.
        select upper(btrim(x.brand)) as brand, x.item_name as item, sum(x.quantity) as sold, string_agg(distinct st.code, ', ') as stores
        from public.sales_rows x
        join public.reports r on r.id = x.report_id and r.is_current and r.status = 'processed'
        join public.stores st on st.id = x.store_id and st.is_active
        where x.store_id <> s.id and x.sale_date between p_day - 29 and p_day and x.line_kind = 'item'
        group by 1, 2
      ), idle as (
        select i.*, o.sold as other_sold, o.stores as other_stores,
          case when coalesce(o.sold, 0) >= 2 then 'move'
               when i.sizes_all >= 4 and i.sizes_left_count <= 2 then 'broken_sizes'
               when i.last_sale is null then 'never_sold'
               else 'stopped' end as reason
        from items i left join other_sales o on o.brand = i.brand and o.item = i.item
        where i.pcs > 0 and coalesce(i.last_sale, i.first_seen, date '1900-01-01') < p_day - v_idle_days
      ), sizes as (
        select p.brand, p.item_name as item, coalesce(nullif(p.size, ''), '—') as size, sum(greatest(p.on_hand, 0)) as on_hand, sum(coalesce(p.sold_30, 0)) as sold_30
        from public.stock_position_cache p where p.store_id = s.id and p.item_name is not null group by 1, 2, 3
      ), other_stock as (
        select p.brand, p.item_name as item, coalesce(nullif(p.size, ''), '—') as size, sum(greatest(p.on_hand, 0)) as on_hand, string_agg(distinct st.code, ', ') as stores
        from public.stock_position_cache p join public.stores st on st.id = p.store_id and st.is_active
        where p.store_id <> s.id and p.on_hand > 0 group by 1, 2, 3
      ), running_out as (
        select z.*, coalesce(o.on_hand, 0) as other_on_hand, o.stores as other_stores
        from sizes z left join other_stock o on o.brand = z.brand and o.item = z.item and o.size = z.size
        where z.sold_30 >= 3 and z.on_hand <= 1
      ), w7 as (select * from public.staff_sales_window(s.id, p_day - 6, p_day)),
      w28 as (select * from public.staff_sales_window(s.id, p_day - 34, p_day - 7)),
      w3 as (select * from public.staff_sales_window(s.id, p_day - 2, p_day)),
      store_days as (
        select count(distinct x.sale_date) filter (where x.sale_date >= p_day - 6) as d7,
          count(distinct x.sale_date) filter (where x.sale_date < p_day - 6) as d28,
          count(distinct x.sale_date) filter (where x.sale_date >= p_day - 2) as d3
        from public.sales_rows x join public.reports r on r.id = x.report_id and r.is_current and r.status = 'processed'
        where x.store_id = s.id and x.sale_date between p_day - 34 and p_day and x.line_kind = 'item'
      ), store_avg as (
        select case when sum(bills) > 0 then sum(sale) / sum(bills) end as avg_bill,
          case when sum(bills) > 0 then sum(qty) / sum(bills) end as items_per_bill
        from w7
      ), people as (
        -- Shop counters ("SHOP GP") and staff who left are not people to talk to.
        select coalesce(a.staff, b.staff) as name, coalesce(a.sale, 0) as sale7, coalesce(a.bills, 0) as bills7, coalesce(a.qty, 0) as qty7,
          coalesce(b.sale, 0) as sale28, coalesce(b.days, 0) as days28, (c.staff is not null) as sold_last3
        from w7 a full join w28 b on b.staff = a.staff left join w3 c on c.staff = coalesce(a.staff, b.staff)
        where coalesce(a.staff, b.staff) !~* '^(shop|counter|cash|store)\M'
          and not exists (select 1 from public.employee_contacts e where e.store_id = s.id and e.is_active is false
                          and e.normalized_staff_name = lower(coalesce(a.staff, b.staff))
                          and not exists (select 1 from public.employee_contacts e2 where e2.store_id = s.id and e2.is_active is not false
                                          and e2.normalized_staff_name = e.normalized_staff_name))
      ), rated as (
        select p.*,
          case when d.d7 > 0 then p.sale7 / d.d7 end as recent_per_day,
          case when d.d28 > 0 then p.sale28 / d.d28 end as usual_per_day,
          case when p.bills7 > 0 then p.sale7 / p.bills7 end as avg_bill,
          case when p.bills7 > 0 then p.qty7 / p.bills7 end as items_per_bill,
          rank() over (order by p.sale7 desc) as rank7, d.d3
        from people p cross join store_days d
      )
      select jsonb_build_object(
        'code', s.code, 'name', s.name,
        'uploaded', exists (select 1 from public.reports r where r.store_id = s.id and r.report_type = 'sales' and r.is_current
                            and r.status = 'processed' and r.report_date = p_day),
        'stock_date', (select max(snapshot_date) from public.stock_position_cache where store_id = s.id),
        'idle_days', v_idle_days,
        'idle_total', (select jsonb_build_object('items', count(*), 'pcs', coalesce(sum(pcs), 0), 'value', coalesce(round(sum(value)), 0)) from idle),
        'idle', coalesce((select jsonb_agg(row_to_json(t)::jsonb) from (
            select brand, item, pcs, round(value) as value, last_sale, sizes_left, reason, other_sold, other_stores
            from idle order by value desc, pcs desc limit v_limit) t), '[]'::jsonb),
        'running_out', coalesce((select jsonb_agg(row_to_json(t)::jsonb) from (
            select brand, item, size, on_hand, sold_30, other_on_hand, other_stores
            from running_out order by sold_30 desc, on_hand limit v_limit) t), '[]'::jsonb),
        'store_avg_bill', (select round(avg_bill) from store_avg),
        'store_items_per_bill', (select round(items_per_bill, 1) from store_avg),
        'staff', coalesce((select jsonb_agg(row_to_json(t)::jsonb order by t.sale7 desc) from (
            select r.name, round(r.sale7) as sale7, r.bills7, round(r.avg_bill) as avg_bill, round(r.items_per_bill, 1) as items_per_bill,
              round(r.recent_per_day) as recent_per_day, round(r.usual_per_day) as usual_per_day,
              array_remove(array[
                case when r.rank7 = 1 and r.sale7 > 0 then 'top' end,
                case when r.usual_per_day > 0 and r.bills7 >= 5 and r.recent_per_day >= 1.2 * r.usual_per_day then 'improving' end,
                case when r.bills7 >= 5 and (select avg_bill from store_avg) > 0 and r.avg_bill < 0.6 * (select avg_bill from store_avg) then 'low_bill' end,
                case when r.bills7 >= 5 and (select items_per_bill from store_avg) >= 1.2 and r.items_per_bill < 0.75 * (select items_per_bill from store_avg) then 'low_items' end,
                case when r.usual_per_day > 0 and r.days28 >= 5 and r.sold_last3 and r.recent_per_day < 0.6 * r.usual_per_day then 'falling' end,
                case when r.sale28 > 0 and r.days28 >= 3 and not r.sold_last3 and r.d3 >= 2 then 'no_sale' end
              ], null) as flags
            from rated r) t), '[]'::jsonb)
      )
    ));
  end loop;
  return jsonb_build_object('day', p_day, 'stores', v_stores);
end $$;
revoke all on function public.owner_night_plan_internal(date, integer) from public, anon, authenticated;
grant execute on function public.owner_night_plan_internal(date, integer) to service_role;

-- Full lists for the owners' night plan page.
create function public.owner_night_plan(p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can see the night plan.'; end if;
  if p_day is null or p_day > public.india_today() or p_day < public.india_today() - 60 then raise exception 'Choose a day in the last 60 days.'; end if;
  return public.owner_night_plan_internal(p_day, 200);
end $$;
revoke all on function public.owner_night_plan(date) from public, anon;
grant execute on function public.owner_night_plan(date) to authenticated;

-- WhatsApp deliveries: the night plan is a new kind (owners only, not counted in store budgets).
alter table public.whatsapp_deliveries drop constraint if exists whatsapp_deliveries_kind_check;
alter table public.whatsapp_deliveries add constraint whatsapp_deliveries_kind_check
  check (kind in ('customer_thank_you', 'customer_follow_up', 'payslip', 'owner_summary', 'owner_night_plan'));

commit;

-- 11:00 PM IST (17:30 UTC), with a second try at 11:10 PM; each night sends once.
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    perform cron.schedule('owner-night-plan', '30,40 17 * * *', $job$
      select net.http_post(
        url := 'https://retail.gpbm.in/api/cron/owner-night',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || s.decrypted_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000)
      from vault.decrypted_secrets s where s.name = 'owner_summary_cron_secret'
    $job$);
  end if;
end
$outer$;
