-- Managers and cashiers who are also on the payroll see their own salary and
-- payslips (same password re-check as staff). One person, one login:
-- Sharukh's staff login "SHARUK" is folded into his manager login, which now
-- logs in with 9861404422 (owner, 2026-10-13).
begin;

create or replace function public.current_payroll_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select links.employee_contact_id
  from public.employee_auth_links links
  join public.profiles profiles on profiles.id = links.auth_user_id
  join public.employee_contacts employees on employees.id = links.employee_contact_id
  join public.stores stores on stores.id = links.store_id
  where links.auth_user_id = auth.uid()
    and profiles.role in ('staff', 'manager', 'cashier')
    and profiles.is_active = true
    and links.status = 'active'
    and employees.is_active = true
    and stores.is_active = true
    and employees.store_id = links.store_id;
$$;
revoke all on function public.current_payroll_employee_id() from public, anon;
grant execute on function public.current_payroll_employee_id() to authenticated, service_role;

do $patch$
declare def text; before text; fn text;
begin
  foreach fn in array array['public.my_salary_summary(text)', 'public.my_payslip_list(text)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    before := def;
    def := replace(def, 'public.current_staff_employee_id()', 'public.current_payroll_employee_id()');
    if def = before then raise exception '% changed: not patched', fn; end if;
    execute def;
  end loop;
end
$patch$;

-- Sharukh: move the salary link from the staff login to the manager login.
do $sharukh$
declare v_staff uuid; v_manager uuid; v_email text;
begin
  select id into v_staff from public.profiles where role = 'staff' and login_phone = '9861404422';
  select id, email into v_manager, v_email from public.profiles where role = 'manager' and lower(full_name) like 'sharukh%' and is_active;
  if v_staff is not null and v_manager is not null and not exists (select 1 from public.employee_auth_links where auth_user_id = v_manager) then
    update public.employee_auth_links set auth_user_id = v_manager, login_email = coalesce(lower(v_email), login_email), must_change_password = false, updated_at = now()
    where auth_user_id = v_staff;
    update public.profiles set is_active = false, login_phone = null, updated_at = now() where id = v_staff;
    update public.profiles set login_phone = '9861404422', phone_verified_at = null, pin_set_at = null, updated_at = now() where id = v_manager;
  end if;
end
$sharukh$;

-- Other managers and cashiers: link to their staff-list entry when exactly one
-- active, unlinked entry has their login mobile.
insert into public.employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by, activated_by, activated_at, status, must_change_password)
select e.id, p.id, e.store_id, coalesce(lower(p.email), p.login_phone || '@users.gpbm.in'),
  (select id from public.profiles where role = 'owner' and is_active order by created_at limit 1),
  (select id from public.profiles where role = 'owner' and is_active order by created_at limit 1),
  now(), 'active', false
from public.profiles p
join lateral (
  select e.* from public.employee_contacts e
  where e.is_active and e.store_id is not null
    and p.login_phone in (public.normalize_in_mobile(e.whatsapp_phone), public.normalize_in_mobile(e.phone), public.normalize_in_mobile(e.normalized_phone))
) e on true
where p.is_active and p.role in ('manager', 'cashier') and p.login_phone is not null
  and not exists (select 1 from public.employee_auth_links l where l.auth_user_id = p.id)
  and not exists (select 1 from public.employee_auth_links l where l.employee_contact_id = e.id)
  and (select count(*) from public.employee_contacts x where x.is_active and p.login_phone in (
    public.normalize_in_mobile(x.whatsapp_phone), public.normalize_in_mobile(x.phone), public.normalize_in_mobile(x.normalized_phone))) = 1;

commit;
