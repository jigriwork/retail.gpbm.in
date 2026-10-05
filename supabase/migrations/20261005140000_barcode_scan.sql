-- Camera barcode scanning.
--   stock_count_codes(count): every code a count line can be scanned by
--     (Logic lot code, the product barcode/EAN and ADDITIONAL ITEM CODE from
--     the store's stock reports), so scanning a tag adds one to that line.
--     Same access as the count sheet (owner, manager, cashier of the store).
--   stock_lookup(code): one item across the stores the person may see:
--     name, size, MRP, stock on hand, last sale, sold in 30/90 days.
--     Owner and managers only (cashiers have no stock figures).
begin;

create index if not exists stock_rows_store_lot on public.stock_rows (store_id, lot_code) where lot_code is not null;

create function public.stock_count_codes(p_count uuid) returns jsonb
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
    select lines.id, upper(btrim(k.article_code)) from lines
      join c on true
      join public.stock_rows k on k.store_id = c.store_id and k.lot_code = lines.lot_code
      join public.reports r on r.id = k.report_id and r.is_current and r.report_type = 'stock'
  )
  select coalesce(jsonb_agg(jsonb_build_object('line', id, 'codes', list)), '[]'::jsonb)
  from (select id, array_agg(code order by code) as list from codes where code is not null and code <> '' group by id) grouped
$$;

create function public.stock_lookup(p_code text) returns jsonb
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
        and (upper(btrim(k.lot_code)) = v_code or upper(btrim(k.barcode)) = v_code or upper(btrim(k.article_code)) = v_code)
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

revoke all on function public.stock_count_codes(uuid), public.stock_lookup(text) from public, anon;
grant execute on function public.stock_count_codes(uuid), public.stock_lookup(text) to authenticated;

commit;
