drop policy if exists "sales_rows_manager_insert_assigned" on public.sales_rows;

create policy "sales_rows_manager_insert_assigned"
on public.sales_rows
for insert
with check (store_id in (select public.user_store_ids()));
