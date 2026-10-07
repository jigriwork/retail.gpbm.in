-- "Add as new staff" on Match staff names: a name on the bills that is not in
-- the staff list becomes a staff member of that store (name from the bill,
-- without the counter mark " S") and is matched at once. Owner or the store's
-- manager (a cashier's new staff go through the owner's approval).
begin;

create function public.add_staff_from_sales_name(p_store uuid, p_source text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_clean text := regexp_replace(regexp_replace(btrim(coalesce(p_source, '')), '\s+', ' ', 'g'), '\s+[sS]$', '');
  v_name text := initcap(lower(v_clean));
  v_id uuid;
begin
  if not coalesce(public.can_access_store(p_store), false) then raise exception 'Only the owner or the store manager can add staff.'; end if;
  if length(v_clean) < 2 then raise exception 'Choose the name from the sales bills.'; end if;
  insert into public.employee_contacts(store_id, staff_name, normalized_staff_name, is_active, created_by, notes)
  values (p_store, v_name, lower(v_name), true, auth.uid(), 'Added from the sales bills (Match staff names).')
  on conflict (store_id, normalized_staff_name) do update set is_active = true, left_on = null
  returning id into v_id;
  perform public.link_staff_name(p_store, p_source, v_id);
  return v_id;
end $$;
revoke all on function public.add_staff_from_sales_name(uuid, text) from public, anon;
grant execute on function public.add_staff_from_sales_name(uuid, text) to authenticated;

commit;
