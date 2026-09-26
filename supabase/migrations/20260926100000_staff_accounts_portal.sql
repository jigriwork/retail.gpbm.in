-- Phase 2: exact staff identity, account lifecycle, and private staff portal.
-- Additive/forward-only. No existing business row is updated or backfilled.

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'manager', 'staff'));

alter table public.employee_contacts
  add column if not exists designation text;

alter table public.staff_name_aliases
  add column if not exists verification_status text,
  add column if not exists verified_by uuid references public.profiles(id),
  add column if not exists verified_at timestamptz,
  add column if not exists verification_note text;

alter table public.staff_name_aliases
  drop constraint if exists staff_name_aliases_verification_status_check;
alter table public.staff_name_aliases
  add constraint staff_name_aliases_verification_status_check
  check (verification_status is null or verification_status in ('unverified', 'verified', 'rejected'));

alter table public.payslip_rows
  add column if not exists employee_contact_id uuid references public.employee_contacts(id);
alter table public.generated_payslips
  add column if not exists employee_contact_id uuid references public.employee_contacts(id);

alter table public.tasks
  add column if not exists assigned_employee_id uuid references public.employee_contacts(id),
  add column if not exists completion_note text;

-- Phase 2 manager onboarding is request-only. Existing contacts remain readable/editable
-- within assigned stores, but managers can no longer create a second employee as a login shortcut.
drop policy if exists "employee_contacts_manager_insert_assigned" on public.employee_contacts;

create or replace function public.enforce_owner_alias_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() and (
    (tg_op = 'INSERT' and (new.verification_status is not null or new.verified_by is not null or new.verified_at is not null or new.verification_note is not null))
    or (tg_op = 'UPDATE' and (
      new.verification_status is distinct from old.verification_status
      or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at
      or new.verification_note is distinct from old.verification_note
      or (old.verification_status = 'verified' and (
        new.employee_contact_id is distinct from old.employee_contact_id
        or new.store_id is distinct from old.store_id
        or new.normalized_source_name is distinct from old.normalized_source_name
        or new.source_type is distinct from old.source_type
        or new.is_active is distinct from old.is_active
      ))
    ))
  ) then
    raise exception 'Only an owner can verify a sales alias';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_owner_alias_verification on public.staff_name_aliases;
create trigger enforce_owner_alias_verification
  before insert or update on public.staff_name_aliases
  for each row execute function public.enforce_owner_alias_verification();

create table if not exists public.staff_account_requests (
  id uuid primary key default gen_random_uuid(),
  employee_contact_id uuid not null references public.employee_contacts(id),
  store_id uuid not null references public.stores(id),
  requested_email text not null,
  requested_by uuid not null references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'account_created', 'cancelled')),
  decision_by uuid references public.profiles(id),
  decision_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_account_requests_email_format_check
    check (requested_email = lower(btrim(requested_email)) and requested_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create unique index if not exists staff_account_requests_one_open_employee
  on public.staff_account_requests(employee_contact_id)
  where status in ('pending', 'approved');
create unique index if not exists staff_account_requests_one_open_email
  on public.staff_account_requests(lower(requested_email))
  where status in ('pending', 'approved');
create index if not exists staff_account_requests_store_status_idx
  on public.staff_account_requests(store_id, status, created_at desc);

create table if not exists public.employee_auth_links (
  id uuid primary key default gen_random_uuid(),
  employee_contact_id uuid not null unique references public.employee_contacts(id),
  auth_user_id uuid not null unique references public.profiles(id) on delete restrict,
  store_id uuid not null references public.stores(id),
  login_email text not null,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  must_change_password boolean not null default true,
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  activated_by uuid references public.profiles(id),
  activated_at timestamptz,
  deactivated_by uuid references public.profiles(id),
  deactivated_at timestamptz,
  deactivation_reason text,
  last_password_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_auth_links_email_format_check
    check (login_email = lower(btrim(login_email)) and login_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create unique index if not exists employee_auth_links_login_email_key
  on public.employee_auth_links(lower(login_email));
create index if not exists employee_auth_links_store_status_idx
  on public.employee_auth_links(store_id, status);

create table if not exists public.staff_security_events (
  id uuid primary key default gen_random_uuid(),
  employee_contact_id uuid not null references public.employee_contacts(id),
  auth_user_id uuid references public.profiles(id),
  store_id uuid not null references public.stores(id),
  actor_id uuid references public.profiles(id),
  actor_role text,
  event_type text not null check (event_type in (
    'request_created', 'request_approved', 'request_rejected', 'account_created',
    'account_activated', 'account_deactivated', 'account_reactivated',
    'temporary_password_issued', 'temporary_password_reset',
    'password_changed', 'sensitive_access_granted', 'credential_action_denied'
  )),
  outcome text not null default 'success' check (outcome in ('success', 'denied', 'failed')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_security_events_employee_created_idx
  on public.staff_security_events(employee_contact_id, created_at desc);
create index if not exists staff_security_events_actor_created_idx
  on public.staff_security_events(actor_id, created_at desc);

create table if not exists public.sensitive_access_grants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('salary', 'credential_management')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sensitive_access_grants_user_purpose_idx
  on public.sensitive_access_grants(auth_user_id, purpose, expires_at desc);

create table if not exists public.credential_action_limits (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  employee_contact_id uuid not null references public.employee_contacts(id) on delete cascade,
  window_started_at timestamptz not null,
  action_count integer not null default 1 check (action_count between 1 and 20),
  primary key (actor_id, employee_contact_id, window_started_at)
);

create index if not exists payslip_rows_employee_contact_id_idx
  on public.payslip_rows(employee_contact_id, salary_month desc);
create index if not exists generated_payslips_employee_contact_id_idx
  on public.generated_payslips(employee_contact_id, salary_month desc)
  where is_current;
create index if not exists tasks_assigned_employee_status_idx
  on public.tasks(assigned_employee_id, status, due_date);
create index if not exists staff_alias_employee_verified_idx
  on public.staff_name_aliases(employee_contact_id, store_id, source_type)
  where verification_status = 'verified' and is_active = true;

drop trigger if exists set_staff_account_requests_updated_at on public.staff_account_requests;
create trigger set_staff_account_requests_updated_at before update on public.staff_account_requests
  for each row execute function public.set_updated_at();
drop trigger if exists set_employee_auth_links_updated_at on public.employee_auth_links;
create trigger set_employee_auth_links_updated_at before update on public.employee_auth_links
  for each row execute function public.set_updated_at();

alter table public.staff_account_requests enable row level security;
alter table public.employee_auth_links enable row level security;
alter table public.staff_security_events enable row level security;
alter table public.sensitive_access_grants enable row level security;
alter table public.credential_action_limits enable row level security;

create or replace function public.current_staff_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select links.employee_contact_id
  from public.employee_auth_links links
  join public.profiles profiles on profiles.id = links.auth_user_id
  join public.employee_contacts employees on employees.id = links.employee_contact_id
  join public.stores stores on stores.id = links.store_id
  where links.auth_user_id = auth.uid()
    and profiles.role = 'staff'
    and profiles.is_active = true
    and links.status = 'active'
    and employees.is_active = true
    and stores.is_active = true
    and employees.store_id = links.store_id;
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.current_staff_employee_id() is not null $$;

create or replace function public.can_manage_staff_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_contacts employee
    join public.profiles actor on actor.id = auth.uid() and actor.is_active = true
    where employee.id = p_employee_id
      and employee.is_active = true
      and (
        actor.role = 'owner'
        or (
          actor.role = 'manager'
          and exists (
            select 1 from public.store_users assignment
            join public.stores store on store.id = assignment.store_id and store.is_active = true
            where assignment.user_id = actor.id and assignment.store_id = employee.store_id
          )
        )
      )
  );
$$;

create or replace function public.consume_credential_action_limit(p_employee_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if not public.can_manage_staff_employee(p_employee_id) then return false; end if;
  insert into public.credential_action_limits(actor_id, employee_contact_id, window_started_at, action_count)
  values(auth.uid(), p_employee_id, v_window, 1)
  on conflict(actor_id, employee_contact_id, window_started_at)
  do update set action_count = public.credential_action_limits.action_count + 1
  returning action_count into v_count;
  return v_count <= 5;
end;
$$;

create or replace function public.validate_sensitive_access_grant(p_token text, p_purpose text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  update public.sensitive_access_grants
  set used_at = coalesce(used_at, now())
  where auth_user_id = auth.uid()
    and purpose = p_purpose
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and expires_at > now()
    and revoked_at is null
  returning true;
$$;

create or replace function public.staff_profile_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'employee_id', employee.id,
    'name', employee.staff_name,
    'designation', employee.designation,
    'store', jsonb_build_object('id', store.id, 'name', store.name, 'code', store.code),
    'email', link.login_email,
    'account_status', link.status,
    'must_change_password', link.must_change_password,
    'sales_linkage_verified', exists(
      select 1 from public.staff_name_aliases alias
      where alias.employee_contact_id = employee.id
        and alias.store_id = employee.store_id
        and alias.source_type = 'sales_report'
        and alias.is_active = true
        and alias.verification_status = 'verified'
    )
  )
  from public.employee_contacts employee
  join public.employee_auth_links link on link.employee_contact_id = employee.id
  join public.stores store on store.id = employee.store_id
  where employee.id = public.current_staff_employee_id();
$$;

create or replace function public.my_sales_summary(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_employee uuid := public.current_staff_employee_id(); v_result jsonb;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  if p_start is null or p_end is null or p_start > p_end or p_end - p_start > 400 then
    raise exception 'Invalid date range';
  end if;
  with employee as (
    select id, store_id from public.employee_contacts where id = v_employee
  ), verified_aliases as (
    select alias.store_id, alias.normalized_source_name
    from public.staff_name_aliases alias join employee on employee.id = alias.employee_contact_id
    where alias.store_id = employee.store_id and alias.source_type = 'sales_report'
      and alias.is_active = true and alias.verification_status = 'verified'
  ), base as (
    select rows.sale_date, rows.bill_no, coalesce(rows.quantity,0)::numeric quantity,
      coalesce(rows.net_sale,0)::numeric net_sale, reports.created_at uploaded_at
    from public.sales_rows rows
    join public.reports reports on reports.id = rows.report_id
    join verified_aliases alias on alias.store_id = rows.store_id
      and alias.normalized_source_name = lower(regexp_replace(btrim(rows.staff_name), '\s+', ' ', 'g'))
    where rows.sale_date between p_start and p_end
      and reports.status = 'processed' and reports.is_current
  ), totals as (
    select count(*)::bigint row_count, coalesce(sum(net_sale),0) value,
      coalesce(sum(quantity),0) quantity,
      count(distinct (sale_date,bill_no)) filter(where nullif(btrim(bill_no),'') is not null)::bigint bill_count,
      max(sale_date) source_through_date, max(uploaded_at) latest_uploaded_at from base
  ), daily as (
    select sale_date, sum(net_sale) value, sum(quantity) quantity,
      count(distinct bill_no) filter(where nullif(btrim(bill_no),'') is not null) bill_count
    from base group by sale_date
  )
  select jsonb_build_object(
    'linkage_verified', exists(select 1 from verified_aliases),
    'summary', jsonb_build_object('value', totals.value, 'quantity', totals.quantity,
      'bill_count', totals.bill_count, 'row_count', totals.row_count),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily) order by sale_date) from daily),'[]'::jsonb),
    'source_through_date', totals.source_through_date,
    'latest_uploaded_at', totals.latest_uploaded_at
  ) into v_result from totals;
  return v_result;
end;
$$;

create or replace function public.staff_home_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_employee uuid := public.current_staff_employee_id();
  v_store uuid;
  v_today date := (timezone('Asia/Kolkata', now()))::date;
  v_sales jsonb;
  v_result jsonb;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  select store_id into v_store from public.employee_contacts where id = v_employee;
  v_sales := public.my_sales_summary(date_trunc('month', v_today)::date, v_today);
  select jsonb_build_object(
    'sales', v_sales,
    'today_value', coalesce((select (day->>'value')::numeric from jsonb_array_elements(v_sales->'daily') day where day->>'sale_date' = v_today::text),0),
    'pending_tasks', (select count(*) from public.tasks where assigned_employee_id = v_employee and coalesce(status,'pending') not in ('done','cancelled')),
    'latest_payslip_month', (select max(salary_month) from public.generated_payslips where employee_contact_id = v_employee and is_current),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('title', item.title, 'details', item.details, 'urgency', item.urgency, 'created_at', item.created_at) order by item.created_at desc)
      from (select title, details, urgency, created_at from public.manager_updates where store_id = v_store and (urgency = 'urgent' or status = 'open') order by created_at desc limit 5) item
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.my_salary_summary(p_grant_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_employee uuid := public.current_staff_employee_id(); v_result jsonb;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  if not public.validate_sensitive_access_grant(p_grant_token, 'salary') then
    raise exception 'Recent password verification required';
  end if;
  select jsonb_build_object(
    'periods', coalesce(jsonb_agg(jsonb_build_object(
      'id', row.id, 'salary_month', row.salary_month, 'salary_amount', row.salary_amount,
      'abs_days', row.abs_days, 'abs_amount', row.abs_amount, 'sunday_pay_amount', row.sunday_pay_amount,
      'advance', row.advance, 'commission', row.commission, 'net_payable', row.net_payable,
      'status', row.status
    ) order by row.salary_month desc), '[]'::jsonb)
  ) into v_result
  from public.payslip_rows row
  where row.employee_contact_id = v_employee;
  return v_result;
end;
$$;

create or replace function public.my_payslip_list(p_grant_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_employee uuid := public.current_staff_employee_id(); v_result jsonb;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  if not public.validate_sensitive_access_grant(p_grant_token, 'salary') then
    raise exception 'Recent password verification required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', slip.id, 'salary_month', slip.salary_month,
    'file_name', slip.pdf_file_name, 'created_at', slip.created_at
  ) order by slip.salary_month desc, slip.created_at desc), '[]'::jsonb) into v_result
  from public.generated_payslips slip
  where slip.employee_contact_id = v_employee and slip.is_current = true;
  return v_result;
end;
$$;

create or replace function public.my_tasks_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_employee uuid := public.current_staff_employee_id(); v_result jsonb;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', task.id, 'title', task.title, 'description', task.description,
    'category', task.category, 'priority', task.priority, 'status', task.status,
    'due_date', task.due_date, 'due_time', task.due_time,
    'completion_note', task.completion_note, 'completed_at', task.completed_at
  ) order by task.due_date nulls last, task.created_at desc), '[]'::jsonb) into v_result
  from public.tasks task where task.assigned_employee_id = v_employee;
  return v_result;
end;
$$;

create or replace function public.complete_my_task(p_task_id uuid, p_completion_note text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_employee uuid := public.current_staff_employee_id();
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  update public.tasks set status = 'done', completed_at = now(),
    completion_note = nullif(left(btrim(p_completion_note), 1000), '')
  where id = p_task_id and assigned_employee_id = v_employee
    and coalesce(status,'pending') in ('pending','in_progress','waiting');
  return found;
end;
$$;

create or replace function public.finalize_staff_account(
  p_employee_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_request_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles;
  v_employee public.employee_contacts;
  v_request public.staff_account_requests;
  v_link uuid;
begin
  select * into v_actor from public.profiles where id = auth.uid() and is_active = true;
  select * into v_employee from public.employee_contacts where id = p_employee_id and is_active = true for update;
  if v_actor.id is null or v_employee.id is null or not public.can_manage_staff_employee(p_employee_id) then
    raise exception 'Staff account authorization denied';
  end if;
  if lower(btrim(p_email)) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email';
  end if;
  if v_actor.role = 'manager' then
    if p_request_id is null then raise exception 'Owner approval required'; end if;
    select * into v_request from public.staff_account_requests
      where id = p_request_id and employee_contact_id = p_employee_id
        and store_id = v_employee.store_id and status = 'approved' for update;
    if v_request.id is null or v_request.requested_email <> lower(btrim(p_email)) then
      raise exception 'Owner approval required';
    end if;
  elsif v_actor.role <> 'owner' then
    raise exception 'Staff account authorization denied';
  end if;
  if exists(select 1 from public.employee_auth_links where employee_contact_id = p_employee_id or auth_user_id = p_auth_user_id) then
    raise exception 'Employee or Auth user is already linked';
  end if;
  update public.profiles set role = 'staff', full_name = v_employee.staff_name,
    email = lower(btrim(p_email)), is_active = true, updated_at = now()
  where id = p_auth_user_id;
  if not found then raise exception 'Auth profile was not created'; end if;
  insert into public.employee_auth_links(
    employee_contact_id, auth_user_id, store_id, login_email, approved_by,
    activated_by, activated_at, status, must_change_password
  ) values (
    v_employee.id, p_auth_user_id, v_employee.store_id, lower(btrim(p_email)),
    case when v_actor.role = 'owner' then v_actor.id else v_request.decision_by end,
    v_actor.id, now(), 'active', true
  ) returning id into v_link;
  if p_request_id is not null then
    update public.staff_account_requests set status = 'account_created', updated_at = now()
      where id = p_request_id;
  end if;
  insert into public.staff_security_events(
    employee_contact_id, auth_user_id, store_id, actor_id, actor_role, event_type, safe_metadata
  ) values (
    v_employee.id, p_auth_user_id, v_employee.store_id, v_actor.id, v_actor.role,
    'account_created', jsonb_build_object('request_id', p_request_id, 'email', lower(btrim(p_email)))
  );
  return v_link;
end;
$$;

create or replace function public.record_staff_password_issued(
  p_employee_id uuid,
  p_event_type text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_link public.employee_auth_links; v_actor public.profiles;
begin
  if p_event_type not in ('temporary_password_issued','temporary_password_reset') then
    raise exception 'Invalid credential event';
  end if;
  select * into v_actor from public.profiles where id = auth.uid() and is_active = true;
  select * into v_link from public.employee_auth_links where employee_contact_id = p_employee_id for update;
  if v_link.id is null or v_actor.id is null or not public.can_manage_staff_employee(p_employee_id) then
    raise exception 'Credential action denied';
  end if;
  update public.employee_auth_links set must_change_password = true, updated_at = now()
    where id = v_link.id;
  insert into public.staff_security_events(
    employee_contact_id, auth_user_id, store_id, actor_id, actor_role, event_type
  ) values (p_employee_id, v_link.auth_user_id, v_link.store_id, v_actor.id, v_actor.role, p_event_type);
  return true;
end;
$$;

create or replace function public.finish_own_staff_password_change()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_employee uuid := public.current_staff_employee_id(); v_link public.employee_auth_links;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  select * into v_link from public.employee_auth_links where auth_user_id = auth.uid() for update;
  update public.employee_auth_links set must_change_password = false,
    last_password_changed_at = now(), updated_at = now() where id = v_link.id;
  insert into public.staff_security_events(
    employee_contact_id, auth_user_id, store_id, actor_id, actor_role, event_type
  ) values (v_employee, auth.uid(), v_link.store_id, auth.uid(), 'staff', 'password_changed');
  return true;
end;
$$;

drop policy if exists staff_account_requests_owner_all on public.staff_account_requests;
create policy staff_account_requests_owner_all on public.staff_account_requests for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists staff_account_requests_manager_select on public.staff_account_requests;
create policy staff_account_requests_manager_select on public.staff_account_requests for select to authenticated
  using (requested_by = auth.uid() and public.can_manage_staff_employee(employee_contact_id));
drop policy if exists staff_account_requests_manager_insert on public.staff_account_requests;
create policy staff_account_requests_manager_insert on public.staff_account_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending'
    and store_id = (select employee.store_id from public.employee_contacts employee where employee.id = employee_contact_id)
    and public.can_manage_staff_employee(employee_contact_id));

drop policy if exists employee_auth_links_owner_select on public.employee_auth_links;
create policy employee_auth_links_owner_select on public.employee_auth_links for select to authenticated
  using (public.is_owner());
drop policy if exists employee_auth_links_manager_select on public.employee_auth_links;
create policy employee_auth_links_manager_select on public.employee_auth_links for select to authenticated
  using (public.can_manage_staff_employee(employee_contact_id));
drop policy if exists employee_auth_links_staff_select_own on public.employee_auth_links;
create policy employee_auth_links_staff_select_own on public.employee_auth_links for select to authenticated
  using (auth_user_id = auth.uid() and employee_contact_id = public.current_staff_employee_id());

drop policy if exists staff_security_events_owner_select on public.staff_security_events;
create policy staff_security_events_owner_select on public.staff_security_events for select to authenticated
  using (public.is_owner());
drop policy if exists staff_security_events_manager_select on public.staff_security_events;
create policy staff_security_events_manager_select on public.staff_security_events for select to authenticated
  using (actor_id = auth.uid() and public.can_manage_staff_employee(employee_contact_id));

revoke all on public.staff_account_requests, public.employee_auth_links,
  public.staff_security_events, public.sensitive_access_grants,
  public.credential_action_limits from anon;
revoke insert, update, delete on public.employee_auth_links, public.staff_security_events,
  public.sensitive_access_grants, public.credential_action_limits from authenticated;

revoke all on function public.current_staff_employee_id() from public, anon;
revoke all on function public.is_active_staff() from public, anon;
revoke all on function public.can_manage_staff_employee(uuid) from public, anon;
revoke all on function public.consume_credential_action_limit(uuid) from public, anon;
revoke all on function public.validate_sensitive_access_grant(text,text) from public, anon;
revoke all on function public.staff_profile_summary() from public, anon;
revoke all on function public.staff_home_summary() from public, anon;
revoke all on function public.my_sales_summary(date,date) from public, anon;
revoke all on function public.my_salary_summary(text) from public, anon;
revoke all on function public.my_payslip_list(text) from public, anon;
revoke all on function public.my_tasks_list() from public, anon;
revoke all on function public.complete_my_task(uuid,text) from public, anon;
revoke all on function public.finalize_staff_account(uuid,uuid,text,uuid) from public, anon;
revoke all on function public.record_staff_password_issued(uuid,text) from public, anon;
revoke all on function public.finish_own_staff_password_change() from public, anon;

grant execute on function public.current_staff_employee_id() to authenticated, service_role;
grant execute on function public.is_active_staff() to authenticated, service_role;
grant execute on function public.can_manage_staff_employee(uuid) to authenticated, service_role;
grant execute on function public.consume_credential_action_limit(uuid) to authenticated, service_role;
grant execute on function public.validate_sensitive_access_grant(text,text) to authenticated, service_role;
grant execute on function public.staff_profile_summary() to authenticated;
grant execute on function public.staff_home_summary() to authenticated;
grant execute on function public.my_sales_summary(date,date) to authenticated;
grant execute on function public.my_salary_summary(text) to authenticated;
grant execute on function public.my_payslip_list(text) to authenticated;
grant execute on function public.my_tasks_list() to authenticated;
grant execute on function public.complete_my_task(uuid,text) to authenticated;
grant execute on function public.finalize_staff_account(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.record_staff_password_issued(uuid,text) to authenticated;
grant execute on function public.finish_own_staff_password_change() to authenticated;

comment on table public.employee_auth_links is 'Exact owner-approved one-to-one employee/Auth linkage. Contains no credential material.';
comment on table public.staff_security_events is 'Append-only staff account security events. Passwords and credential material are forbidden.';
comment on function public.current_staff_employee_id() is 'Resolves active staff identity from auth.uid() without accepting an employee identifier.';

commit;
