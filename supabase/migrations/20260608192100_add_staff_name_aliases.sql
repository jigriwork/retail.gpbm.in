-- Add persistent sales staff name alias mapping.
-- This migration is additive and does not change payslip/salary or stock upload modules.

create table if not exists public.staff_name_aliases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) not null,
  employee_contact_id uuid references public.employee_contacts(id) on delete set null,
  canonical_staff_name text not null,
  normalized_canonical_staff_name text not null,
  source_name text not null,
  normalized_source_name text not null,
  source_type text default 'sales_report',
  is_active boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint staff_name_aliases_source_type_check
    check (source_type in ('sales_report', 'manual', 'other')),
  constraint staff_name_aliases_store_source_type_key
    unique (store_id, normalized_source_name, source_type)
);

alter table public.staff_name_aliases
  alter column created_by set default auth.uid();

create index if not exists staff_name_aliases_store_id_idx on public.staff_name_aliases(store_id);
create index if not exists staff_name_aliases_employee_contact_id_idx on public.staff_name_aliases(employee_contact_id);
create index if not exists staff_name_aliases_normalized_source_name_idx on public.staff_name_aliases(normalized_source_name);
create index if not exists staff_name_aliases_source_type_idx on public.staff_name_aliases(source_type);
create index if not exists staff_name_aliases_is_active_idx on public.staff_name_aliases(is_active);

drop trigger if exists set_staff_name_aliases_updated_at on public.staff_name_aliases;
create trigger set_staff_name_aliases_updated_at
  before update on public.staff_name_aliases
  for each row execute function public.set_updated_at();

alter table public.staff_name_aliases enable row level security;

drop policy if exists "staff_name_aliases_owner_all" on public.staff_name_aliases;
create policy "staff_name_aliases_owner_all"
on public.staff_name_aliases
for all
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "staff_name_aliases_manager_select_assigned" on public.staff_name_aliases;
create policy "staff_name_aliases_manager_select_assigned"
on public.staff_name_aliases
for select
using (
  store_id in (select public.user_store_ids())
  and exists (
    select 1
    from public.stores
    where stores.id = staff_name_aliases.store_id
      and coalesce(stores.is_active, false) = true
  )
);

drop policy if exists "staff_name_aliases_manager_insert_assigned" on public.staff_name_aliases;
create policy "staff_name_aliases_manager_insert_assigned"
on public.staff_name_aliases
for insert
with check (
  store_id in (select public.user_store_ids())
  and created_by = auth.uid()
  and exists (
    select 1
    from public.stores
    where stores.id = staff_name_aliases.store_id
      and coalesce(stores.is_active, false) = true
  )
);

drop policy if exists "staff_name_aliases_manager_update_assigned" on public.staff_name_aliases;
create policy "staff_name_aliases_manager_update_assigned"
on public.staff_name_aliases
for update
using (
  store_id in (select public.user_store_ids())
  and exists (
    select 1
    from public.stores
    where stores.id = staff_name_aliases.store_id
      and coalesce(stores.is_active, false) = true
  )
)
with check (
  store_id in (select public.user_store_ids())
  and exists (
    select 1
    from public.stores
    where stores.id = staff_name_aliases.store_id
      and coalesce(stores.is_active, false) = true
  )
);