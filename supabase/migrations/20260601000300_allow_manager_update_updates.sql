-- Allow managers to update manager updates for assigned active store flows.
-- Table shape is unchanged; this adds the missing update policy.

create policy "manager_updates_manager_update_assigned"
on public.manager_updates
for update
using (store_id in (select public.user_store_ids()))
with check (store_id in (select public.user_store_ids()));
