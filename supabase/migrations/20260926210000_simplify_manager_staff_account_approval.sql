-- Allow a manager to issue the temporary password at request time without
-- storing credential material. The pending Auth identity remains banned and
-- its profile inactive until an owner approves the request.

begin;

alter table public.staff_account_requests
  add column if not exists pending_auth_user_id uuid references public.profiles(id) on delete set null;

-- Rejected pending Auth users must be removable while retaining the audit row.
alter table public.staff_security_events
  drop constraint if exists staff_security_events_auth_user_id_fkey;
alter table public.staff_security_events
  add constraint staff_security_events_auth_user_id_fkey
  foreign key (auth_user_id) references public.profiles(id) on delete set null;

create unique index if not exists staff_account_requests_pending_auth_user_key
  on public.staff_account_requests(pending_auth_user_id)
  where pending_auth_user_id is not null and status in ('pending', 'approved');

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
  v_auth_profile public.profiles;
  v_link uuid;
begin
  select * into v_actor from public.profiles where id = auth.uid() and is_active = true;
  select * into v_employee from public.employee_contacts where id = p_employee_id and is_active = true for update;
  select * into v_auth_profile from public.profiles where id = p_auth_user_id for update;
  if v_actor.id is null or v_employee.id is null or not public.can_manage_staff_employee(p_employee_id) then
    raise exception 'Staff account authorization denied';
  end if;
  if lower(btrim(p_email)) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email';
  end if;
  if v_auth_profile.id is null or lower(v_auth_profile.email) <> lower(btrim(p_email)) then
    raise exception 'Auth identity does not match the approved email';
  end if;
  if p_request_id is not null then
    select * into v_request from public.staff_account_requests
      where id = p_request_id
        and employee_contact_id = p_employee_id
        and store_id = v_employee.store_id
        and requested_email = lower(btrim(p_email))
        and status in ('pending', 'approved')
      for update;
    if v_request.id is null then raise exception 'Valid owner approval request required'; end if;
    if v_request.pending_auth_user_id is not null and v_request.pending_auth_user_id <> p_auth_user_id then
      raise exception 'Pending Auth identity mismatch';
    end if;
  end if;
  if v_actor.role = 'manager' then
    if v_request.id is null or v_request.status <> 'approved' then
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
    update public.staff_account_requests
      set status = 'account_created', decision_by = coalesce(decision_by, v_actor.id),
        decision_at = coalesce(decision_at, now()), updated_at = now()
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

revoke all on function public.finalize_staff_account(uuid,uuid,text,uuid) from public, anon;
grant execute on function public.finalize_staff_account(uuid,uuid,text,uuid) to authenticated;

comment on column public.staff_account_requests.pending_auth_user_id
  is 'Banned pending Auth identity; never contains password or credential material.';

commit;
