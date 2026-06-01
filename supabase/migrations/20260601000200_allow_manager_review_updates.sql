-- Allow managers to correct same-day rack and cleaning reviews for assigned stores.
-- Table shape is unchanged; this only adds the missing update policies.

create policy "rack_reviews_manager_update_assigned"
on public.rack_reviews
for update
using (store_id in (select public.user_store_ids()) and reviewed_by = auth.uid())
with check (store_id in (select public.user_store_ids()) and reviewed_by = auth.uid());

create policy "cleaning_reviews_manager_update_assigned"
on public.cleaning_reviews
for update
using (store_id in (select public.user_store_ids()) and reviewed_by = auth.uid())
with check (store_id in (select public.user_store_ids()) and reviewed_by = auth.uid());
