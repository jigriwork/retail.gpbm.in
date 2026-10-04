-- Staff incentives: schemes set by the owner (slabs on a salesperson's
-- monthly net sale, or on their achievement of a monthly target) and monthly
-- targets per salesperson. The incentive itself is worked out from the staff
-- sales summary (the same matching of staff names as Reports → Staff Sales).
begin;

create table public.incentive_schemes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  name text not null check (length(btrim(name)) between 2 and 80),
  valid_from date not null check (extract(day from valid_from) = 1),
  valid_to date check (valid_to is null or (extract(day from valid_to) = 1 and valid_to >= valid_from)),
  basis text not null check (basis in ('sales_amount', 'target_pct')),
  payout text not null default 'whole' check (payout in ('whole', 'marginal')),
  -- [{ "from": 0, "rate": 0 }, { "from": 100000, "rate": 1 }] — from: ₹ or % of target; rate: % of net sale.
  slabs jsonb not null check (jsonb_typeof(slabs) = 'array' and jsonb_array_length(slabs) between 1 and 10),
  min_bills integer not null default 0 check (min_bills between 0 and 10000),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.incentive_schemes enable row level security;
revoke all on public.incentive_schemes from anon, authenticated;
grant select, insert, update, delete on public.incentive_schemes to authenticated;
create policy incentive_schemes_read on public.incentive_schemes for select to authenticated
  using (public.is_active_user() and (public.is_owner() or store_id is null and exists (select 1 from public.user_store_ids())
    or store_id in (select public.user_store_ids())));
create policy incentive_schemes_owner on public.incentive_schemes for insert to authenticated with check (public.is_owner());
create policy incentive_schemes_owner_update on public.incentive_schemes for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy incentive_schemes_owner_delete on public.incentive_schemes for delete to authenticated using (public.is_owner());

create table public.staff_targets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  month date not null check (extract(day from month) = 1),
  staff_name text not null check (length(btrim(staff_name)) between 1 and 80),
  target numeric(14,2) not null check (target > 0 and target <= 100000000),
  set_by uuid default auth.uid() references public.profiles(id),
  set_at timestamptz not null default now(),
  unique (store_id, month, staff_name)
);
alter table public.staff_targets enable row level security;
revoke all on public.staff_targets from anon, authenticated;
grant select, insert, update, delete on public.staff_targets to authenticated;
-- The owner and the store's managers set targets for that store.
create policy staff_targets_read on public.staff_targets for select to authenticated
  using (public.is_active_user() and public.can_access_store(store_id));
create policy staff_targets_write on public.staff_targets for insert to authenticated with check (public.can_access_store(store_id));
create policy staff_targets_update on public.staff_targets for update to authenticated using (public.can_access_store(store_id)) with check (public.can_access_store(store_id));
create policy staff_targets_delete on public.staff_targets for delete to authenticated using (public.can_access_store(store_id));

commit;
