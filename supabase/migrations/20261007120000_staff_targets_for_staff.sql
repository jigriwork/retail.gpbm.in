-- Staff see the monthly target their manager / owner set (it was only on the
-- owner/manager incentives page). Targets are saved under the name as it is
-- on the sales bills, so a staff member's target is found by their matched
-- sales names (and their staff-list name).
begin;

-- Names a staff member goes by in a store (upper case), for matching targets.
create function public.staff_target_names(p_employee uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select upper(btrim(e.staff_name)) from public.employee_contacts e where e.id = p_employee
  union
  select upper(btrim(n)) from public.staff_name_aliases a
  cross join lateral (values (a.canonical_staff_name), (regexp_replace(btrim(a.canonical_staff_name), '\s+[sS]$', '')), (a.source_name)) v(n)
  where a.employee_contact_id = p_employee and a.is_active and a.verification_status = 'verified' and n is not null
$$;
revoke all on function public.staff_target_names(uuid) from public, anon, authenticated;

create function public.my_target() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_employee uuid := public.current_staff_employee_id();
  v_store uuid;
  v_month date := date_trunc('month', public.india_today())::date;
  v_row record;
  v_sales jsonb;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  select store_id into v_store from public.employee_contacts where id = v_employee;
  select t.target, t.set_at, p.full_name as set_by into v_row
  from public.staff_targets t left join public.profiles p on p.id = t.set_by
  where t.store_id = v_store and t.month = v_month and upper(btrim(t.staff_name)) in (select public.staff_target_names(v_employee))
  order by t.set_at desc limit 1;
  if v_row.target is null then return jsonb_build_object('month', v_month, 'target', null); end if;
  v_sales := public.my_sales_summary(v_month, public.india_today());
  return jsonb_build_object(
    'month', v_month, 'target', v_row.target, 'set_by', v_row.set_by,
    'sale', coalesce((v_sales->'summary'->>'value')::numeric, 0),
    'days_left', ((v_month + interval '1 month')::date - public.india_today()));
end $$;
revoke all on function public.my_target() from public, anon;
grant execute on function public.my_target() to authenticated;

-- The staff login a target (sales name) belongs to, to notify them. Service role only.
create function public.staff_login_for_sales_name(p_store uuid, p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.auth_user_id from public.employee_contacts e
  join public.employee_auth_links l on l.employee_contact_id = e.id and l.status = 'active'
  where e.store_id = p_store and upper(btrim(p_name)) in (select public.staff_target_names(e.id))
  limit 1
$$;
revoke all on function public.staff_login_for_sales_name(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_login_for_sales_name(uuid, text) to service_role;

commit;
