-- Phase 1 additive analytics summaries.
-- No existing function, table, column, index, policy, or business row is changed.

begin;

create or replace function public.sales_analytics_summary_v2(
  p_store_ids uuid[],
  p_start date,
  p_end date,
  p_top_limit integer default 5
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result json;
begin
  if not public.is_active_user()
    or p_store_ids is null
    or cardinality(p_store_ids) = 0
    or exists (
      select 1
      from unnest(p_store_ids) requested(store_id)
      where requested.store_id is null
        or not public.can_access_store(requested.store_id)
    )
  then
    raise exception 'Store access denied';
  end if;

  if p_start is null or p_end is null or p_start > p_end or p_end - p_start > 3700 then
    raise exception 'Invalid date range';
  end if;

  if p_top_limit is null or p_top_limit < 1 or p_top_limit > 25 then
    raise exception 'Invalid top limit';
  end if;

  with base as materialized (
    select
      rows.store_id,
      rows.sale_date,
      nullif(btrim(rows.bill_no), '') as bill_no,
      nullif(btrim(rows.item_name), '') as item_name,
      nullif(btrim(rows.brand), '') as brand,
      nullif(btrim(rows.category), '') as category,
      nullif(btrim(rows.staff_name), '') as source_staff_name,
      coalesce(
        aliases.canonical_staff_name,
        nullif(regexp_replace(btrim(rows.staff_name), '\s+', ' ', 'g'), '')
      ) as staff_name,
      coalesce(rows.quantity, 0)::numeric as quantity,
      coalesce(rows.net_sale, 0)::numeric as net_sale,
      reports.created_at as report_created_at
    from public.sales_rows rows
    join public.reports reports on reports.id = rows.report_id
    left join public.staff_name_aliases aliases
      on aliases.store_id = rows.store_id
      and aliases.source_type = 'sales_report'
      and aliases.is_active = true
      and aliases.normalized_source_name = lower(regexp_replace(btrim(rows.staff_name), '\s+', ' ', 'g'))
    where rows.store_id = any(p_store_ids)
      and rows.sale_date between p_start and p_end
      and reports.status = 'processed'
      and reports.is_current
  ),
  overall as (
    select
      coalesce(sum(net_sale), 0)::numeric as total_net_sale,
      coalesce(sum(quantity), 0)::numeric as total_quantity,
      count(*)::bigint as source_row_count,
      count(distinct (store_id, sale_date, bill_no)) filter (where bill_no is not null)::bigint as bill_count,
      count(distinct staff_name) filter (where staff_name is not null)::bigint as staff_count,
      count(distinct brand) filter (where brand is not null)::bigint as brand_count,
      count(distinct category) filter (where category is not null)::bigint as category_count,
      min(sale_date) as source_from_date,
      max(sale_date) as source_through_date,
      max(report_created_at) as latest_uploaded_at
    from base
  ),
  store_totals as (
    select
      store_id,
      coalesce(sum(net_sale), 0)::numeric as total_net_sale,
      coalesce(sum(quantity), 0)::numeric as total_quantity,
      count(*)::bigint as source_row_count,
      count(distinct (store_id, sale_date, bill_no)) filter (where bill_no is not null)::bigint as bill_count
    from base
    group by store_id
  ),
  daily as (
    select sale_date as date, sum(net_sale)::numeric as total_sale, sum(quantity)::numeric as quantity
    from base
    group by sale_date
  ),
  staff_rank as (
    select staff_name as name, sum(net_sale)::numeric as total_sale, sum(quantity)::numeric as quantity
    from base
    where staff_name is not null
    group by staff_name
    order by total_sale desc, staff_name asc
    limit p_top_limit
  ),
  brand_rank as (
    select coalesce(brand, 'Unspecified') as name, sum(net_sale)::numeric as total_sale, sum(quantity)::numeric as quantity
    from base
    group by coalesce(brand, 'Unspecified')
    order by total_sale desc, name asc
    limit p_top_limit
  ),
  category_rank as (
    select coalesce(category, 'Unspecified') as name, sum(net_sale)::numeric as total_sale, sum(quantity)::numeric as quantity
    from base
    group by coalesce(category, 'Unspecified')
    order by total_sale desc, name asc
    limit p_top_limit
  ),
  item_rank as (
    select coalesce(item_name, 'Unspecified') as name, sum(net_sale)::numeric as total_sale, sum(quantity)::numeric as quantity
    from base
    group by coalesce(item_name, 'Unspecified')
    order by total_sale desc, name asc
    limit p_top_limit
  )
  select json_build_object(
    'summary', json_build_object(
      'total_net_sale', overall.total_net_sale,
      'total_quantity', overall.total_quantity,
      'bill_count', overall.bill_count,
      'average_bill_value', case when overall.bill_count > 0 then overall.total_net_sale / overall.bill_count else 0 end,
      'staff_count', overall.staff_count,
      'brand_count', overall.brand_count,
      'category_count', overall.category_count,
      'row_count', overall.source_row_count
    ),
    'store_summaries', coalesce((
      select json_agg(json_build_object(
        'store_id', stores.id,
        'total_net_sale', coalesce(store_totals.total_net_sale, 0),
        'total_quantity', coalesce(store_totals.total_quantity, 0),
        'bill_count', coalesce(store_totals.bill_count, 0),
        'average_bill_value', case when coalesce(store_totals.bill_count, 0) > 0
          then store_totals.total_net_sale / store_totals.bill_count else 0 end,
        'row_count', coalesce(store_totals.source_row_count, 0)
      ) order by stores.name, stores.id)
      from public.stores stores
      left join store_totals on store_totals.store_id = stores.id
      where stores.id = any(p_store_ids)
    ), '[]'::json),
    'daily_trend', coalesce((select json_agg(row_to_json(daily) order by date) from daily), '[]'::json),
    'top_staff', coalesce((select json_agg(row_to_json(staff_rank) order by total_sale desc, name) from staff_rank), '[]'::json),
    'top_brands', coalesce((select json_agg(row_to_json(brand_rank) order by total_sale desc, name) from brand_rank), '[]'::json),
    'top_categories', coalesce((select json_agg(row_to_json(category_rank) order by total_sale desc, name) from category_rank), '[]'::json),
    'top_items', coalesce((select json_agg(row_to_json(item_rank) order by total_sale desc, name) from item_rank), '[]'::json),
    'freshness', json_build_object(
      'source_from_date', overall.source_from_date,
      'source_through_date', overall.source_through_date,
      'latest_uploaded_at', overall.latest_uploaded_at,
      'sla_days', coalesce((
        select case
          when jsonb_typeof(settings.value->'sales_days') = 'number'
            and (settings.value->>'sales_days')::integer between 0 and 365
          then (settings.value->>'sales_days')::integer
        end
        from public.app_settings settings where settings.key = 'freshness_sla_v1'
      ), 2),
      'generated_at', now()
    ),
    'reconciliation', json_build_object(
      'source_row_count', overall.source_row_count,
      'net_sale', overall.total_net_sale,
      'quantity', overall.total_quantity
    )
  ) into result
  from overall;

  return result;
end;
$$;

create or replace function public.staff_sales_summary_v2(
  p_store_ids uuid[],
  p_start date,
  p_end date,
  p_top_limit integer default 25
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result json;
begin
  if not public.is_active_user()
    or p_store_ids is null
    or cardinality(p_store_ids) = 0
    or exists (
      select 1
      from unnest(p_store_ids) requested(store_id)
      where requested.store_id is null
        or not public.can_access_store(requested.store_id)
    )
  then
    raise exception 'Store access denied';
  end if;

  if p_start is null or p_end is null or p_start > p_end or p_end - p_start > 3700 then
    raise exception 'Invalid date range';
  end if;

  if p_top_limit is null or p_top_limit < 1 or p_top_limit > 250 then
    raise exception 'Invalid top limit';
  end if;

  with base as materialized (
    select
      rows.store_id,
      rows.sale_date,
      nullif(btrim(rows.bill_no), '') as bill_no,
      nullif(regexp_replace(btrim(rows.staff_name), '\s+', ' ', 'g'), '') as source_name,
      coalesce(
        aliases.canonical_staff_name,
        nullif(regexp_replace(btrim(rows.staff_name), '\s+', ' ', 'g'), '')
      ) as staff_name,
      nullif(btrim(rows.category), '') as category,
      nullif(btrim(rows.brand), '') as brand,
      coalesce(rows.quantity, 0)::numeric as quantity,
      coalesce(rows.net_sale, 0)::numeric as net_sale,
      reports.created_at as report_created_at
    from public.sales_rows rows
    join public.reports reports on reports.id = rows.report_id
    left join public.staff_name_aliases aliases
      on aliases.store_id = rows.store_id
      and aliases.source_type = 'sales_report'
      and aliases.is_active = true
      and aliases.normalized_source_name = lower(regexp_replace(btrim(rows.staff_name), '\s+', ' ', 'g'))
    where rows.store_id = any(p_store_ids)
      and rows.sale_date between p_start and p_end
      and rows.staff_name is not null
      and btrim(rows.staff_name) <> ''
      and reports.status = 'processed'
      and reports.is_current
  ),
  staff_totals as (
    select
      staff_name,
      sum(net_sale)::numeric as total_sale,
      sum(abs(net_sale)) filter (where net_sale < 0)::numeric as return_amount,
      sum(quantity)::numeric as quantity_sold,
      count(distinct (store_id, sale_date, bill_no)) filter (where bill_no is not null)::bigint as bill_count
    from base
    group by staff_name
  ),
  top_category as (
    select distinct on (staff_name) staff_name, category
    from (
      select staff_name, category, sum(net_sale) as sale
      from base
      where category is not null
      group by staff_name, category
    ) ranked
    order by staff_name, sale desc, category asc
  ),
  top_brand as (
    select distinct on (staff_name) staff_name, brand
    from (
      select staff_name, brand, sum(net_sale) as sale
      from base
      where brand is not null
      group by staff_name, brand
    ) ranked
    order by staff_name, sale desc, brand asc
  ),
  source_totals as (
    select staff_name, source_name, sum(net_sale)::numeric as total_sale, sum(quantity)::numeric as quantity
    from base
    group by staff_name, source_name
  ),
  limited_staff as (
    select * from staff_totals order by total_sale desc, staff_name asc limit p_top_limit
  ),
  output as (
    select
      totals.staff_name,
      totals.total_sale,
      coalesce(totals.return_amount, 0)::numeric as return_amount,
      totals.bill_count,
      totals.quantity_sold,
      case when totals.bill_count > 0 then totals.total_sale / totals.bill_count else 0 end as average_bill_value,
      top_category.category as top_category,
      top_brand.brand as top_brand,
      coalesce((
        select json_agg(json_build_object(
          'source_name', sources.source_name,
          'total_sale', sources.total_sale,
          'quantity', sources.quantity
        ) order by sources.total_sale desc, sources.source_name)
        from source_totals sources
        where sources.staff_name = totals.staff_name
      ), '[]'::json) as source_breakdown
    from limited_staff totals
    left join top_category on top_category.staff_name = totals.staff_name
    left join top_brand on top_brand.staff_name = totals.staff_name
  ),
  overall as (
    select
      count(*)::bigint as source_row_count,
      coalesce(sum(net_sale), 0)::numeric as net_sale,
      coalesce(sum(quantity), 0)::numeric as quantity,
      min(sale_date) as source_from_date,
      max(sale_date) as source_through_date,
      max(report_created_at) as latest_uploaded_at
    from base
  )
  select json_build_object(
    'staff', coalesce((select json_agg(row_to_json(output) order by total_sale desc, staff_name) from output), '[]'::json),
    'freshness', json_build_object(
      'source_from_date', overall.source_from_date,
      'source_through_date', overall.source_through_date,
      'latest_uploaded_at', overall.latest_uploaded_at,
      'sla_days', coalesce((
        select case
          when jsonb_typeof(settings.value->'sales_days') = 'number'
            and (settings.value->>'sales_days')::integer between 0 and 365
          then (settings.value->>'sales_days')::integer
        end
        from public.app_settings settings where settings.key = 'freshness_sla_v1'
      ), 2),
      'generated_at', now()
    ),
    'reconciliation', json_build_object(
      'source_row_count', overall.source_row_count,
      'net_sale', overall.net_sale,
      'quantity', overall.quantity
    )
  ) into result
  from overall;

  return result;
end;
$$;

create or replace function public.stock_analytics_summary_v2(
  p_store_ids uuid[],
  p_stock_month date,
  p_lookback_days integer default 30,
  p_top_limit integer default 10
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result json;
begin
  if not public.is_active_user()
    or p_store_ids is null
    or cardinality(p_store_ids) = 0
    or exists (
      select 1
      from unnest(p_store_ids) requested(store_id)
      where requested.store_id is null
        or not public.can_access_store(requested.store_id)
    )
  then
    raise exception 'Store access denied';
  end if;

  if p_stock_month is null or p_lookback_days not in (7, 15, 30, 60, 90) then
    raise exception 'Invalid stock filters';
  end if;

  if p_top_limit is null or p_top_limit < 1 or p_top_limit > 10 then
    raise exception 'Invalid top limit';
  end if;

  with store_rules as materialized (
    select
      stores.id as store_id,
      stores.name as store_name,
      stores.code,
      coalesce(stores.slow_stock_days, case when stores.code = 'BM' then 45 else 30 end) as slow_days,
      coalesce(stores.dead_stock_days, case when stores.code = 'BM' then 90 else 60 end) as dead_days
    from public.stores stores
    where stores.id = any(p_store_ids)
  ),
  stock_grouped as materialized (
    select
      rows.store_id,
      rows.stock_month,
      nullif(btrim(rows.item_name), '') as item_name,
      nullif(btrim(rows.sku), '') as sku,
      nullif(btrim(rows.barcode), '') as barcode,
      nullif(btrim(rows.brand), '') as brand,
      nullif(btrim(rows.category), '') as category,
      nullif(btrim(rows.size), '') as size,
      nullif(btrim(rows.color), '') as color,
      rows.mrp,
      sum(rows.quantity)::numeric as quantity,
      count(*)::bigint as source_row_count,
      max(reports.created_at) as report_created_at
    from public.stock_rows rows
    join public.reports reports on reports.id = rows.report_id
    where rows.store_id = any(p_store_ids)
      and rows.stock_month = p_stock_month
      and reports.status = 'processed'
      and reports.is_current
    group by
      rows.store_id, rows.stock_month, rows.item_name, rows.sku, rows.barcode,
      rows.brand, rows.category, rows.size, rows.color, rows.mrp, (rows.quantity is null)
  ),
  stock_keys as materialized (
    select
      grouped.*,
      regexp_replace(lower(coalesce(grouped.barcode, '')), '[^a-z0-9]', '', 'g') as barcode_norm,
      regexp_replace(lower(coalesce(grouped.sku, '')), '[^a-z0-9]', '', 'g') as sku_norm,
      regexp_replace(lower(regexp_replace(coalesce(grouped.item_name, ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as item_norm,
      regexp_replace(lower(regexp_replace(coalesce(grouped.brand, ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as brand_norm,
      regexp_replace(lower(regexp_replace(coalesce(grouped.size, ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as size_norm,
      regexp_replace(lower(regexp_replace(coalesce(grouped.color, ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as color_norm
    from stock_grouped grouped
  ),
  stock_rows_keyed as materialized (
    select
      keyed.*,
      case
        when barcode_norm <> '' then 'barcode:' || barcode_norm
        when sku_norm <> '' then 'sku:' || sku_norm
        when item_norm <> '' and brand_norm <> '' and size_norm <> '' and color_norm <> ''
          then 'strong:' || item_norm || '|' || brand_norm || '|' || size_norm || '|' || color_norm
        when item_norm <> '' and brand_norm <> '' then 'brand-item:' || item_norm || '|' || brand_norm
        when item_norm <> '' then 'weak-item:' || item_norm
        else 'unknown:' || store_id::text || ':' || coalesce(item_norm, '') || ':' || coalesce(brand_norm, '') || ':' || coalesce(category, '')
      end as primary_key,
      case when barcode_norm <> '' then 'barcode:' || barcode_norm end as barcode_key,
      case when sku_norm <> '' then 'sku:' || sku_norm end as sku_key,
      case when item_norm <> '' and brand_norm <> '' and size_norm <> '' and color_norm <> ''
        then 'strong:' || item_norm || '|' || brand_norm || '|' || size_norm || '|' || color_norm end as strong_key,
      case when item_norm <> '' and brand_norm <> '' then 'brand-item:' || item_norm || '|' || brand_norm end as brand_item_key,
      case when item_norm <> '' then 'weak-item:' || item_norm end as weak_item_key
    from stock_keys keyed
  ),
  stock_items as materialized (
    select
      store_id,
      primary_key,
      min(item_name) as item_name,
      min(sku) as sku,
      min(barcode) as barcode,
      min(brand) as brand,
      min(category) as category,
      min(size) as size,
      min(color) as color,
      min(barcode_key) as barcode_key,
      min(sku_key) as sku_key,
      min(strong_key) as strong_key,
      min(brand_item_key) as brand_item_key,
      min(weak_item_key) as weak_item_key,
      coalesce(sum(quantity), 0)::numeric as stock_quantity,
      case when bool_or(mrp is null or quantity is null) then null else sum(mrp * quantity)::numeric end as stock_mrp_value,
      sum(source_row_count)::bigint as source_row_count,
      max(report_created_at) as report_created_at
    from stock_rows_keyed
    group by store_id, primary_key
  ),
  sales_source as materialized (
    select
      rows.store_id,
      rows.sale_date,
      coalesce(rows.quantity, 0)::numeric as quantity,
      coalesce(rows.net_sale, 0)::numeric as net_sale,
      regexp_replace(lower(coalesce(nullif(btrim(rows.barcode), ''), '')), '[^a-z0-9]', '', 'g') as barcode_norm,
      regexp_replace(lower(coalesce(nullif(btrim(rows.sku), ''), '')), '[^a-z0-9]', '', 'g') as sku_norm,
      regexp_replace(lower(regexp_replace(coalesce(nullif(btrim(rows.item_name), ''), ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as item_norm,
      regexp_replace(lower(regexp_replace(coalesce(nullif(btrim(rows.brand), ''), ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as brand_norm,
      regexp_replace(lower(regexp_replace(coalesce(nullif(btrim(rows.size), ''), ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as size_norm,
      regexp_replace(lower(regexp_replace(coalesce(nullif(btrim(rows.color), ''), ''), '\s+', ' ', 'g')), '[^a-z0-9 ]', '', 'g') as color_norm
    from public.sales_rows rows
    join public.reports reports on reports.id = rows.report_id
    join store_rules rules on rules.store_id = rows.store_id
    where rows.sale_date >= (timezone('Asia/Kolkata', now()))::date - (greatest(p_lookback_days, rules.slow_days, rules.dead_days) - 1)
      and rows.sale_date <= (timezone('Asia/Kolkata', now()))::date
      and reports.status = 'processed'
      and reports.is_current
  ),
  sales_keys as materialized (
    select source.store_id, source.sale_date, source.quantity, source.net_sale, keys.identity_key
    from sales_source source
    cross join lateral (
      values
        (case when source.barcode_norm <> '' then 'barcode:' || source.barcode_norm end),
        (case when source.sku_norm <> '' then 'sku:' || source.sku_norm end),
        (case when source.item_norm <> '' and source.brand_norm <> '' and source.size_norm <> '' and source.color_norm <> ''
          then 'strong:' || source.item_norm || '|' || source.brand_norm || '|' || source.size_norm || '|' || source.color_norm end),
        (case when source.item_norm <> '' and source.brand_norm <> '' then 'brand-item:' || source.item_norm || '|' || source.brand_norm end),
        (case when source.item_norm <> '' then 'weak-item:' || source.item_norm end)
    ) keys(identity_key)
    where keys.identity_key is not null
  ),
  sales_movement as materialized (
    select
      keys.store_id,
      keys.identity_key,
      sum(keys.quantity) filter (where keys.sale_date >= (timezone('Asia/Kolkata', now()))::date - (p_lookback_days - 1))::numeric as main_quantity,
      sum(keys.net_sale) filter (where keys.sale_date >= (timezone('Asia/Kolkata', now()))::date - (p_lookback_days - 1))::numeric as main_value,
      sum(keys.quantity) filter (where keys.sale_date >= (timezone('Asia/Kolkata', now()))::date - (rules.slow_days - 1))::numeric as slow_quantity,
      sum(keys.quantity) filter (where keys.sale_date >= (timezone('Asia/Kolkata', now()))::date - (rules.dead_days - 1))::numeric as dead_quantity
    from sales_keys keys
    join store_rules rules on rules.store_id = keys.store_id
    group by keys.store_id, keys.identity_key
  ),
  stock_choices as materialized (
    select
      items.store_id,
      rules.store_name,
      items.primary_key,
      items.item_name,
      items.brand,
      items.category,
      items.sku,
      items.barcode,
      items.size,
      items.color,
      items.stock_quantity,
      items.stock_mrp_value,
      items.source_row_count,
      items.report_created_at,
      movement.identity_key as matched_identity_key,
      movement.main_quantity,
      movement.main_value,
      movement.slow_quantity,
      movement.dead_quantity,
      choices.match_quality,
      rules.slow_days,
      rules.dead_days,
      row_number() over (
        partition by items.store_id, items.primary_key
        order by (movement.identity_key is null), choices.priority
      ) as choice_rank
    from stock_items items
    join store_rules rules on rules.store_id = items.store_id
    cross join lateral (values
      (items.barcode_key, 'barcode'::text, 1),
      (items.sku_key, 'sku'::text, 2),
      (items.strong_key, 'strong-item'::text, 3),
      (items.brand_item_key, 'brand-item'::text, 4),
      (items.weak_item_key, 'weak-item'::text, 5),
      (case when items.barcode_key is null and items.sku_key is null and items.strong_key is null and items.brand_item_key is null and items.weak_item_key is null then items.primary_key end, 'none'::text, 6)
    ) choices(identity_key, match_quality, priority)
    left join sales_movement movement
      on movement.store_id = items.store_id and movement.identity_key = choices.identity_key
    where choices.identity_key is not null
  ),
  matched_items as materialized (
    select
      choices.store_id,
      choices.store_name,
      choices.primary_key,
      choices.item_name,
      choices.brand,
      choices.category,
      choices.sku,
      choices.barcode,
      choices.size,
      choices.color,
      choices.stock_quantity,
      choices.stock_mrp_value,
      choices.source_row_count,
      choices.report_created_at,
      coalesce(choices.main_quantity, 0)::numeric as sales_quantity,
      coalesce(choices.main_value, 0)::numeric as sales_value,
      coalesce(choices.slow_quantity, 0)::numeric as slow_sales_quantity,
      coalesce(choices.dead_quantity, 0)::numeric as dead_sales_quantity,
      case when choices.matched_identity_key is null then 'none' else choices.match_quality end as match_quality,
      choices.slow_days,
      choices.dead_days
    from stock_choices choices
    where choices.choice_rank = 1
  ),
  store_summary as (
    select
      store_id,
      min(store_name) as store_name,
      coalesce(sum(stock_quantity), 0)::numeric as total_stock_quantity,
      case when count(stock_mrp_value) = 0 then null else sum(stock_mrp_value)::numeric end as total_stock_mrp_value,
      count(*)::bigint as item_count,
      count(distinct brand) filter (where brand is not null)::bigint as brand_count,
      count(distinct category) filter (where category is not null)::bigint as category_count,
      sum(source_row_count)::bigint as source_row_count,
      bool_or(sku is null and barcode is null) as data_quality_note,
      count(*) filter (where stock_quantity > 0 and slow_sales_quantity <= greatest(stock_quantity * 0.05, 1))::bigint as slow_count,
      count(*) filter (where stock_quantity > 0 and dead_sales_quantity = 0)::bigint as dead_count,
      count(*) filter (where sales_quantity >= 3 and stock_quantity <= greatest(sales_quantity * 0.5, 2))::bigint as fast_low_count,
      count(*) filter (where stock_quantity >= 10 and sales_quantity <= greatest(stock_quantity * 0.05, 1))::bigint as high_low_count,
      max(report_created_at) as latest_uploaded_at
    from matched_items
    group by store_id
  ),
  output as (
    select json_build_object(
      'store_id', rules.store_id,
      'store_name', rules.store_name,
      'stock_month', p_stock_month,
      'lookback_days', p_lookback_days,
      'total_stock_quantity', coalesce(summary.total_stock_quantity, 0),
      'total_stock_mrp_value', summary.total_stock_mrp_value,
      'item_count', coalesce(summary.item_count, 0),
      'brand_count', coalesce(summary.brand_count, 0),
      'category_count', coalesce(summary.category_count, 0),
      'data_quality_note', coalesce(summary.data_quality_note, false),
      'candidate_counts', json_build_object(
        'slow', coalesce(summary.slow_count, 0),
        'dead', coalesce(summary.dead_count, 0),
        'fast_low', coalesce(summary.fast_low_count, 0),
        'high_low', coalesce(summary.high_low_count, 0)
      ),
      'top_brands', coalesce((
        select json_agg(row_to_json(ranked) order by quantity desc, name)
        from (
          select
            coalesce(items.brand, 'Unspecified') as name,
            sum(items.stock_quantity)::numeric as quantity,
            case when bool_or(items.stock_mrp_value is null) then null else sum(items.stock_mrp_value)::numeric end as mrp_value
          from matched_items items
          where items.store_id = rules.store_id
          group by coalesce(items.brand, 'Unspecified')
          order by quantity desc, name
          limit p_top_limit
        ) ranked
      ), '[]'::json),
      'top_categories', coalesce((
        select json_agg(row_to_json(ranked) order by quantity desc, name)
        from (
          select
            coalesce(items.category, 'Unspecified') as name,
            sum(items.stock_quantity)::numeric as quantity,
            case when bool_or(items.stock_mrp_value is null) then null else sum(items.stock_mrp_value)::numeric end as mrp_value
          from matched_items items
          where items.store_id = rules.store_id
          group by coalesce(items.category, 'Unspecified')
          order by quantity desc, name
          limit p_top_limit
        ) ranked
      ), '[]'::json),
      'top_items', coalesce((
        select json_agg(json_build_object(
          'key', items.store_id::text || ':' || items.primary_key,
          'store_id', items.store_id,
          'store_name', items.store_name,
          'item_name', coalesce(items.item_name, 'Unnamed item'),
          'brand', items.brand,
          'category', items.category,
          'sku', items.sku,
          'barcode', items.barcode,
          'size', items.size,
          'color', items.color,
          'stock_quantity', items.stock_quantity,
          'stock_mrp_value', items.stock_mrp_value,
          'sales_quantity', items.sales_quantity,
          'sales_value', items.sales_value,
          'match_quality', items.match_quality
        ) order by items.stock_quantity desc, items.primary_key)
        from (select * from matched_items where store_id = rules.store_id order by stock_quantity desc, primary_key limit p_top_limit) items
      ), '[]'::json),
      'slow_stock_candidates', coalesce((
        select json_agg(json_build_object(
          'key', items.store_id::text || ':' || items.primary_key, 'store_id', items.store_id, 'store_name', items.store_name,
          'item_name', coalesce(items.item_name, 'Unnamed item'), 'brand', items.brand, 'category', items.category,
          'sku', items.sku, 'barcode', items.barcode, 'size', items.size, 'color', items.color,
          'stock_quantity', items.stock_quantity, 'stock_mrp_value', items.stock_mrp_value,
          'sales_quantity', items.sales_quantity, 'sales_value', items.sales_value, 'match_quality', items.match_quality
        ) order by items.stock_quantity desc, items.primary_key)
        from (select * from matched_items where store_id = rules.store_id and stock_quantity > 0 and slow_sales_quantity <= greatest(stock_quantity * 0.05, 1) order by stock_quantity desc, primary_key limit p_top_limit) items
      ), '[]'::json),
      'dead_stock_candidates', coalesce((
        select json_agg(json_build_object(
          'key', items.store_id::text || ':' || items.primary_key, 'store_id', items.store_id, 'store_name', items.store_name,
          'item_name', coalesce(items.item_name, 'Unnamed item'), 'brand', items.brand, 'category', items.category,
          'sku', items.sku, 'barcode', items.barcode, 'size', items.size, 'color', items.color,
          'stock_quantity', items.stock_quantity, 'stock_mrp_value', items.stock_mrp_value,
          'sales_quantity', items.sales_quantity, 'sales_value', items.sales_value, 'match_quality', items.match_quality
        ) order by items.stock_quantity desc, items.primary_key)
        from (select * from matched_items where store_id = rules.store_id and stock_quantity > 0 and dead_sales_quantity = 0 order by stock_quantity desc, primary_key limit p_top_limit) items
      ), '[]'::json),
      'fast_moving_low_stock_candidates', coalesce((
        select json_agg(json_build_object(
          'key', items.store_id::text || ':' || items.primary_key, 'store_id', items.store_id, 'store_name', items.store_name,
          'item_name', coalesce(items.item_name, 'Unnamed item'), 'brand', items.brand, 'category', items.category,
          'sku', items.sku, 'barcode', items.barcode, 'size', items.size, 'color', items.color,
          'stock_quantity', items.stock_quantity, 'stock_mrp_value', items.stock_mrp_value,
          'sales_quantity', items.sales_quantity, 'sales_value', items.sales_value, 'match_quality', items.match_quality
        ) order by items.sales_quantity desc, items.primary_key)
        from (select * from matched_items where store_id = rules.store_id and sales_quantity >= 3 and stock_quantity <= greatest(sales_quantity * 0.5, 2) order by sales_quantity desc, primary_key limit p_top_limit) items
      ), '[]'::json),
      'high_stock_low_sale_candidates', coalesce((
        select json_agg(json_build_object(
          'key', items.store_id::text || ':' || items.primary_key, 'store_id', items.store_id, 'store_name', items.store_name,
          'item_name', coalesce(items.item_name, 'Unnamed item'), 'brand', items.brand, 'category', items.category,
          'sku', items.sku, 'barcode', items.barcode, 'size', items.size, 'color', items.color,
          'stock_quantity', items.stock_quantity, 'stock_mrp_value', items.stock_mrp_value,
          'sales_quantity', items.sales_quantity, 'sales_value', items.sales_value, 'match_quality', items.match_quality
        ) order by items.stock_quantity desc, items.primary_key)
        from (select * from matched_items where store_id = rules.store_id and stock_quantity >= 10 and sales_quantity <= greatest(stock_quantity * 0.05, 1) order by stock_quantity desc, primary_key limit p_top_limit) items
      ), '[]'::json),
      'freshness', json_build_object(
        'source_through_month', p_stock_month,
        'latest_uploaded_at', summary.latest_uploaded_at,
        'sla_days', coalesce((
          select case
            when jsonb_typeof(settings.value->'stock_days') = 'number'
              and (settings.value->>'stock_days')::integer between 0 and 365
            then (settings.value->>'stock_days')::integer
          end
          from public.app_settings settings where settings.key = 'freshness_sla_v1'
        ), 45),
        'generated_at', now()
      ),
      'reconciliation', json_build_object(
        'source_row_count', coalesce(summary.source_row_count, 0),
        'stock_quantity', coalesce(summary.total_stock_quantity, 0)
      )
    ) as payload
    from store_rules rules
    left join store_summary summary on summary.store_id = rules.store_id
  )
  select json_build_object(
    'stores', coalesce(json_agg(output.payload order by (output.payload->>'store_name')), '[]'::json),
    'freshness', json_build_object('source_through_month', p_stock_month, 'generated_at', now()),
    'reconciliation', json_build_object(
      'source_row_count', coalesce((select sum(source_row_count) from store_summary), 0),
      'stock_quantity', coalesce((select sum(total_stock_quantity) from store_summary), 0)
    )
  ) into result
  from output;

  return result;
end;
$$;

create or replace function public.weekly_audit_summary_v2(
  p_store_ids uuid[],
  p_start date,
  p_end date,
  p_top_limit integer default 5
)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requested_store record;
  sales_payload json;
  staff_payload json;
  stock_payload json;
  stock_month date;
  store_payload json;
  store_payloads jsonb := '[]'::jsonb;
begin
  if not public.is_active_user()
    or p_store_ids is null
    or cardinality(p_store_ids) = 0
    or exists (
      select 1
      from unnest(p_store_ids) requested(store_id)
      where requested.store_id is null
        or not public.can_access_store(requested.store_id)
    )
  then
    raise exception 'Store access denied';
  end if;

  if p_start is null or p_end is null or p_start > p_end or p_end - p_start <> 6 then
    raise exception 'Weekly audit requires an exact seven-day range';
  end if;

  if p_top_limit is null or p_top_limit < 1 or p_top_limit > 10 then
    raise exception 'Invalid top limit';
  end if;

  for requested_store in
    select stores.*
    from public.stores stores
    where stores.id = any(p_store_ids)
    order by stores.name, stores.id
  loop
    sales_payload := public.sales_analytics_summary_v2(array[requested_store.id], p_start, p_end, p_top_limit);
    staff_payload := public.staff_sales_summary_v2(array[requested_store.id], p_start, p_end, p_top_limit);

    select max(reports.period_month) into stock_month
    from public.reports reports
    where reports.store_id = requested_store.id
      and reports.report_type = 'stock'
      and reports.status = 'processed'
      and reports.is_current
      and reports.period_month is not null;

    stock_payload := case when stock_month is null then null else
      public.stock_analytics_summary_v2(array[requested_store.id], stock_month, 30, 10)
    end;

    with expected_dates as (
      select day::date as date
      from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') day
    ),
    sales_report_dates as (
      select distinct reports.report_date
      from public.reports reports
      where reports.store_id = requested_store.id
        and reports.report_type = 'sales'
        and reports.status = 'processed'
        and reports.is_current
        and reports.report_date between p_start and p_end
    ),
    rack_dates as (
      select distinct reviews.review_date
      from public.rack_reviews reviews
      where reviews.store_id = requested_store.id and reviews.review_date between p_start and p_end
    ),
    cleaning_dates as (
      select distinct reviews.review_date
      from public.cleaning_reviews reviews
      where reviews.store_id = requested_store.id and reviews.review_date between p_start and p_end
    ),
    update_week as (
      select updates.*
      from public.manager_updates updates
      where updates.store_id = requested_store.id
        and updates.created_at >= p_start::timestamp at time zone 'Asia/Kolkata'
        and updates.created_at < (p_end + 1)::timestamp at time zone 'Asia/Kolkata'
    ),
    task_scope as (
      select tasks.*
      from public.tasks tasks
      where tasks.store_id = requested_store.id
        and (
          tasks.created_at >= p_start::timestamp at time zone 'Asia/Kolkata'
          or tasks.completed_at >= p_start::timestamp at time zone 'Asia/Kolkata'
          or tasks.due_date <= p_end
        )
    ),
    counts as (
      select
        (select count(*) from sales_report_dates)::integer as sales_report_days,
        (select count(*) from rack_dates)::integer as rack_days,
        (select count(*) from cleaning_dates)::integer as cleaning_days,
        (select count(distinct (timezone('Asia/Kolkata', created_at))::date) from update_week)::integer as update_days
    )
    select json_build_object(
      'store', json_build_object(
        'id', requested_store.id,
        'name', requested_store.name,
        'code', requested_store.code,
        'is_active', requested_store.is_active,
        'monthly_target_enabled', requested_store.monthly_target_enabled,
        'monthly_target', requested_store.monthly_target,
        'slow_stock_days', requested_store.slow_stock_days,
        'dead_stock_days', requested_store.dead_stock_days
      ),
      'week_range', json_build_object('start_date', p_start, 'end_date', p_end),
      'sales', sales_payload,
      'staff', staff_payload,
      'missing_sales_reports', coalesce((
        select json_agg(json_build_object('date', expected.date, 'status', case when expected.date = (timezone('Asia/Kolkata', now()))::date then 'today-not-uploaded' else 'missing' end) order by expected.date)
        from expected_dates expected
        left join sales_report_dates uploaded on uploaded.report_date = expected.date
        where uploaded.report_date is null and expected.date <= (timezone('Asia/Kolkata', now()))::date
      ), '[]'::json),
      'reviews', json_build_object(
        'rack_completed_days', counts.rack_days,
        'cleaning_completed_days', counts.cleaning_days,
        'rack_dates', coalesce((select json_agg(review_date order by review_date) from rack_dates), '[]'::json),
        'cleaning_dates', coalesce((select json_agg(review_date order by review_date) from cleaning_dates), '[]'::json)
      ),
      'checklist', json_build_object(
        'sales_report_days', counts.sales_report_days,
        'rack_review_days', counts.rack_days,
        'cleaning_review_days', counts.cleaning_days,
        'manager_update_days', counts.update_days,
        'estimated_completion_percent', round(((counts.sales_report_days + counts.rack_days + counts.cleaning_days + counts.update_days)::numeric / 28) * 100)
      ),
      'updates', json_build_object(
        'open_urgent_count', (select count(*) from public.manager_updates updates where updates.store_id = requested_store.id and updates.urgency = 'urgent' and (updates.status is null or updates.status = 'open')),
        'created_count', (select count(*) from update_week),
        'resolved_count', (select count(*) from update_week where status = 'resolved'),
        'latest_important', coalesce((
          select json_agg(json_build_object('id', important.id, 'title', important.title, 'urgency', important.urgency, 'status', important.status, 'created_at', important.created_at) order by important.created_at desc)
          from (select * from update_week where urgency = 'urgent' or status = 'open' order by created_at desc limit 5) important
        ), '[]'::json)
      ),
      'tasks', json_build_object(
        'created_count', (select count(*) from task_scope where (timezone('Asia/Kolkata', created_at))::date between p_start and p_end),
        'completed_count', (select count(*) from task_scope where (timezone('Asia/Kolkata', completed_at))::date between p_start and p_end),
        'overdue_pending_count', (select count(*) from task_scope where coalesce(status, 'pending') not in ('done', 'cancelled') and due_date <= p_end)
      ),
      'stock_signals', case when stock_payload is null then json_build_object(
        'stock_month', null, 'slow_stock_count', 0, 'dead_stock_count', 0,
        'fast_moving_low_stock_count', 0, 'high_stock_low_sale_count', 0, 'summary', null
      ) else json_build_object(
        'stock_month', stock_month,
        'slow_stock_count', coalesce((stock_payload::jsonb #>> '{stores,0,candidate_counts,slow}')::integer, 0),
        'dead_stock_count', coalesce((stock_payload::jsonb #>> '{stores,0,candidate_counts,dead}')::integer, 0),
        'fast_moving_low_stock_count', coalesce((stock_payload::jsonb #>> '{stores,0,candidate_counts,fast_low}')::integer, 0),
        'high_stock_low_sale_count', coalesce((stock_payload::jsonb #>> '{stores,0,candidate_counts,high_low}')::integer, 0),
        'summary', stock_payload::jsonb #> '{stores,0}'
      ) end,
      'freshness', json_build_object(
        'sales_source_through_date', sales_payload::jsonb #>> '{freshness,source_through_date}',
        'stock_source_through_month', stock_month,
        'generated_at', now()
      )
    ) into store_payload
    from counts;

    store_payloads := store_payloads || jsonb_build_array(store_payload::jsonb);
  end loop;

  return json_build_object(
    'stores', store_payloads,
    'week_range', json_build_object('start_date', p_start, 'end_date', p_end),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.sales_analytics_summary_v2(uuid[], date, date, integer) from public, anon;
revoke all on function public.staff_sales_summary_v2(uuid[], date, date, integer) from public, anon;
revoke all on function public.stock_analytics_summary_v2(uuid[], date, integer, integer) from public, anon;
revoke all on function public.weekly_audit_summary_v2(uuid[], date, date, integer) from public, anon;

grant execute on function public.sales_analytics_summary_v2(uuid[], date, date, integer) to authenticated, service_role;
grant execute on function public.staff_sales_summary_v2(uuid[], date, date, integer) to authenticated, service_role;
grant execute on function public.stock_analytics_summary_v2(uuid[], date, integer, integer) to authenticated, service_role;
grant execute on function public.weekly_audit_summary_v2(uuid[], date, date, integer) to authenticated, service_role;

comment on function public.sales_analytics_summary_v2(uuid[], date, date, integer)
  is 'Phase 1 bounded sales summary; authorization derives from active profile and requested store access.';
comment on function public.staff_sales_summary_v2(uuid[], date, date, integer)
  is 'Phase 1 bounded alias-aware staff sales summary; returns aggregates only.';
comment on function public.stock_analytics_summary_v2(uuid[], date, integer, integer)
  is 'Phase 1 bounded stock summary and candidate signals; returns top-N aggregates only.';
comment on function public.weekly_audit_summary_v2(uuid[], date, date, integer)
  is 'Phase 1 seven-day management summary; returns bounded per-store aggregates only.';

commit;
