-- Add read-performance indexes for Business Reporting Dashboard.
-- Index-only migration: no data, RLS, parser, or table behavior changes.

create index if not exists sales_rows_store_date_brand_idx
  on public.sales_rows(store_id, sale_date, brand);

create index if not exists sales_rows_store_date_category_idx
  on public.sales_rows(store_id, sale_date, category);

create index if not exists sales_rows_store_date_barcode_idx
  on public.sales_rows(store_id, sale_date, barcode);

create index if not exists sales_rows_store_date_sku_idx
  on public.sales_rows(store_id, sale_date, sku);

create index if not exists sales_rows_store_date_staff_name_idx
  on public.sales_rows(store_id, sale_date, staff_name);

create index if not exists stock_rows_store_month_brand_idx
  on public.stock_rows(store_id, stock_month, brand);

create index if not exists stock_rows_store_month_category_idx
  on public.stock_rows(store_id, stock_month, category);

create index if not exists stock_rows_store_month_barcode_idx
  on public.stock_rows(store_id, stock_month, barcode);

create index if not exists stock_rows_store_month_sku_idx
  on public.stock_rows(store_id, stock_month, sku);

