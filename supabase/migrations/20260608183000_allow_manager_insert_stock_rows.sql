drop policy if exists "stock_rows_manager_insert_assigned" on public.stock_rows;

create policy "stock_rows_manager_insert_assigned"
on public.stock_rows
for insert
with check (store_id in (select public.user_store_ids()));
