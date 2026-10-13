-- Everyone logs in with their mobile number: a WhatsApp code the first time
-- (or after "Forgot PIN"), then their own 6-digit PIN. Staff in the staff
-- list get their login created on their first code, with no approval step.
begin;

alter table public.profiles
  add column login_phone text check (login_phone is null or login_phone ~ '^[6-9][0-9]{9}$'),
  add column phone_verified_at timestamptz,
  add column pin_set_at timestamptz;
create unique index profiles_login_phone_key on public.profiles (login_phone) where login_phone is not null;

-- Existing users: the profile's phone, else the staff list phone of a linked staff login.
with resolved as (
  select p.id,
    coalesce(
      public.normalize_in_mobile(p.phone),
      public.normalize_in_mobile(e.whatsapp_phone),
      public.normalize_in_mobile(e.phone),
      public.normalize_in_mobile(e.normalized_phone)
    ) as phone
  from public.profiles p
  left join public.employee_auth_links l on l.auth_user_id = p.id
  left join public.employee_contacts e on e.id = l.employee_contact_id
  where p.is_active
), unique_phone as (
  select id, phone from resolved r
  where phone is not null and (select count(*) from resolved x where x.phone = r.phone) = 1
)
update public.profiles p set login_phone = u.phone from unique_phone u where u.id = p.id;

-- The owners' numbers (given by the owner on 2026-10-13).
update public.profiles set login_phone = '7809790000' where role = 'owner' and lower(email) like 'adib%' and login_phone is null;
update public.profiles set login_phone = '9437067422' where role = 'owner' and lower(full_name) like 'idris%' and login_phone is null;

create table public.login_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_phone on public.login_codes (phone, created_at desc);

create table public.login_events (
  id bigint generated always as identity primary key,
  phone text not null,
  kind text not null check (kind in ('code_sent', 'code_failed', 'code_ok', 'pin_failed', 'pin_ok')),
  created_at timestamptz not null default now()
);
create index login_events_phone on public.login_events (phone, kind, created_at desc);

-- Only server code (service role) touches these.
alter table public.login_codes enable row level security;
alter table public.login_events enable row level security;
revoke all on public.login_codes, public.login_events from anon, authenticated;

-- First code from a staff member without a login: link the new auth user to
-- their staff-list entry (same result as an owner-created staff account).
create function public.link_staff_login_by_phone(p_employee uuid, p_auth_user uuid, p_email text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_employee public.employee_contacts;
  v_owner uuid;
begin
  select * into v_employee from public.employee_contacts where id = p_employee and is_active for update;
  if v_employee.id is null or v_employee.store_id is null then raise exception 'Staff member is not active.'; end if;
  if exists (select 1 from public.employee_auth_links where employee_contact_id = p_employee or auth_user_id = p_auth_user) then
    raise exception 'Staff member already has a login.';
  end if;
  select id into v_owner from public.profiles where role = 'owner' and is_active order by created_at limit 1;
  update public.profiles set role = 'staff', full_name = v_employee.staff_name, email = lower(p_email), is_active = true,
    login_phone = p_phone, phone_verified_at = now(), updated_at = now()
  where id = p_auth_user;
  if not found then raise exception 'Login profile was not created.'; end if;
  insert into public.employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by, activated_by, activated_at, status, must_change_password)
  values (v_employee.id, p_auth_user, v_employee.store_id, lower(p_email), v_owner, v_owner, now(), 'active', true);
  insert into public.staff_security_events(employee_contact_id, auth_user_id, store_id, actor_id, actor_role, event_type, safe_metadata)
  values (v_employee.id, p_auth_user, v_employee.store_id, null, null, 'account_created', jsonb_build_object('source', 'whatsapp_code'));
end $$;

revoke all on function public.link_staff_login_by_phone(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.link_staff_login_by_phone(uuid, uuid, text, text) to service_role;

commit;
