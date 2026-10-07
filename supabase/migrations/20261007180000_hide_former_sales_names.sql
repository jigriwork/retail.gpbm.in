-- "Match staff names" stopped showing staff who left: names marked as former
-- staff (rejected) and names with no sale for 90 days are no longer listed or
-- auto-matched. "Left / not staff" marks a name as former (owner, manager or
-- cashier of the store). Their old sales stay in past reports.
begin;

do $$
declare fn text; def text;
begin
  foreach fn in array array['public.staff_match_overview(uuid)', 'public.staff_match_overview_system(uuid)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    def := replace(def, '), pending as (',
      '), former as (
    select a.normalized_source_name as norm from public.staff_name_aliases a
    where a.store_id = p_store and a.source_type = ''sales_report'' and a.verification_status = ''rejected''
  ), pending as (');
    def := replace(def, 'where not exists (select 1 from linked l where l.norm = s.norm)',
      'where not exists (select 1 from linked l where l.norm = s.norm)
      and not exists (select 1 from former f where f.norm = s.norm)
      and s.last_sale > public.india_today() - 90');
    if position('former as (' in def) = 0 or position('public.india_today() - 90' in def) = 0 then
      raise exception 'staff_match_overview changed: % not patched', fn;
    end if;
    execute def;
  end loop;
end $$;

create function public.mark_sales_name_left(p_store uuid, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_norm text := lower(regexp_replace(btrim(coalesce(p_source, '')), '\s+', ' ', 'g'));
begin
  if not coalesce(public.can_work_store(p_store), false) then raise exception 'Store access denied.'; end if;
  if v_norm = '' then raise exception 'Choose the name from the sales bills.'; end if;
  insert into public.staff_name_aliases(store_id, canonical_staff_name, normalized_canonical_staff_name, source_name, normalized_source_name,
    source_type, is_active, employee_contact_id, verification_status, verified_by, verified_at, verification_note)
  values (p_store, 'Former staff', 'former staff', upper(regexp_replace(btrim(p_source), '\s+', ' ', 'g')), v_norm,
    'sales_report', false, null, 'rejected', auth.uid(), now(), 'Marked as left / not staff.')
  on conflict (store_id, normalized_source_name, source_type) do update set
    is_active = false, employee_contact_id = null, verification_status = 'rejected', verified_by = auth.uid(), verified_at = now(),
    verification_note = 'Marked as left / not staff.', updated_at = now();
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'sales_name_marked_left', 'staff_name_alias', null, p_store,
    jsonb_build_object('sales_name', upper(btrim(p_source))));
end $$;
revoke all on function public.mark_sales_name_left(uuid, text) from public, anon;
grant execute on function public.mark_sales_name_left(uuid, text) to authenticated;

commit;
