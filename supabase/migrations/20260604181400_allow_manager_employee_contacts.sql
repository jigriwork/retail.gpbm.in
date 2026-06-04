-- Allow managers to maintain employee contact phone numbers for their assigned active stores.
-- Payslip tables and payslips storage remain owner-only; this migration only adds employee_contacts policies.

alter table public.employee_contacts
  alter column created_by set default auth.uid();

alter table public.employee_contacts enable row level security;

-- Keep owner full access policy intact and idempotent.
drop policy if exists "employee_contacts_owner_all" on public.employee_contacts;
create policy "employee_contacts_owner_all"
on public.employee_contacts
for all
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "employee_contacts_manager_select_assigned" on public.employee_contacts;
create policy "employee_contacts_manager_select_assigned"
on public.employee_contacts
for select
using (
  store_id in (select public.user_store_ids())
  and exists (
    select 1
    from public.stores
    where stores.id = employee_contacts.store_id
      and coalesce(stores.is_active, false) = true
  )
);

drop policy if exists "employee_contacts_manager_insert_assigned" on public.employee_contacts;
create policy "employee_contacts_manager_insert_assigned"
on public.employee_contacts
for insert
with check (
  store_id in (select public.user_store_ids())
  and created_by = auth.uid()
  and exists (
    select 1
    from public.stores
    where stores.id = employee_contacts.store_id
      and coalesce(stores.is_active, false) = true
  )
);

drop policy if exists "employee_contacts_manager_update_assigned" on public.employee_contacts;
create policy "employee_contacts_manager_update_assigned"
on public.employee_contacts
for update
using (
  store_id in (select public.user_store_ids())
  and exists (
    select 1
    from public.stores
    where stores.id = employee_contacts.store_id
      and coalesce(stores.is_active, false) = true
  )
)
with check (
  store_id in (select public.user_store_ids())
  and exists (
    select 1
    from public.stores
    where stores.id = employee_contacts.store_id
      and coalesce(stores.is_active, false) = true
  )
);
