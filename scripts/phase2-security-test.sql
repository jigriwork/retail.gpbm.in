-- Run only against an isolated restored database. Every synthetic row is rolled back.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_phase2(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'Phase 2 assertion failed: %', message; end if;
end;
$$;

select id as owner_id from public.profiles where role = 'owner' and is_active limit 1 \gset
select id as store_a from public.stores where is_active order by code limit 1 \gset
select id as store_b from public.stores where is_active and id <> :'store_a' order by code limit 1 \gset
select p.id as manager_a
from public.profiles p join public.store_users su on su.user_id = p.id
where p.role = 'manager' and p.is_active and su.store_id = :'store_a'
  and not exists(select 1 from public.store_users other where other.user_id = p.id and other.store_id = :'store_b')
limit 1 \gset

select gen_random_uuid() as staff_a, gen_random_uuid() as staff_b,
  gen_random_uuid() as employee_a, gen_random_uuid() as employee_b,
  gen_random_uuid() as salary_a, gen_random_uuid() as salary_b,
  gen_random_uuid() as task_a, gen_random_uuid() as task_b \gset

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  (:'staff_a', 'authenticated', 'authenticated', 'phase2-a@example.test', now(), now(), now()),
  (:'staff_b', 'authenticated', 'authenticated', 'phase2-b@example.test', now(), now(), now());

update public.profiles set role = 'staff', is_active = true where id in (:'staff_a', :'staff_b');
insert into public.employee_contacts(id, store_id, staff_name, normalized_staff_name, is_active, created_by)
values
  (:'employee_a', :'store_a', 'Phase Two A', 'phase two a', true, :'owner_id'),
  (:'employee_b', :'store_b', 'Phase Two B', 'phase two b', true, :'owner_id');
insert into public.employee_auth_links(employee_contact_id, auth_user_id, store_id, login_email, approved_by, activated_by, activated_at)
values
  (:'employee_a', :'staff_a', :'store_a', 'phase2-a@example.test', :'owner_id', :'owner_id', now()),
  (:'employee_b', :'staff_b', :'store_b', 'phase2-b@example.test', :'owner_id', :'owner_id', now());
insert into public.payslip_rows(id, store_id, firm_name, store_name, salary_month, staff_name, net_payable, employee_contact_id)
values
  (:'salary_a', :'store_a', 'Test', 'Test A', date '2026-09-01', 'Phase Two A', 111, :'employee_a'),
  (:'salary_b', :'store_b', 'Test', 'Test B', date '2026-09-01', 'Phase Two B', 999, :'employee_b');
insert into public.sensitive_access_grants(auth_user_id, purpose, token_hash, expires_at)
values(:'staff_a', 'salary', encode(extensions.digest('phase2-grant', 'sha256'), 'hex'), now() + interval '10 minutes');
insert into public.tasks(id, store_id, created_by, assigned_employee_id, title, status)
values
  (:'task_a', :'store_a', :'owner_id', :'employee_a', 'Phase Two Task A', 'pending'),
  (:'task_b', :'store_b', :'owner_id', :'employee_b', 'Phase Two Task B', 'pending');

-- Public/anonymous callers have no execute privilege on private RPCs.
select pg_temp.assert_phase2(not has_function_privilege('anon', 'public.my_salary_summary(text)', 'EXECUTE'), 'anon salary execute');
select pg_temp.assert_phase2(not has_function_privilege('anon', 'public.my_sales_summary(date,date)', 'EXECUTE'), 'anon sales execute');
select pg_temp.assert_phase2(not has_function_privilege('anon', 'public.complete_my_task(uuid,text)', 'EXECUTE'), 'anon task execute');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'manager_a', 'role', 'authenticated')::text, true);
select pg_temp.assert_phase2(public.can_manage_staff_employee(:'employee_a'), 'assigned manager denied');
select pg_temp.assert_phase2(not public.can_manage_staff_employee(:'employee_b'), 'cross-store manager allowed');

select set_config('request.jwt.claims', json_build_object('sub', :'staff_a', 'role', 'authenticated')::text, true);
select pg_temp.assert_phase2(public.current_staff_employee_id() = :'employee_a'::uuid, 'staff identity mismatch');
select pg_temp.assert_phase2((public.my_sales_summary(date '2026-09-01', date '2026-09-30')->>'linkage_verified')::boolean = false, 'unverified sales linkage was guessed');
-- Staff has no direct payroll-table visibility.
select pg_temp.assert_phase2((select count(*) from public.payslip_rows) = 0, 'staff direct payroll visibility');
-- The private RPC returns only Staff A's explicitly linked amount, never Staff B's.
select pg_temp.assert_phase2((public.my_salary_summary('phase2-grant') #>> '{periods,0,net_payable}')::numeric = 111, 'wrong salary returned');
select pg_temp.assert_phase2(jsonb_array_length(public.my_salary_summary('phase2-grant')->'periods') = 1, 'cross-employee salary leaked');
select pg_temp.assert_phase2(not public.complete_my_task(:'task_b', 'IDOR attempt'), 'staff completed another employee task');
select pg_temp.assert_phase2(public.complete_my_task(:'task_a', 'Completed safely'), 'staff could not complete own task');

reset role;
update public.employee_auth_links set status = 'inactive' where auth_user_id = :'staff_a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_a', 'role', 'authenticated')::text, true);
select pg_temp.assert_phase2(public.current_staff_employee_id() is null, 'inactive staff retained access');

rollback;
