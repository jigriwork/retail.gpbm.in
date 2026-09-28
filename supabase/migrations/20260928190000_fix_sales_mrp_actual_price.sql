-- Correct derived sales prices from retained source rows.
-- NET/ACTUAL amount is customer-paid value including tax. TAXABLE amount is
-- only a last-resort legacy fallback. MRP is taken before generic rate/price.
begin;

create or replace function pg_temp.sales_source_number(p_raw jsonb, p_keys text[])
returns numeric
language plpgsql
immutable
as $$
declare
  wanted text;
  source_value text;
  cleaned text;
begin
  if p_raw is null or jsonb_typeof(p_raw) <> 'object' then
    return null;
  end if;

  foreach wanted in array p_keys loop
    select value into source_value
    from jsonb_each_text(p_raw)
    where regexp_replace(lower(key), '[^a-z0-9]', '', 'g') = wanted
    limit 1;

    if source_value is not null and btrim(source_value) <> '' then
      cleaned := regexp_replace(replace(source_value, ',', ''), '[^0-9.-]', '', 'g');
      if cleaned ~ '^-?[0-9]+([.][0-9]+)?$' then
        return cleaned::numeric;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create temporary table sales_price_corrections on commit drop as
select
  row.id,
  row.report_id,
  row.net_sale as old_actual_price,
  row.mrp as old_mrp,
  row.discount as old_discount,
  pg_temp.sales_source_number(
    row.raw_data,
    array[
      'actualprice', 'actualamount', 'netamount', 'netamt', 'finalamount',
      'billvalue', 'netsalevalue', 'netsale', 'saleamount', 'salesamount',
      'salesvalue', 'totalamount', 'amount', 'total',
      'taxableamount', 'taxablevalue'
    ]
  ) as actual_price,
  coalesce(
    pg_temp.sales_source_number(
      row.raw_data,
      array['mrp', 'maximumretailprice', 'rate', 'price']
    ),
    pg_temp.sales_source_number(row.raw_data, array['mrpvalue']) / nullif(row.quantity, 0)
  ) as corrected_mrp,
  pg_temp.sales_source_number(
    row.raw_data,
    array['discount', 'discountamount', 'disc', 'spdisc', 'specialdiscount']
  ) as corrected_discount
from public.sales_rows row;

delete from sales_price_corrections
where actual_price is null and corrected_mrp is null and corrected_discount is null;

update public.sales_rows row
set
  net_sale = coalesce(correction.actual_price, row.net_sale),
  mrp = coalesce(correction.corrected_mrp, row.mrp),
  discount = coalesce(correction.corrected_discount, row.discount)
from sales_price_corrections correction
where row.id = correction.id
  and (
    row.net_sale is distinct from coalesce(correction.actual_price, row.net_sale)
    or row.mrp is distinct from coalesce(correction.corrected_mrp, row.mrp)
    or row.discount is distinct from coalesce(correction.corrected_discount, row.discount)
  );

insert into public.audit_logs (
  actor_role, action, entity_type, entity_id, store_id, report_date, metadata
)
select
  'system',
  'repair_sales_price_basis',
  'report',
  report.id,
  report.store_id,
  report.report_date,
  jsonb_build_object(
    'corrected_rows', count(*),
    'old_actual_sale', round(sum(coalesce(correction.old_actual_price, 0)), 2),
    'new_actual_sale', round(sum(coalesce(correction.actual_price, correction.old_actual_price, 0)), 2),
    'source_retained', true,
    'basis', 'MRP plus customer-paid NET/ACTUAL amount including tax'
  )
from sales_price_corrections correction
join public.reports report on report.id = correction.report_id
where correction.old_actual_price is distinct from coalesce(correction.actual_price, correction.old_actual_price)
   or correction.old_mrp is distinct from coalesce(correction.corrected_mrp, correction.old_mrp)
   or correction.old_discount is distinct from coalesce(correction.corrected_discount, correction.old_discount)
group by report.id, report.store_id, report.report_date;

with row_totals as (
  select
    report_id,
    count(*) as row_count,
    count(distinct nullif(btrim(bill_no), '')) as bill_count,
    round(sum(coalesce(net_sale, 0)), 2) as actual_sale,
    round(sum(mrp * quantity) filter (where mrp is not null and quantity is not null), 2) as mrp_value,
    round(sum(
      case
        when mrp is null or quantity is null or net_sale is null then 0
        when quantity < 0 or net_sale < 0
          then -greatest(abs(mrp * quantity) - abs(net_sale), 0)
        else greatest(abs(mrp * quantity) - abs(net_sale), 0)
      end
    ), 2) as discount_value,
    count(*) filter (where mrp is not null and quantity is not null) as mrp_row_count
  from public.sales_rows
  group by report_id
),
staff_sales as (
  select report_id, btrim(staff_name) as name, round(sum(coalesce(net_sale, 0)), 2) as sale
  from public.sales_rows
  where nullif(btrim(staff_name), '') is not null
  group by report_id, btrim(staff_name)
),
staff_summary as (
  select
    report_id,
    jsonb_agg(name order by name) as staff_names,
    jsonb_agg(jsonb_build_object('name', name, 'sale', sale) order by sale desc, name)
      filter (where rank <= 5) as top_staff
  from (
    select *, row_number() over (partition by report_id order by sale desc, name) as rank
    from staff_sales
  ) ranked
  group by report_id
),
brand_sales as (
  select report_id, btrim(brand) as name, round(sum(coalesce(net_sale, 0)), 2) as sale
  from public.sales_rows
  where nullif(btrim(brand), '') is not null
  group by report_id, btrim(brand)
),
brand_summary as (
  select
    report_id,
    jsonb_object_agg(name, sale) as brand_totals,
    jsonb_agg(jsonb_build_object('name', name, 'sale', sale) order by sale desc, name)
      filter (where rank <= 5) as top_brands
  from (
    select *, row_number() over (partition by report_id order by sale desc, name) as rank
    from brand_sales
  ) ranked
  group by report_id
),
category_sales as (
  select report_id, btrim(category) as name, round(sum(coalesce(net_sale, 0)), 2) as sale
  from public.sales_rows
  where nullif(btrim(category), '') is not null
  group by report_id, btrim(category)
),
category_summary as (
  select
    report_id,
    jsonb_object_agg(name, sale) as category_totals,
    jsonb_agg(jsonb_build_object('name', name, 'sale', sale) order by sale desc, name)
      filter (where rank <= 5) as top_categories
  from (
    select *, row_number() over (partition by report_id order by sale desc, name) as rank
    from category_sales
  ) ranked
  group by report_id
)
update public.reports report
set summary = coalesce(report.summary, '{}'::jsonb) || jsonb_build_object(
  'totalNetSale', totals.actual_sale,
  'totalMrpValue', coalesce(totals.mrp_value, 0),
  'totalDiscountValue', coalesce(totals.discount_value, 0),
  'averageDiscountPercent', case
    when coalesce(totals.mrp_value, 0) > 0
      then round((totals.discount_value / totals.mrp_value) * 100, 4)
    else 0
  end,
  'mrpRowCount', totals.mrp_row_count,
  'rowCount', totals.row_count,
  'billCount', totals.bill_count,
  'staffNames', coalesce(staff.staff_names, '[]'::jsonb),
  'brandSummary', coalesce(brand.brand_totals, '{}'::jsonb),
  'categorySummary', coalesce(category.category_totals, '{}'::jsonb),
  'topStaff', coalesce(staff.top_staff, '[]'::jsonb),
  'topBrands', coalesce(brand.top_brands, '[]'::jsonb),
  'topCategories', coalesce(category.top_categories, '[]'::jsonb),
  'priceBasis', 'MRP and customer-paid actual amount including tax'
)
from row_totals totals
left join staff_summary staff on staff.report_id = totals.report_id
left join brand_summary brand on brand.report_id = totals.report_id
left join category_summary category on category.report_id = totals.report_id
where report.id = totals.report_id
  and report.report_type = 'sales';

with batch_totals as (
  select
    report.sales_upload_batch_id as batch_id,
    round(sum(coalesce(row.net_sale, 0)), 2) as actual_sale
  from public.reports report
  join public.sales_rows row on row.report_id = report.id
  where report.sales_upload_batch_id is not null and report.is_current
  group by report.sales_upload_batch_id
)
update public.sales_upload_batches batch
set total_net_sale = totals.actual_sale
from batch_totals totals
where batch.id = totals.batch_id;

commit;
