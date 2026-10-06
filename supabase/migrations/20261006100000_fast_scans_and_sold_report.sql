-- 1) Fast scanning. Size check, item lookup and stock counts find a tag by its
--    lot code, barcode, article code or item code. Without an index on the
--    cleaned-up codes every scan read all ~160,000 stock rows (1–10 s, over
--    the 8 s limit at busy times, so "no stock" although it was in stock).
-- 2) Customers and staff-name pages: the store access check runs once per
--    request instead of once per sales line, and the staff-name page reads a
--    total per name instead of every sales line ever uploaded.
-- 3) "What sold / what did not": a store's sales of any period by brand, then
--    by item with sizes, next to today's stock; items in stock with no sale in
--    the period. Owner and store managers.
begin;

create index if not exists stock_rows_code_lot_idx on public.stock_rows (upper(btrim(lot_code)));
create index if not exists stock_rows_code_barcode_idx on public.stock_rows (upper(btrim(barcode)));
create index if not exists stock_rows_code_article_idx on public.stock_rows (upper(btrim(article_code)));
create index if not exists stock_rows_code_sku_idx on public.stock_rows (upper(btrim(sku)));
create index if not exists stock_position_cache_code_idx on public.stock_position_cache (upper(lot_code));
create index if not exists stock_position_cache_item_idx on public.stock_position_cache (item_name, store_id);
create index if not exists stock_position_cache_brand_idx on public.stock_position_cache (store_id, brand);

create function public.sold_report(p_store uuid, p_from date, p_to date, p_brand text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_brand text := nullif(upper(btrim(coalesce(p_brand, ''))), '');
begin
  if not coalesce(public.can_access_store(p_store), false) then raise exception 'Store access denied.'; end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400 then raise exception 'Choose a period of up to 400 days.'; end if;
  return (
    with sold_lines as (
      -- Item lines of the period; brand, item and size as in the stock file when the lot is known.
      select coalesce(p.brand, nullif(upper(btrim(x.brand)), ''), 'NO BRAND') as brand,
        coalesce(p.item_name, nullif(btrim(x.item_name), ''), 'Item') as item,
        coalesce(nullif(p.size, ''), nullif(upper(btrim(x.size)), ''), nullif(upper(btrim(x.raw_data->>'PACK / SIZE')), ''), '—') as size,
        coalesce(x.quantity, 0) as qty, coalesce(x.net_sale, 0) as net, x.sale_date, x.bill_no
      from public.sales_rows x
      join public.reports r on r.id = x.report_id and r.is_current and r.status = 'processed'
      left join public.stock_position_cache p on p.store_id = x.store_id and p.lot_code = x.lot_code
      where x.store_id = p_store and x.sale_date between p_from and p_to and x.line_kind = 'item'
    ), stock as (
      select coalesce(nullif(brand, ''), 'NO BRAND') as brand, coalesce(item_name, 'Item') as item, coalesce(nullif(size, ''), '—') as size,
        sum(greatest(on_hand, 0)) as on_hand, max(last_sale) as last_sale, max(mrp) as mrp
      from public.stock_position_cache where store_id = p_store group by 1, 2, 3
    ), sold_items as (
      select brand, item, sum(qty) as qty, sum(net) as net, count(distinct (sale_date, bill_no)) as bills, max(sale_date) as last_sale
      from sold_lines group by 1, 2
    ), stock_items as (
      select brand, item, sum(on_hand) as on_hand, max(last_sale) as last_sale, max(mrp) as mrp from stock group by 1, 2
    ), brand_rows as (
      select coalesce(s.brand, k.brand) as brand, coalesce(s.qty, 0) as sold, coalesce(s.net, 0) as net, coalesce(k.on_hand, 0) as on_hand,
        coalesce(k.unsold_items, 0) as unsold_items, coalesce(k.unsold_pcs, 0) as unsold_pcs
      from (select brand, sum(qty) as qty, sum(net) as net from sold_items group by 1) s
      full join (
        select st.brand, sum(st.on_hand) as on_hand,
          count(*) filter (where st.on_hand > 0 and si.item is null) as unsold_items,
          coalesce(sum(st.on_hand) filter (where si.item is null), 0) as unsold_pcs
        from stock_items st left join sold_items si on si.brand = st.brand and si.item = st.item
        group by 1
      ) k on k.brand = s.brand
    )
    select jsonb_build_object(
      'summary', (select jsonb_build_object('sold', coalesce(sum(qty), 0), 'net', coalesce(sum(net), 0),
          'bills', count(distinct (sale_date, bill_no)), 'items', count(distinct (brand, item))) from sold_lines),
      'in_stock', (select coalesce(sum(on_hand), 0) from stock),
      'snapshot_date', (select max(snapshot_date) from public.stock_position_cache where store_id = p_store),
      'brands', coalesce((select jsonb_agg(jsonb_build_object('brand', brand, 'sold', sold, 'net', net, 'on_hand', on_hand,
          'unsold_items', unsold_items, 'unsold_pcs', unsold_pcs) order by net desc, sold desc, on_hand desc)
        from brand_rows where sold > 0 or on_hand > 0), '[]'::jsonb),
      -- Without a brand: the best sellers of the store.
      'top', case when v_brand is null then coalesce((select jsonb_agg(t) from (
          select jsonb_build_object('brand', brand, 'item', item, 'sold', qty, 'net', net) as t
          from sold_items order by qty desc, net desc limit 25) x), '[]'::jsonb) end,
      -- With a brand: every item sold (sizes sold, stock left by size) and every item in stock not sold.
      'items', case when v_brand is not null then coalesce((select jsonb_agg(row order by (row->>'sold')::numeric desc, row->>'item') from (
          select jsonb_build_object('item', si.item, 'sold', si.qty, 'net', si.net, 'bills', si.bills, 'last_sale', si.last_sale,
            'on_hand', coalesce(st.on_hand, 0),
            'sizes_sold', (select jsonb_agg(jsonb_build_object('size', size, 'qty', q)) from (select size, sum(qty) as q from sold_lines l
              where l.brand = si.brand and l.item = si.item group by size) z),
            'sizes_left', (select jsonb_agg(jsonb_build_object('size', size, 'qty', on_hand)) from stock k
              where k.brand = si.brand and k.item = si.item and k.on_hand > 0)) as row
          from sold_items si left join stock_items st on st.brand = si.brand and st.item = si.item
          where si.brand = v_brand limit 400) x), '[]'::jsonb) end,
      'unsold', case when v_brand is not null then coalesce((select jsonb_agg(row order by (row->>'on_hand')::numeric desc, row->>'item') from (
          select jsonb_build_object('item', st.item, 'on_hand', st.on_hand, 'mrp', st.mrp, 'last_sale', st.last_sale,
            'sizes_left', (select jsonb_agg(jsonb_build_object('size', size, 'qty', on_hand)) from stock k
              where k.brand = st.brand and k.item = st.item and k.on_hand > 0)) as row
          from stock_items st
          where st.brand = v_brand and st.on_hand > 0
            and not exists (select 1 from sold_items si where si.brand = st.brand and si.item = st.item)
          limit 400) x), '[]'::jsonb) end
    )
  );
end $$;
revoke all on function public.sold_report(uuid, date, date, text) from public, anon;
grant execute on function public.sold_report(uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------- customers: access checked once
create or replace function public.customer_list(p_store uuid, p_segment text, p_search text, p_limit integer, p_offset integer)
returns table (mobile text, name text, first_visit date, last_visit date, bills bigint, items numeric, spend numeric,
  store_count bigint, marketing_consent boolean, do_not_contact boolean, birthday date, last_message_at timestamptz, total_count bigint)
language sql stable security definer set search_path = '' as $$
  with scope as (
    select s.customer_mobile, s.customer_name, s.store_id, s.sale_date, s.bill_no, s.quantity, s.net_sale
    from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.customer_mobile is not null and s.line_kind = 'item'
      and ((p_store is null and (select public.is_owner())) or (p_store is not null and (select public.can_access_store(p_store)) and s.store_id = p_store))
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

create or replace function public.customer_kpis(p_store uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with lines as (
    select s.customer_mobile, s.store_id, s.bill_no, s.sale_date, s.net_sale
    from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.line_kind = 'item' and s.bill_no is not null
      and ((p_store is null and (select public.is_owner())) or (p_store is not null and (select public.can_access_store(p_store)) and s.store_id = p_store))
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
  where (p_store is null and (select public.is_owner())) or (p_store is not null and (select public.can_access_store(p_store)))
$$;

-- ---------------------------------------------------------------- sales names with totals (staff-name page)
create function public.staff_name_totals(p_store_ids uuid[])
returns table (store_id uuid, staff_name text, row_count bigint, net_sale numeric)
language sql stable security definer set search_path = '' as $$
  select x.store_id, btrim(x.staff_name), count(*), coalesce(sum(x.net_sale), 0)
  from public.sales_rows x join public.reports r on r.id = x.report_id and r.is_current and r.status = 'processed'
  where x.store_id = any(p_store_ids) and nullif(btrim(x.staff_name), '') is not null
    and (select coalesce(bool_and(coalesce(public.can_access_store(s), false)), false) from unnest(p_store_ids) s)
  group by 1, 2
$$;
revoke all on function public.staff_name_totals(uuid[]) from public, anon;
grant execute on function public.staff_name_totals(uuid[]) to authenticated;

commit;

analyze public.stock_rows;
analyze public.stock_position_cache;
