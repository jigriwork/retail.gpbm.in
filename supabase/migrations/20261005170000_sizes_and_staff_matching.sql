-- 1) Check sizes: scan a tag and see every size of that item in stock, in
--    each store the person may see (owner, manager, cashier, and staff for
--    their own store), so staff can answer customers on the floor.
-- 2) Staff name matching: names on sales bills are linked to the payslip
--    staff list (employee_contacts) so each staff login shows its own sales.
--    Certain matches (same name after removing case, spaces and the counter
--    suffixes " S" / "1") link automatically, also in the background; likely
--    matches (short/long form, spelling) and the rest are confirmed by a
--    person. The owner, managers and cashiers of the store may confirm.
begin;

-- ---------------------------------------------------------------- names
-- "PRAFUL SAHU S" -> "PRAFUL SAHU", "RAHIM1" -> "RAHIM".
create function public.staff_name_core(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(upper(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '\s*[0-9]+$', ''), '\s+S$', ''), '')
$$;

-- Spelling-tolerant key: vowels after a word's first letter and doubled
-- letters removed ("JASMIN BAGUM" = "JASMIN BEGUM" = "JSMN BGM").
create function public.staff_name_skeleton(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(coalesce(public.staff_name_core(p), ''), '(\S)[AEIOUY]+', '\1', 'g'), '(\w)\1+', '\1', 'g')
$$;

-- Owner, or the store's manager or cashier, may confirm a link; so may the
-- background job (no signed-in person, not an API session).
create or replace function public.enforce_owner_alias_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_owner()
     or coalesce(public.can_work_store(new.store_id), false)
     or (auth.uid() is null and session_user <> 'authenticator') then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.verification_status is not null or new.verified_by is not null or new.verified_at is not null or new.verification_note is not null))
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
        or new.is_active is distinct from old.is_active)))) then
    raise exception 'Only the owner or the store''s manager or cashier can confirm a staff name';
  end if;
  return new;
end $$;

-- Link one sales-bill name to a staff member (confirmed).
create function public.link_staff_name(p_store uuid, p_source text, p_employee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_emp public.employee_contacts; v_norm text := lower(regexp_replace(btrim(coalesce(p_source, '')), '\s+', ' ', 'g'));
begin
  if auth.uid() is not null and not coalesce(public.can_work_store(p_store), false) then raise exception 'Store access denied.'; end if;
  if v_norm = '' then raise exception 'Choose the name from the sales bills.'; end if;
  select * into v_emp from public.employee_contacts where id = p_employee and is_active is not false;
  if v_emp.id is null or (auth.uid() is not null and not coalesce(public.can_work_store(v_emp.store_id), false)) then
    raise exception 'Choose an active staff member.';
  end if;
  insert into public.staff_name_aliases(store_id, canonical_staff_name, normalized_canonical_staff_name, source_name, normalized_source_name,
    source_type, is_active, employee_contact_id, verification_status, verified_by, verified_at, verification_note)
  values (p_store, v_emp.staff_name, lower(v_emp.staff_name), upper(regexp_replace(btrim(p_source), '\s+', ' ', 'g')), v_norm,
    'sales_report', true, v_emp.id, 'verified', auth.uid(), now(), case when auth.uid() is null then 'Matched automatically (same name).' end)
  on conflict (store_id, normalized_source_name, source_type) do update set
    canonical_staff_name = excluded.canonical_staff_name, normalized_canonical_staff_name = excluded.normalized_canonical_staff_name,
    is_active = true, employee_contact_id = excluded.employee_contact_id, verification_status = 'verified',
    verified_by = excluded.verified_by, verified_at = now(), verification_note = excluded.verification_note, updated_at = now();
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'staff_name_linked', 'employee_contact', v_emp.id, p_store,
    jsonb_build_object('sales_name', upper(btrim(p_source)), 'staff_name', v_emp.staff_name, 'automatic', auth.uid() is null));
end $$;

-- Sales-bill names of the last year and their match state for one store.
create function public.staff_match_overview(p_store uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with sales as (
    select lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')) as norm, max(upper(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g'))) as name,
      count(*) as lines, max(x.sale_date) as last_sale
    from public.sales_rows x join public.reports r on r.id = x.report_id and r.is_current
    where x.store_id = p_store and x.sale_date > public.india_today() - 365 and nullif(btrim(x.staff_name), '') is not null
      and btrim(x.staff_name) !~* '^(nil|na|n/a|none|unspecified|-|0)$'
    group by 1
  ), linked as (
    select a.normalized_source_name as norm, e.staff_name as staff from public.staff_name_aliases a
    join public.employee_contacts e on e.id = a.employee_contact_id
    where a.store_id = p_store and a.source_type = 'sales_report' and a.is_active and a.verification_status = 'verified'
  ), staff as (
    select e.id, e.staff_name, e.store_id, s.name as store, public.staff_name_core(e.staff_name) as core, public.staff_name_skeleton(e.staff_name) as skel
    from public.employee_contacts e join public.stores s on s.id = e.store_id and s.is_active
    where e.is_active is not false and coalesce(public.can_work_store(e.store_id), false)
  ), pending as (
    select s.*, public.staff_name_core(s.name) as core, public.staff_name_skeleton(s.name) as skel from sales s
    where not exists (select 1 from linked l where l.norm = s.norm)
  ), certain as (
    select p.norm, min(st.id::text)::uuid as id from pending p join staff st on st.store_id = p_store and st.core = p.core
    group by p.norm having count(*) = 1
  ), likely as (
    select p.norm, jsonb_agg(jsonb_build_object('id', c.id, 'name', c.staff_name, 'store', c.store, 'reason', c.reason) order by c.rank, c.staff_name) as candidates
    from pending p
    cross join lateral (
      select st.id, st.staff_name, st.store,
        case when st.store_id <> p_store and st.core = p.core then 'same name, other store'
             when st.skel = p.skel then 'spelling differs'
             else 'short / long form' end as reason,
        case when st.store_id = p_store then 0 else 1 end as rank
      from staff st
      where (st.store_id <> p_store and st.core = p.core)
         or (st.store_id = p_store and st.core <> p.core and st.skel = p.skel and length(p.skel) >= 3)
         or (st.store_id = p_store and st.core <> p.core and length(p.core) >= 3 and (
              string_to_array(p.core, ' ') <@ string_to_array(st.core, ' ') or string_to_array(st.core, ' ') <@ string_to_array(p.core, ' ')))
      order by 5, 2 limit 3) c
    where not exists (select 1 from certain ce where ce.norm = p.norm)
    group by p.norm
  )
  select case when not coalesce(public.can_work_store(p_store), false) then null else jsonb_build_object(
    'linked', (select count(*) from sales s where exists (select 1 from linked l where l.norm = s.norm)),
    'linked_names', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'staff', l.staff, 'lines', s.lines) order by s.lines desc)
      from sales s join linked l on l.norm = s.norm), '[]'::jsonb),
    'certain', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'lines', p.lines, 'id', st.id, 'staff', st.staff_name) order by p.lines desc)
      from pending p join certain c on c.norm = p.norm join staff st on st.id = c.id), '[]'::jsonb),
    'likely', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'lines', p.lines, 'last_sale', p.last_sale, 'candidates', l.candidates) order by p.lines desc)
      from pending p join likely l on l.norm = p.norm), '[]'::jsonb),
    'unmatched', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'lines', p.lines, 'last_sale', p.last_sale) order by p.lines desc)
      from pending p where not exists (select 1 from certain c where c.norm = p.norm) and not exists (select 1 from likely l where l.norm = p.norm)), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.staff_name, 'store', st.store) order by st.store_id <> p_store, st.staff_name)
      from staff st), '[]'::jsonb)
  ) end
$$;

-- Link every certain match of a store; returns how many were linked.
create function public.auto_link_staff_names(p_store uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_done integer := 0;
begin
  if auth.uid() is not null and not coalesce(public.can_work_store(p_store), false) then raise exception 'Store access denied.'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(public.staff_match_overview_system(p_store)->'certain', '[]'::jsonb)) loop
    perform public.link_staff_name(p_store, v_item->>'name', (v_item->>'id')::uuid);
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;

-- The background job has no signed-in person: same overview for one store
-- without the access filter (used only by auto_link_staff_names).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.staff_match_overview(uuid)'::regprocedure);
  def := replace(def, 'public.staff_match_overview(', 'public.staff_match_overview_system(');
  def := replace(def, 'where e.is_active is not false and coalesce(public.can_work_store(e.store_id), false)', 'where e.is_active is not false');
  def := replace(def, 'select case when not coalesce(public.can_work_store(p_store), false) then null else jsonb_build_object(', 'select case when false then null else jsonb_build_object(');
  if position('can_work_store' in def) > 0 then raise exception 'staff_match_overview changed; review this migration'; end if;
  execute def;
end $$;

create function public.auto_link_all_staff_names() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_store uuid; v_done integer := 0;
begin
  for v_store in select id from public.stores where is_active loop
    v_done := v_done + public.auto_link_staff_names(v_store);
  end loop;
  return v_done;
end $$;

revoke all on function public.staff_name_core(text), public.staff_name_skeleton(text) from public, anon;
grant execute on function public.staff_name_core(text), public.staff_name_skeleton(text) to authenticated, service_role;
revoke all on function public.link_staff_name(uuid, text, uuid), public.staff_match_overview(uuid), public.auto_link_staff_names(uuid) from public, anon;
grant execute on function public.link_staff_name(uuid, text, uuid), public.staff_match_overview(uuid), public.auto_link_staff_names(uuid) to authenticated;
revoke all on function public.staff_match_overview_system(uuid), public.auto_link_all_staff_names() from public, anon, authenticated;

-- ---------------------------------------------------------------- sizes
create function public.stock_sizes(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
  v_staff_store uuid := (select store_id from public.employee_contacts where id = public.current_staff_employee_id());
begin
  if length(v_code) < 3 or length(v_code) > 60 then raise exception 'Scan or type the barcode on the tag.'; end if;
  return coalesce((
    with visible as (
      select id, name from public.stores
      where is_active and (coalesce(public.can_work_store(id), false) or id = v_staff_store)
    ), matched as (
      select distinct k.store_id, k.lot_code from public.stock_rows k
      join visible v on v.id = k.store_id
      join public.reports r on r.id = k.report_id and r.is_current and r.report_type = 'stock'
      where k.lot_code is not null
        and (upper(btrim(k.lot_code)) = v_code or upper(btrim(k.barcode)) = v_code or upper(btrim(k.article_code)) = v_code)
      union
      select p.store_id, p.lot_code from public.stock_position_cache p join visible v on v.id = p.store_id where upper(p.lot_code) = v_code
    ), items as (
      select distinct p.brand, p.item_name, p.size as scanned_size
      from matched m join public.stock_position_cache p on p.store_id = m.store_id and p.lot_code = m.lot_code
      where p.item_name is not null
      limit 3
    )
    select jsonb_agg(jsonb_build_object(
      'brand', i.brand, 'item', i.item_name, 'scanned_size', i.scanned_size,
      'mrp', (select max(p.mrp) from public.stock_position_cache p join visible v on v.id = p.store_id where p.item_name = i.item_name and p.brand is not distinct from i.brand),
      'stores', (
        select coalesce(jsonb_agg(jsonb_build_object('store', v.name, 'sizes', sz.sizes) order by v.name), '[]'::jsonb)
        from visible v
        cross join lateral (
          select jsonb_agg(jsonb_build_object('size', coalesce(nullif(btrim(p.size), ''), '—'), 'on_hand', greatest(sum_qty, 0)) order by p.size) as sizes
          from (select p.size, sum(p.on_hand) as sum_qty from public.stock_position_cache p
                where p.store_id = v.id and p.item_name = i.item_name and p.brand is not distinct from i.brand group by p.size) p
        ) sz
        where sz.sizes is not null)))
    from items i
  ), '[]'::jsonb);
end $$;
revoke all on function public.stock_sizes(text) from public, anon;
grant execute on function public.stock_sizes(text) to authenticated;

commit;

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('staff-name-auto-link', '15 * * * *', 'select public.auto_link_all_staff_names()');
  end if;
end
$outer$;
