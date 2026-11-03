-- Keep payroll spellings from creating a second employee and make contact
-- consolidation explicit, audited and reversible.
begin;

create or replace function public.merge_employee_contacts(
  p_duplicate uuid,
  p_canonical uuid,
  p_use_duplicate_name boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duplicate public.employee_contacts;
  v_canonical public.employee_contacts;
  v_phone text;
  v_whatsapp text;
  v_rows integer;
  v_generated integer;
begin
  if not public.is_owner() then raise exception 'Only the owner can merge staff records.'; end if;
  if p_duplicate is null or p_canonical is null or p_duplicate = p_canonical then
    raise exception 'Choose two different staff records.';
  end if;

  select * into v_duplicate from public.employee_contacts where id = p_duplicate for update;
  select * into v_canonical from public.employee_contacts where id = p_canonical for update;
  if v_duplicate.id is null or v_canonical.id is null then raise exception 'Staff record unavailable.'; end if;
  if v_duplicate.store_id is distinct from v_canonical.store_id then raise exception 'Staff records must belong to the same store.'; end if;

  -- These relationships can carry account/security meaning. Refuse an
  -- automatic merge instead of guessing when the duplicate has any of them.
  if exists(select 1 from public.employee_auth_links where employee_contact_id = p_duplicate)
    or exists(select 1 from public.staff_account_requests where employee_contact_id = p_duplicate)
    or exists(select 1 from public.staff_security_events where employee_contact_id = p_duplicate)
    or exists(select 1 from public.staff_requests where employee_contact_id = p_duplicate)
    or exists(select 1 from public.tasks where assigned_employee_id = p_duplicate)
    or exists(select 1 from public.payslip_link_requests where employee_contact_id = p_duplicate)
    or exists(select 1 from public.staff_name_aliases where employee_contact_id = p_duplicate)
    or exists(select 1 from public.cash_book_entries where employee_id = p_duplicate)
  then
    raise exception 'Duplicate has account or operating history; review it manually.';
  end if;

  v_phone := coalesce(v_canonical.normalized_phone, v_duplicate.normalized_phone);
  v_whatsapp := coalesce(v_canonical.whatsapp_phone, v_duplicate.whatsapp_phone, v_phone);

  -- Release the unique store/name key but retain the duplicate row as a
  -- rollback record. It stays out of the active directory.
  update public.employee_contacts
  set is_active = false,
      normalized_staff_name = 'merged ' || p_duplicate::text,
      notes = left(trim(both ' ' from coalesce(notes, '') || ' Merged into ' || p_canonical::text || ' on ' || public.india_today()::text || '.'), 1000)
  where id = p_duplicate;

  update public.employee_contacts
  set staff_name = case when p_use_duplicate_name then v_duplicate.staff_name else staff_name end,
      normalized_staff_name = case when p_use_duplicate_name then v_duplicate.normalized_staff_name else normalized_staff_name end,
      phone = coalesce(v_canonical.phone, v_duplicate.phone),
      normalized_phone = v_phone,
      whatsapp_phone = v_whatsapp,
      is_active = true,
      left_on = null,
      removed_by = null
  where id = p_canonical;

  update public.payslip_rows
  set employee_contact_id = p_canonical,
      employee_phone = v_phone,
      whatsapp_phone = v_whatsapp
  where employee_contact_id = p_duplicate;
  get diagnostics v_rows = row_count;

  update public.generated_payslips
  set employee_contact_id = p_canonical,
      employee_phone = v_phone,
      whatsapp_phone = v_whatsapp
  where employee_contact_id = p_duplicate;
  get diagnostics v_generated = row_count;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), 'owner', 'employee_contacts_merged', 'employee_contact', p_canonical, v_canonical.store_id,
    jsonb_build_object(
      'duplicate_id', p_duplicate,
      'duplicate_name', v_duplicate.staff_name,
      'canonical_previous_name', v_canonical.staff_name,
      'canonical_name', case when p_use_duplicate_name then v_duplicate.staff_name else v_canonical.staff_name end,
      'payslip_rows_moved', v_rows,
      'generated_payslips_moved', v_generated
    ));

  return jsonb_build_object('ok', true, 'canonical_id', p_canonical, 'duplicate_id', p_duplicate,
    'payslip_rows_moved', v_rows, 'generated_payslips_moved', v_generated);
end
$$;

revoke all on function public.merge_employee_contacts(uuid, uuid, boolean) from public, anon;
grant execute on function public.merge_employee_contacts(uuid, uuid, boolean) to authenticated;

-- The importer used to create a contact for every non-empty name, including
-- footer notes and changed spellings. Require a valid payroll row and an
-- already-approved active directory entry instead.
do $patch$
declare
  v_definition text := pg_get_functiondef('public.commit_payroll_import(uuid,boolean,text)'::regprocedure);
  v_old text := $old$if nullif(key,'') is not null then
     insert into public.employee_contacts(store_id,staff_name,normalized_staff_name,phone,normalized_phone,whatsapp_phone,is_active,created_by)
     values(s.id,r.staff_name,key,r.employee_phone,r.employee_phone,r.whatsapp_phone,true,auth.uid()) on conflict(store_id,normalized_staff_name) do nothing;
     select * into contact from public.employee_contacts where store_id=s.id and normalized_staff_name=key for update;
     if contact.normalized_phone is null and r.employee_phone is not null then
      update public.employee_contacts set phone=r.employee_phone,normalized_phone=r.employee_phone,whatsapp_phone=r.whatsapp_phone where id=contact.id;
     end if;
     if r.employee_phone is null and contact.is_active=true then r.employee_phone:=contact.normalized_phone;r.whatsapp_phone:=coalesce(contact.whatsapp_phone,contact.normalized_phone); end if;
     if r.employee_phone is not null and contact.normalized_phone is not null and r.employee_phone<>contact.normalized_phone then r.warning_message:=concat_ws(' ',r.warning_message,'Phone differs from saved employee contact.'); end if;
    end if;$old$;
  v_new text := $new$contact := null;
    if nullif(key,'') is not null and r.status in ('ready','total_mismatch','generated') then
     select * into contact from public.employee_contacts where store_id=s.id and normalized_staff_name=key and is_active for update;
     if contact.id is null then raise exception 'Payroll staff is not linked in the active directory: %', r.staff_name; end if;
     if contact.normalized_phone is null and r.employee_phone is not null then
      update public.employee_contacts set phone=r.employee_phone,normalized_phone=r.employee_phone,whatsapp_phone=r.whatsapp_phone where id=contact.id;
      contact.normalized_phone:=r.employee_phone; contact.whatsapp_phone:=r.whatsapp_phone;
     end if;
     if r.employee_phone is null then r.employee_phone:=contact.normalized_phone;r.whatsapp_phone:=coalesce(contact.whatsapp_phone,contact.normalized_phone); end if;
     if r.employee_phone is not null and contact.normalized_phone is not null and r.employee_phone<>contact.normalized_phone then r.warning_message:=concat_ws(' ',r.warning_message,'Phone differs from saved employee contact.'); end if;
    end if;$new$;
begin
  if position(v_old in v_definition) = 0 then raise exception 'Payroll commit function changed; identity guard was not applied.'; end if;
  execute replace(v_definition, v_old, v_new);
end
$patch$;

commit;
