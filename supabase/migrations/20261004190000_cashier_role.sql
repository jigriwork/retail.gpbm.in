-- Cashier role (owner's choices, 4 Oct 2026): day-end cash close, expenses,
-- daily sales and stock uploads, stock counts, and requesting new staff (the
-- owner approves). A cashier sees only their own entries: no sales totals,
-- Logic sale, expected cash, shortages or stock differences.
--
-- Store access for managers (user_store_ids / can_access_store) also opens
-- sales and stock data, so cashiers get a separate, narrower check,
-- can_work_store, used only by the functions behind the cashier's tasks.
begin;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'manager', 'staff', 'accountant', 'cashier'));

create function public.cashier_store_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select su.store_id from public.store_users su
  join public.profiles p on p.id = su.user_id and p.is_active and p.role = 'cashier'
  join public.stores s on s.id = su.store_id and s.is_active
  where su.user_id = auth.uid()
$$;

create function public.is_cashier() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active and role = 'cashier')
$$;

-- Owner, the store's manager, or the store's cashier.
create function public.can_work_store(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_access_store(p_store) or p_store in (select public.cashier_store_ids())
$$;

revoke all on function public.cashier_store_ids(), public.is_cashier(), public.can_work_store(uuid) from public, anon;
grant execute on function public.cashier_store_ids(), public.is_cashier(), public.can_work_store(uuid) to authenticated, service_role;

-- The cashier's tasks: switch their store check from can_access_store to
-- can_work_store (each function is otherwise unchanged).
do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'public.begin_report_import(uuid,text,text,text,jsonb,text,boolean)',
    'public.stage_report_chunk(uuid,integer,jsonb)',
    'public.commit_report_import(uuid)',
    'public.commit_stock_report_import(uuid)',
    'public.publish_stock_import_part(uuid)',
    'public.fail_report_import(uuid)',
    'public.reserve_source_file(uuid,text,text,text)',
    'public.can_upload_source(text,text)',
    'public.submit_day_close(uuid,date,numeric,numeric,numeric,numeric,numeric,text,numeric,text)',
    'public.missing_day_closes(uuid,integer)',
    'public.start_stock_count(uuid,text,text,text)',
    'public.record_stock_count(uuid,numeric)',
    'public.add_stock_count_extra(uuid,text,text,text,numeric)',
    'public.submit_stock_count(uuid)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('public.can_access_store(' in def) = 0 then raise exception 'Expected a store check in %', f; end if;
    execute replace(def, 'public.can_access_store(', 'public.can_work_store(');
  end loop;
end $$;

-- A cashier's uploaded source file can be read back for processing.
do $$
declare def text := pg_get_functiondef('public.can_read_source(text,text)'::regprocedure);
begin
  if position('f.file_path=p_path and public.can_access_store(f.store_id)' in def) = 0 then raise exception 'can_read_source changed'; end if;
  execute replace(def, 'f.file_path=p_path and public.can_access_store(f.store_id)', 'f.file_path=p_path and public.can_work_store(f.store_id)');
end $$;

-- Cashiers may upload daily sales and stock for their store.
create or replace function public.upload_actor_allowed(p_actor uuid, p_store uuid, p_kind text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
 select exists(select 1 from public.profiles p join public.stores s on s.id=p_store and s.is_active=true
 where p.id=p_actor and p.is_active=true and (p.role='owner'
   or (p.role='manager' and p_kind not in('payroll','sales-bulk','sales-replacement')
     and exists(select 1 from public.store_users u where u.user_id=p.id and u.store_id=s.id))
   or (p.role='cashier' and p_kind in('sales','stock')
     and exists(select 1 from public.store_users u where u.user_id=p.id and u.store_id=s.id))));
$function$;

-- Day close overview: a cashier sees their store's closes without Logic's
-- sale, the expected cash or the difference.
do $$
declare def text := pg_get_functiondef('public.day_close_overview(uuid,date,date)'::regprocedure);
begin
  def := replace(def, 'where public.can_access_store(p_store) and c.store_id = p_store', 'where public.can_work_store(p_store) and c.store_id = p_store');
  def := replace(def, '    s.net_sale, s.report_id is not null, coalesce(e.cash_spent, 0),',
    '    case when public.is_cashier() then null else s.net_sale end, s.report_id is not null, coalesce(e.cash_spent, 0),');
  def := replace(def, '    case when s.report_id is not null then c.opening_cash + (s.net_sale - c.upi_amount - c.card_amount - c.other_amount) - coalesce(e.cash_spent, 0) end,',
    '    case when s.report_id is not null and not public.is_cashier() then c.opening_cash + (s.net_sale - c.upi_amount - c.card_amount - c.other_amount) - coalesce(e.cash_spent, 0) end,');
  def := replace(def, '    case when s.report_id is not null then c.cash_counted - (c.opening_cash',
    '    case when s.report_id is not null and not public.is_cashier() then c.cash_counted - (c.opening_cash');
  if (length(def) - length(replace(def, 'is_cashier()', ''))) / length('is_cashier()') <> 3 or position('can_work_store(p_store)' in def) = 0 then
    raise exception 'day_close_overview changed';
  end if;
  execute def;
end $$;

-- Stock count sheet and totals: never the expected stock or differences for a cashier.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.stock_count_sheet(uuid)'::regprocedure);
  def := replace(def, 'case when c.status <> ''counting'' then l.expected_qty end', 'case when c.status <> ''counting'' and not public.is_cashier() then l.expected_qty end');
  def := replace(def, 'where l.count_id = p_count and public.can_access_store(c.store_id)', 'where l.count_id = p_count and public.can_work_store(c.store_id)');
  if position('not public.is_cashier()' in def) = 0 or position('can_work_store(c.store_id)' in def) = 0 then raise exception 'stock_count_sheet changed'; end if;
  execute def;
  def := pg_get_functiondef('public.stock_count_summary(uuid)'::regprocedure);
  def := replace(def, 'where l.count_id = p_count and public.can_access_store(c.store_id)', 'where l.count_id = p_count and public.can_access_store(c.store_id) and not public.is_cashier()');
  if position('not public.is_cashier()' in def) = 0 then raise exception 'stock_count_summary changed'; end if;
  execute def;
end $$;

-- Brands in the store's latest stock report, for choosing what to count.
create function public.stock_count_brands(p_store uuid)
returns setof text language sql stable security definer set search_path = '' as $$
  select distinct c.brand from public.stock_position_cache c
  where c.store_id = p_store and c.on_hand > 0 and c.brand is not null and public.can_work_store(p_store)
  order by 1
$$;
revoke all on function public.stock_count_brands(uuid) from public, anon;
grant execute on function public.stock_count_brands(uuid) to authenticated;

-- refresh_stock_position: cashiers may trigger it for their store (it exposes nothing).
do $$
declare def text := pg_get_functiondef('public.refresh_stock_position(uuid)'::regprocedure);
begin
  if position('role in (''owner'', ''manager'')' in def) = 0 then raise exception 'refresh_stock_position changed'; end if;
  execute replace(def, 'role in (''owner'', ''manager'')', 'role in (''owner'', ''manager'', ''cashier'')');
end $$;

-- ---------------------------------------------------------------- table access for cashiers
create policy stores_cashier_select on public.stores for select to authenticated
  using (id in (select public.cashier_store_ids()));
create policy day_closes_cashier_read on public.store_day_closes for select to authenticated
  using (store_id in (select public.cashier_store_ids()));
-- Expenses: a cashier adds for their store and sees only their own entries.
drop policy expenses_add on public.store_expenses;
create policy expenses_add on public.store_expenses for insert to authenticated
  with check (public.can_work_store(store_id) and created_by = auth.uid() and status = 'recorded'
    and checked_by is null and expense_date <= public.india_today()
    and (public.is_owner() or expense_date >= public.india_today() - 7));
create policy expenses_cashier_read on public.store_expenses for select to authenticated
  using (created_by = auth.uid() and store_id in (select public.cashier_store_ids()));
drop policy expenses_remove on public.store_expenses;
create policy expenses_remove on public.store_expenses for delete to authenticated
  using (public.is_owner() or (created_by = auth.uid() and status = 'recorded'
    and created_at > now() - interval '1 day' and public.can_work_store(store_id)));
create policy stock_counts_cashier_read on public.stock_counts for select to authenticated
  using (store_id in (select public.cashier_store_ids()));
create policy upload_intent_cashier_read on public.upload_intents for select to authenticated
  using (actor_id = auth.uid() and store_id in (select public.cashier_store_ids()));

-- ---------------------------------------------------------------- new staff requests
create table public.staff_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  staff_name text not null check (length(btrim(staff_name)) between 2 and 80),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  designation text check (designation is null or length(designation) <= 60),
  joining_date date,
  note text check (note is null or length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null default auth.uid() references public.profiles(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300),
  employee_contact_id uuid references public.employee_contacts(id)
);
alter table public.staff_requests enable row level security;
revoke all on public.staff_requests from anon, authenticated;
grant select, insert on public.staff_requests to authenticated;
grant update (status, decided_by, decided_at, decision_note, employee_contact_id) on public.staff_requests to authenticated;
create policy staff_requests_add on public.staff_requests for insert to authenticated
  with check (public.can_work_store(store_id) and requested_by = auth.uid() and status = 'pending' and decided_by is null and employee_contact_id is null);
create policy staff_requests_read on public.staff_requests for select to authenticated
  using (public.is_owner() or requested_by = auth.uid() or store_id in (select public.user_store_ids()));
create policy staff_requests_decide on public.staff_requests for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

commit;
