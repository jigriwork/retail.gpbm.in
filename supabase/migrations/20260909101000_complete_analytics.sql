-- One MVCC snapshot; aggregate identical dimensions before transfer to server.
-- JSON return is not subject to PostgREST's set-returning 1,000-row cap.
begin;
create or replace function public.analytics_data(p_store_ids uuid[],p_start date default null,p_end date default null,p_months date[] default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; begin
 if not public.is_active_user() or p_store_ids is null or exists(
   select 1 from unnest(p_store_ids) s where s is null or not public.can_access_store(s)
 ) then raise exception 'Store access denied'; end if;
 if p_start>p_end then raise exception 'Invalid date range'; end if;
 with sales as (
  select r.store_id,r.sale_date,r.bill_no,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.staff_name,
    sum(coalesce(r.quantity,0)) as quantity,sum(coalesce(r.net_sale,0)) as net_sale,count(*) as source_row_count
  from public.sales_rows r join public.reports p on p.id=r.report_id
  where r.store_id=any(p_store_ids) and r.sale_date between p_start and p_end
    and p.status='processed' and coalesce((to_jsonb(p)->>'is_current')::boolean,true)
  group by r.store_id,r.sale_date,r.bill_no,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.staff_name,
    sign(coalesce(r.net_sale,0)),sign(coalesce(r.quantity,0))
 ), stock as (
  select r.store_id,r.stock_month,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.mrp,
    sum(r.quantity) as quantity,count(*) as source_row_count
  from public.stock_rows r join public.reports p on p.id=r.report_id
  where r.store_id=any(p_store_ids) and r.stock_month=any(p_months)
    and p.status='processed' and coalesce((to_jsonb(p)->>'is_current')::boolean,true)
  group by r.store_id,r.stock_month,r.item_name,r.sku,r.barcode,r.brand,r.category,r.size,r.color,r.mrp,(r.quantity is null)
 ) select jsonb_build_object(
  'sales',coalesce((select jsonb_agg(to_jsonb(s) order by store_id,sale_date,bill_no,item_name) from sales s),'[]'),
  'stock',coalesce((select jsonb_agg(to_jsonb(s) order by store_id,stock_month,item_name) from stock s),'[]'),
  'aliases',coalesce((select jsonb_agg(jsonb_build_object('store_id',store_id,'normalized_source_name',normalized_source_name,'canonical_staff_name',canonical_staff_name)) from public.staff_name_aliases where store_id=any(p_store_ids) and source_type='sales_report' and is_active=true),'[]'),
  'sales_row_count',coalesce((select sum(source_row_count) from sales),0),
  'stock_row_count',coalesce((select sum(source_row_count) from stock),0),
  'net_sale',coalesce((select sum(net_sale) from sales),0),
  'stock_quantity',coalesce((select sum(quantity) from stock),0)
 ) into result;
 return result;
end $$;
revoke all on function public.analytics_data(uuid[],date,date,date[]) from public,anon;
grant execute on function public.analytics_data(uuid[],date,date,date[]) to authenticated;
commit;
