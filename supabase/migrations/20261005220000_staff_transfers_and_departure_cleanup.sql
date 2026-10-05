-- Confirmed staff transfers and departures (5 Oct 2026).
-- Historical salary and sales rows remain intact; departed staff and their
-- bill-name aliases are hidden from active lists and matching queues.
begin;

create or replace function public.restore_staff(p_employee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_emp public.employee_contacts;
begin
  select * into v_emp from public.employee_contacts where id = p_employee for update;
  if v_emp.id is null then raise exception 'Staff member not found.'; end if;
  if not coalesce(public.can_access_store(v_emp.store_id), false) then
    raise exception 'Only the owner or the store manager can restore staff.';
  end if;
  update public.employee_contacts set
    is_active = true,
    left_on = null,
    removed_by = null,
    notes = nullif(btrim(regexp_replace(coalesce(notes, ''), '\s*Left:.*$', '', 'i')), '')
  where id = p_employee;
  update public.staff_name_aliases set
    is_active = true,
    verification_status = 'verified',
    verified_by = auth.uid(),
    verified_at = now(),
    verification_note = 'Staff restored.'
  where employee_contact_id = p_employee;
  update public.employee_auth_links set
    status = 'active',
    store_id = v_emp.store_id,
    activated_by = auth.uid(),
    activated_at = now(),
    deactivated_by = null,
    deactivated_at = null,
    deactivation_reason = null
  where employee_contact_id = p_employee;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'staff_restored', 'employee_contact', p_employee, v_emp.store_id,
    jsonb_build_object('staff_name', v_emp.staff_name));
end $$;
revoke all on function public.restore_staff(uuid) from public, anon;
grant execute on function public.restore_staff(uuid) to authenticated;

-- Removing a staff member also retires their known bill-name aliases. The raw
-- sales and salary rows remain unchanged for reports, audits and old payslips.
create or replace function public.remove_staff(p_employee uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_emp public.employee_contacts; v_history boolean;
begin
  select * into v_emp from public.employee_contacts where id = p_employee for update;
  if v_emp.id is null then raise exception 'Staff member not found.'; end if;
  if not coalesce(public.can_access_store(v_emp.store_id), false) then raise exception 'Only the owner or the store manager can remove staff.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Write why (for example: left on 30 Sep).'; end if;
  v_history := exists (select 1 from public.staff_name_aliases where employee_contact_id = p_employee)
    or exists (select 1 from public.payslip_rows where employee_contact_id = p_employee
               or (store_id = v_emp.store_id and public.payslip_name_key(staff_name) = v_emp.normalized_staff_name));
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'staff_removed', 'employee_contact', p_employee, v_emp.store_id,
    jsonb_build_object('staff_name', v_emp.staff_name, 'reason', btrim(p_reason)));
  update public.employee_auth_links set status = 'inactive', deactivated_by = auth.uid(), deactivated_at = now(),
    deactivation_reason = left('Left: ' || btrim(p_reason), 200)
  where employee_contact_id = p_employee and status = 'active';
  update public.staff_name_aliases set is_active = false, verification_status = 'rejected', verified_by = auth.uid(), verified_at = now(),
    verification_note = left('Staff removed: ' || btrim(p_reason), 500)
  where employee_contact_id = p_employee;
  if not v_history then
    begin
      delete from public.employee_contacts where id = p_employee;
      return 'deleted';
    exception when foreign_key_violation then
      null;
    end;
  end if;
  update public.employee_contacts set is_active = false, left_on = public.india_today(), removed_by = auth.uid(),
    notes = left(trim(both ' ' from coalesce(notes, '') || ' Left: ' || btrim(p_reason)), 1000)
  where id = p_employee;
  return 'removed';
end $$;

-- A rejected sales alias means the owner deliberately retired that historical
-- staff name. Keep it out of the matching queue without deleting sales rows.
do $patch$
declare
  f text;
  def text;
  needle text := 'where not exists (select 1 from linked l where l.norm = s.norm)';
  replacement text := 'where not exists (select 1 from linked l where l.norm = s.norm)
      and not exists (select 1 from public.staff_name_aliases ignored
        where ignored.store_id = p_store and ignored.source_type = ''sales_report''
          and ignored.normalized_source_name = s.norm and ignored.verification_status = ''rejected'')';
begin
  foreach f in array array['public.staff_match_overview(uuid)', 'public.staff_match_overview_system(uuid)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('ignored.verification_status = ''rejected''' in def) = 0 then
      if position(needle in def) = 0 then raise exception 'Staff matching function changed: %', f; end if;
      execute replace(def, needle, replacement);
    end if;
  end loop;
end
$patch$;

do $data$
declare
  v_gp uuid;
  v_bm uuid;
  v_owner uuid;
  v_g_nayak uuid;
  v_ganesh_bm uuid;
  v_sohel uuid;
  v_raja_bm uuid;
  v_kasim uuid;
begin
  select id into strict v_gp from public.stores where code = 'GP';
  select id into strict v_bm from public.stores where code = 'BM';
  select id into strict v_owner from public.profiles where role = 'owner' and is_active order by created_at limit 1;

  -- Existing GP Ganesh is the person now called G Nayak at Brand Mark.
  select id into strict v_g_nayak from public.employee_contacts where store_id = v_gp and normalized_staff_name = 'ganesh';
  update public.employee_contacts set store_id = v_bm, staff_name = 'G Nayak', normalized_staff_name = 'g nayak', is_active = true,
    left_on = null, removed_by = null, notes = 'Transferred from Go Planet to Brand Mark.'
  where id = v_g_nayak;
  perform public.link_staff_name(v_bm, 'G NAYAK', v_g_nayak);

  -- BM's Ganesh is a different employee.
  insert into public.employee_contacts(store_id, staff_name, normalized_staff_name, is_active, notes, created_by)
  values (v_bm, 'Ganesh', 'ganesh', true, 'Separate Brand Mark employee confirmed 5 Oct 2026.', v_owner)
  on conflict (store_id, normalized_staff_name) do update set is_active = true, left_on = null, removed_by = null
  returning id into v_ganesh_bm;
  perform public.link_staff_name(v_bm, 'GANESH', v_ganesh_bm);
  perform public.link_staff_name(v_bm, 'GANESH S', v_ganesh_bm);

  -- Sohel is now at BM; keep his old GP sales linked to the same person.
  select id into strict v_sohel from public.employee_contacts where store_id = v_bm and normalized_staff_name = 'sohel';
  perform public.link_staff_name(v_gp, 'SOHEL', v_sohel);
  perform public.link_staff_name(v_gp, 'SOHEL S', v_sohel);

  -- Current Raja is a new BM employee. The old GP Raja remains historical.
  insert into public.employee_contacts(store_id, staff_name, normalized_staff_name, is_active, notes, created_by)
  values (v_bm, 'Raja', 'raja', true, 'New Brand Mark staff confirmed 5 Oct 2026.', v_owner)
  on conflict (store_id, normalized_staff_name) do update set is_active = true, left_on = null, removed_by = null
  returning id into v_raja_bm;
  perform public.link_staff_name(v_bm, 'RAJA', v_raja_bm);
  perform public.link_staff_name(v_bm, 'RAJA S', v_raja_bm);

  -- SK Kasim was removed accidentally.
  select id into strict v_kasim from public.employee_contacts where store_id = v_gp and normalized_staff_name = 's k kasim';
  update public.employee_contacts set is_active = true, left_on = null, removed_by = null,
    notes = nullif(btrim(regexp_replace(coalesce(notes, ''), '\s*Left:.*$', '', 'i')), '')
  where id = v_kasim;
  update public.staff_name_aliases set is_active = true, verification_status = 'verified', verified_by = v_owner,
    verified_at = now(), verification_note = 'Restored after accidental removal.'
  where employee_contact_id = v_kasim;

  -- Retain history but remove confirmed former staff from all active lists.
  update public.employee_contacts set is_active = false, left_on = coalesce(left_on, public.india_today()), removed_by = coalesce(removed_by, v_owner),
    notes = case when coalesce(notes, '') ~* 'Left:' then notes else left(trim(both ' ' from coalesce(notes, '') || ' Left: confirmed former staff'), 1000) end
  where normalized_staff_name in ('narayan', 'shiba', 'duna', 'mahesh', 'kalim', 'bapi');

  -- Create/retire an alias for every spelling of those former staff names so
  -- they do not reappear merely because an old bill remains in the database.
  insert into public.staff_name_aliases(store_id, canonical_staff_name, normalized_canonical_staff_name, source_name, normalized_source_name,
    source_type, is_active, created_by, employee_contact_id, verification_status, verified_by, verified_at, verification_note)
  select distinct x.store_id, 'Former staff', 'former staff', upper(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')),
    lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')), 'sales_report', false, v_owner, null::uuid, 'rejected', v_owner, now(),
    'Former staff confirmed by owner on 5 Oct 2026.'
  from public.sales_rows x
  where lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')) ~ '^(narayan|shiba|duna|mahesh|kalim|bapi)( |$)'
  on conflict (store_id, normalized_source_name, source_type) do update set
    is_active = false, employee_contact_id = null, verification_status = 'rejected', verified_by = v_owner, verified_at = now(),
    verification_note = 'Former staff confirmed by owner on 5 Oct 2026.', updated_at = now();

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata) values
    (v_owner, 'owner', 'staff_transfer_confirmed', 'employee_contact', v_g_nayak, v_bm, jsonb_build_object('from', 'GP', 'to', 'BM', 'name', 'G Nayak')),
    (v_owner, 'owner', 'staff_restored', 'employee_contact', v_kasim, v_gp, jsonb_build_object('staff_name', 'S k Kasim', 'reason', 'accidental removal corrected'));
end
$data$;

commit;
