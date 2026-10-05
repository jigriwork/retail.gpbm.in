-- Scanning: Logic price tags can carry the ITEM CODE (stock "sku", e.g.
-- Q12446) as their barcode. Size check, item lookup and stock counts now
-- match it too, besides the lot code, the EAN barcode and the article code.
begin;

create or replace function public.stock_count_codes(p_count uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with c as (
    select id, store_id from public.stock_counts
    where id = p_count and coalesce(public.can_work_store(store_id), false)
  ), lines as (
    select l.id, l.lot_code from public.stock_count_lines l join c on c.id = l.count_id
  ), codes as (
    select id, upper(btrim(lot_code)) as code from lines
    union
    select lines.id, upper(btrim(k.barcode)) from lines
      join c on true
      join public.stock_rows k on k.store_id = c.store_id and k.lot_code = lines.lot_code
      join public.reports r on r.id = k.report_id and r.is_current and r.report_type = 'stock'
    union
    select lines.id, upper(btrim(k.sku)) from lines
      join c on true
      join public.stock_rows k on k.store_id = c.store_id and k.lot_code = lines.lot_code
      join public.reports r on r.id = k.report_id and r.is_current and r.report_type = 'stock'
    union
    select lines.id, upper(btrim(k.article_code)) from lines
      join c on true
      join public.stock_rows k on k.store_id = c.store_id and k.lot_code = lines.lot_code
      join public.reports r on r.id = k.report_id and r.is_current and r.report_type = 'stock'
  )
  select coalesce(jsonb_agg(jsonb_build_object('line', id, 'codes', list)), '[]'::jsonb)
  from (select id, array_agg(code order by code) as list from codes where code is not null and code <> '' group by id) grouped
$$;

create or replace function public.stock_lookup(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if length(v_code) < 3 or length(v_code) > 60 then raise exception 'Scan or type a barcode or lot code.'; end if;
  if public.is_cashier() then raise exception 'Item lookup is for the owner and managers.'; end if;
  return coalesce((
    with visible as (
      select id, name from public.stores where is_active and coalesce(public.can_access_store(id), false)
    ), matched as (
      select distinct k.store_id, k.lot_code from public.stock_rows k
      join visible v on v.id = k.store_id
      join public.reports r on r.id = k.report_id and r.is_current and r.report_type = 'stock'
      where k.lot_code is not null
        and (upper(btrim(k.lot_code)) = v_code or upper(btrim(k.barcode)) = v_code or upper(btrim(k.article_code)) = v_code
          or upper(btrim(k.sku)) = v_code)
      union
      select p.store_id, p.lot_code from public.stock_position_cache p join visible v on v.id = p.store_id
      where upper(p.lot_code) = v_code
    )
    select jsonb_agg(jsonb_build_object(
      'store', v.name, 'lot_code', p.lot_code, 'item', p.item_name, 'brand', p.brand, 'size', p.size,
      'category', p.category, 'mrp', p.mrp, 'on_hand', p.on_hand, 'last_sale', p.last_sale,
      'sold_30', p.sold_30, 'sold_90', p.sold_90, 'snapshot_date', p.snapshot_date
    ) order by v.name, p.item_name, p.size)
    from matched m
    join public.stock_position_cache p on p.store_id = m.store_id and p.lot_code = m.lot_code
    join visible v on v.id = p.store_id
  ), '[]'::jsonb);
end $$;

create or replace function public.stock_sizes(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
  v_staff_store uuid := (select store_id from public.employee_contacts where id = public.current_staff_employee_id());
begin
  if length(v_code) < 3 or length(v_code) > 60 then raise exception 'Scan or type the barcode on the tag.'; end if;
  return coalesce((
    with visible as (
      select id, name from public.stores
      where is_active and (coalesce(public.can_work_store(id), false) or id = v_staff_store)
    ), matched as (
      select distinct k.store_id, k.lot_code from public.stock_rows k
      join visible v on v.id = k.store_id
      join public.reports r on r.id = k.report_id and r.is_current and r.report_type = 'stock'
      where k.lot_code is not null
        and (upper(btrim(k.lot_code)) = v_code or upper(btrim(k.barcode)) = v_code or upper(btrim(k.article_code)) = v_code
          or upper(btrim(k.sku)) = v_code)
      union
      select p.store_id, p.lot_code from public.stock_position_cache p join visible v on v.id = p.store_id where upper(p.lot_code) = v_code
    ), items as (
      select distinct p.brand, p.item_name, p.size as scanned_size
      from matched m join public.stock_position_cache p on p.store_id = m.store_id and p.lot_code = m.lot_code
      where p.item_name is not null
      limit 3
    )
    select jsonb_agg(jsonb_build_object(
      'brand', i.brand, 'item', i.item_name, 'scanned_size', i.scanned_size,
      'mrp', (select max(p.mrp) from public.stock_position_cache p join visible v on v.id = p.store_id where p.item_name = i.item_name and p.brand is not distinct from i.brand),
      'stores', (
        select coalesce(jsonb_agg(jsonb_build_object('store', v.name, 'sizes', sz.sizes) order by v.name), '[]'::jsonb)
        from visible v
        cross join lateral (
          select jsonb_agg(jsonb_build_object('size', coalesce(nullif(btrim(p.size), ''), '—'), 'on_hand', greatest(sum_qty, 0)) order by p.size) as sizes
          from (select p.size, sum(p.on_hand) as sum_qty from public.stock_position_cache p
                where p.store_id = v.id and p.item_name = i.item_name and p.brand is not distinct from i.brand group by p.size) p
        ) sz
        where sz.sizes is not null)))
    from items i
  ), '[]'::jsonb);
end $$;

commit;
