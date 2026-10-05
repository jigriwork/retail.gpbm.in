-- Staff: link salary slips, remove staff who left.
-- 1) Payslip rows and generated payslip PDFs are linked to the staff list
--    (employee_contacts), so each staff login sees its own salary and
--    payslips. Same name in the same store links automatically (now, on every
--    new payroll upload, and hourly). Other names: the owner links directly;
--    a manager or cashier suggests a link that the owner approves.
-- 2) Remove a staff member who left (owner, or the store's manager): their
--    login stops working at once. Staff with no history at all are deleted;
--    otherwise the record is kept (payslips, sales) but hidden as "left".
begin;

-- ---------------------------------------------------------------- payslip links
create function public.payslip_name_key(p text) returns text
language sql immutable set search_path = '' as $$
  -- Same rule as employee_contacts.normalized_staff_name (payroll import).
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

-- Links unlinked payslip rows and PDFs of a store (or all stores) whose name
-- matches exactly one staff member of that store. Returns rows linked.
create function public.auto_link_payslip_names(p_store uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_rows integer; v_pdfs integer;
begin
  if auth.uid() is not null and not (public.is_owner() or (p_store is not null and coalesce(public.can_work_store(p_store), false))) then
    raise exception 'Store access denied.';
  end if;
  with matches as (
    select r.id, min(e.id::text)::uuid as employee
    from public.payslip_rows r
    join public.employee_contacts e on e.store_id = r.store_id and e.normalized_staff_name = public.payslip_name_key(r.staff_name)
    where r.employee_contact_id is null and (p_store is null or r.store_id = p_store)
    group by r.id having count(*) = 1
  )
  update public.payslip_rows r set employee_contact_id = m.employee from matches m where r.id = m.id;
  get diagnostics v_rows = row_count;
  update public.generated_payslips g set employee_contact_id = r.employee_contact_id
  from public.payslip_rows r
  where g.payslip_row_id = r.id and g.employee_contact_id is null and r.employee_contact_id is not null
    and (p_store is null or g.store_id = p_store);
  get diagnostics v_pdfs = row_count;
  return v_rows;
end $$;

-- New payroll rows link themselves when the name is certain.
create function public.payslip_rows_link_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.employee_contact_id is null then
    select min(e.id::text)::uuid into new.employee_contact_id
    from public.employee_contacts e
    where e.store_id = new.store_id and e.normalized_staff_name = public.payslip_name_key(new.staff_name)
    having count(*) = 1;
  end if;
  return new;
end $$;
create trigger payslip_rows_link_staff before insert on public.payslip_rows
  for each row execute function public.payslip_rows_link_staff();

create function public.generated_payslips_link_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.employee_contact_id is null and new.payslip_row_id is not null then
    select employee_contact_id into new.employee_contact_id from public.payslip_rows where id = new.payslip_row_id;
  end if;
  return new;
end $$;
create trigger generated_payslips_link_staff before insert on public.generated_payslips
  for each row execute function public.generated_payslips_link_staff();

-- Suggested links for names that did not match (manager/cashier -> owner approves).
create table public.payslip_link_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  payslip_name text not null check (length(payslip_name) between 1 and 120),
  employee_contact_id uuid not null references public.employee_contacts(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid default auth.uid() references public.profiles(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz
);
create unique index payslip_link_requests_one_pending on public.payslip_link_requests (store_id, payslip_name) where status = 'pending';
alter table public.payslip_link_requests enable row level security;
revoke all on public.payslip_link_requests from anon, authenticated;

-- Applies a link to every payslip row and PDF with that name in the store.
create function public.apply_payslip_link(p_store uuid, p_name text, p_employee uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  update public.payslip_rows set employee_contact_id = p_employee
  where store_id = p_store and public.payslip_name_key(staff_name) = public.payslip_name_key(p_name);
  get diagnostics v_rows = row_count;
  update public.generated_payslips g set employee_contact_id = p_employee
  where g.store_id = p_store and public.payslip_name_key(g.staff_name) = public.payslip_name_key(p_name);
  return v_rows;
end $$;
revoke all on function public.apply_payslip_link(uuid, text, uuid) from public, anon, authenticated;

-- Owner: links at once. Manager/cashier of the store: a request the owner approves.
create function public.link_payslip_name(p_store uuid, p_name text, p_employee uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_emp public.employee_contacts;
begin
  if not coalesce(public.can_work_store(p_store), false) then raise exception 'Store access denied.'; end if;
  select * into v_emp from public.employee_contacts where id = p_employee;
  if v_emp.id is null or v_emp.store_id <> p_store then raise exception 'Choose a staff member of this store.'; end if;
  if not exists (select 1 from public.payslip_rows where store_id = p_store and public.payslip_name_key(staff_name) = public.payslip_name_key(p_name)) then
    raise exception 'This name is not on the salary slips of this store.';
  end if;
  if public.is_owner() then
    perform public.apply_payslip_link(p_store, p_name, p_employee);
    insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
    values (auth.uid(), 'owner', 'payslip_name_linked', 'employee_contact', p_employee, p_store, jsonb_build_object('payslip_name', p_name));
    return 'linked';
  end if;
  insert into public.payslip_link_requests(store_id, payslip_name, employee_contact_id)
  values (p_store, btrim(p_name), p_employee)
  on conflict (store_id, payslip_name) where status = 'pending' do update set employee_contact_id = excluded.employee_contact_id,
    requested_by = auth.uid(), requested_at = now();
  return 'requested';
end $$;

create function public.decide_payslip_link(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req public.payslip_link_requests;
begin
  if not public.is_owner() then raise exception 'Only the owner approves salary slip links.'; end if;
  select * into v_req from public.payslip_link_requests where id = p_request and status = 'pending' for update;
  if v_req.id is null then raise exception 'This request is already decided.'; end if;
  if p_approve then perform public.apply_payslip_link(v_req.store_id, v_req.payslip_name, v_req.employee_contact_id); end if;
  update public.payslip_link_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
  where id = v_req.id;
end $$;

-- Payslip names of a store with their link state (names and months only, no amounts).
create function public.payslip_link_overview(p_store uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not coalesce(public.can_work_store(p_store), false) then null else jsonb_build_object(
    'linked', (select count(distinct public.payslip_name_key(staff_name)) from public.payslip_rows where store_id = p_store and employee_contact_id is not null),
    'unlinked', coalesce((select jsonb_agg(jsonb_build_object('name', n.name, 'months', n.months, 'last_month', n.last_month,
        'requested', (select e.staff_name from public.payslip_link_requests q join public.employee_contacts e on e.id = q.employee_contact_id
                      where q.store_id = p_store and public.payslip_name_key(q.payslip_name) = n.key and q.status = 'pending' limit 1))
        order by n.last_month desc, n.name)
      from (select public.payslip_name_key(staff_name) as key, min(regexp_replace(btrim(staff_name), '\s+', ' ', 'g')) as name, count(distinct salary_month) as months,
                   max(salary_month) as last_month
            from public.payslip_rows where store_id = p_store and employee_contact_id is null and public.payslip_name_key(staff_name) is not null group by 1) n), '[]'::jsonb),
    'requests', case when public.is_owner() then coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.payslip_name, 'staff', e.staff_name,
        'by', (select full_name from public.profiles where id = q.requested_by), 'at', q.requested_at) order by q.requested_at)
      from public.payslip_link_requests q join public.employee_contacts e on e.id = q.employee_contact_id
      where q.store_id = p_store and q.status = 'pending'), '[]'::jsonb) else '[]'::jsonb end,
    -- Staff who left are listed last: their old slips can still be matched.
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.staff_name || case when e.is_active is false then ' (left)' else '' end)
        order by e.is_active is false, e.staff_name)
      from public.employee_contacts e where e.store_id = p_store), '[]'::jsonb)
  ) end
$$;

revoke all on function public.auto_link_payslip_names(uuid), public.link_payslip_name(uuid, text, uuid), public.decide_payslip_link(uuid, boolean),
  public.payslip_link_overview(uuid) from public, anon;
grant execute on function public.auto_link_payslip_names(uuid), public.link_payslip_name(uuid, text, uuid), public.decide_payslip_link(uuid, boolean),
  public.payslip_link_overview(uuid) to authenticated;

-- ---------------------------------------------------------------- remove staff who left
alter table public.employee_contacts
  add column if not exists left_on date,
  add column if not exists removed_by uuid references public.profiles(id);

create function public.remove_staff(p_employee uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_emp public.employee_contacts; v_history boolean;
begin
  select * into v_emp from public.employee_contacts where id = p_employee for update;
  if v_emp.id is null then raise exception 'Staff member not found.'; end if;
  -- Owner, or the manager of the store (cashiers cannot remove staff).
  if not coalesce(public.can_access_store(v_emp.store_id), false) then raise exception 'Only the owner or the store manager can remove staff.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Write why (for example: left on 30 Sep).'; end if;
  -- Sales names and salary slips under this name are history: keep the record.
  v_history := exists (select 1 from public.staff_name_aliases where employee_contact_id = p_employee)
    or exists (select 1 from public.payslip_rows where employee_contact_id = p_employee
               or (store_id = v_emp.store_id and public.payslip_name_key(staff_name) = v_emp.normalized_staff_name));
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'staff_removed', 'employee_contact', p_employee, v_emp.store_id,
    jsonb_build_object('staff_name', v_emp.staff_name, 'reason', btrim(p_reason)));
  -- Their staff login stops working (access also requires an active staff record).
  update public.employee_auth_links set status = 'inactive', deactivated_by = auth.uid(), deactivated_at = now(),
    deactivation_reason = left('Left: ' || btrim(p_reason), 200)
  where employee_contact_id = p_employee and status = 'active';
  if not v_history then
    begin
      delete from public.employee_contacts where id = p_employee;
      return 'deleted';
    exception when foreign_key_violation then
      null; -- used elsewhere (login, cash book, tasks): keep it as "left"
    end;
  end if;
  update public.employee_contacts set is_active = false, left_on = public.india_today(), removed_by = auth.uid(),
    notes = left(trim(both ' ' from coalesce(notes, '') || ' Left: ' || btrim(p_reason)), 1000)
  where id = p_employee;
  return 'removed';
end $$;
revoke all on function public.remove_staff(uuid, text) from public, anon;
grant execute on function public.remove_staff(uuid, text) to authenticated;

-- Link everything that matches now, and keep doing it every hour.
select public.auto_link_payslip_names(null);

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('payslip-name-auto-link', '20 * * * *', 'select public.auto_link_payslip_names(null)');
  end if;
end
$outer$;

commit;
