-- Appreciation: Star of the week per store (last 7 days to yesterday).
--   store_week_stars(store): owner and the store's manager; names and amounts.
--   my_week_highlights(): a staff member's own week, rank and the store's
--   stars by name only (no other person's amounts).
-- Staff names follow the owner summary: alias first, and a trailing " S"
-- (shop counter) is the same person.
begin;

create function public.staff_sales_window(p_store uuid, p_from date, p_to date)
returns table (staff text, sale numeric, bills bigint, qty numeric, days bigint)
language sql stable security definer set search_path = '' as $$
  with lines as (
    select x.sale_date, nullif(btrim(x.bill_no), '') as bill_no, coalesce(x.net_sale, 0)::numeric as net,
      coalesce(x.quantity, 0)::numeric as qty,
      nullif(regexp_replace(coalesce(a.canonical_staff_name, a2.canonical_staff_name,
        regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')), '\s+[sS]$', ''), '') as staff
    from public.sales_rows x
    join public.reports r on r.id = x.report_id and r.is_current and r.status = 'processed' and r.report_type = 'sales'
    left join public.staff_name_aliases a
      on a.store_id = x.store_id and a.source_type = 'sales_report' and a.is_active
      and a.normalized_source_name = lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g'))
    left join public.staff_name_aliases a2
      on a.id is null and a2.store_id = x.store_id and a2.source_type = 'sales_report' and a2.is_active
      and a2.normalized_source_name = regexp_replace(lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')), ' s$', '')
    where x.store_id = p_store and x.sale_date between p_from and p_to and x.line_kind = 'item'
  )
  select staff, sum(net), count(distinct (sale_date, bill_no)) filter (where bill_no is not null), sum(qty), count(distinct sale_date)
  from lines
  where staff is not null and staff !~* '^(nil|na|n/a|none|unspecified|-|0)$'
  group by staff
$$;
revoke all on function public.staff_sales_window(uuid, date, date) from public, anon, authenticated;

-- The three stars of a ranking (at least 5 bills for the per-bill awards).
create function public.week_stars_of(p_store uuid, p_from date, p_to date, p_amounts boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with w as (select * from public.staff_sales_window(p_store, p_from, p_to) where sale > 0)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', staff, 'sale', case when p_amounts then round(sale) end,
      'bills', case when p_amounts then bills end) order by sale desc) from (select * from w order by sale desc limit 3) t), '[]'::jsonb),
    'best_bill', (select jsonb_build_object('name', staff, 'value', case when p_amounts then round(sale / bills) end, 'bills', bills)
      from w where bills >= 5 order by sale / bills desc limit 1),
    'most_items', (select jsonb_build_object('name', staff, 'value', round(qty / bills, 1), 'bills', bills)
      from w where bills >= 5 order by qty / bills desc limit 1),
    'staff_count', (select count(*) from w)
  )
$$;
revoke all on function public.week_stars_of(uuid, date, date, boolean) from public, anon, authenticated;

create function public.store_week_stars(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_store is null or not coalesce(public.can_access_store(p_store), false) then raise exception 'Store access denied.'; end if;
  return public.week_stars_of(p_store, public.india_today() - 7, public.india_today() - 1, true);
end $$;

create function public.my_week_highlights() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_employee uuid := public.current_staff_employee_id(); v_store uuid; v_names text[]; v_from date := public.india_today() - 7;
  v_to date := public.india_today() - 1; v_mine record; v_rank bigint; v_count bigint; v_stars jsonb;
begin
  if v_employee is null then raise exception 'Staff access denied'; end if;
  select store_id into v_store from public.employee_contacts where id = v_employee;
  -- The staff member's names in the sales reports (verified links only), as the ranking spells them.
  select array_agg(distinct regexp_replace(a.canonical_staff_name, '\s+[sS]$', '')) into v_names
  from public.staff_name_aliases a
  where a.employee_contact_id = v_employee and a.store_id = v_store and a.source_type = 'sales_report'
    and a.is_active and a.verification_status = 'verified';
  v_stars := public.week_stars_of(v_store, v_from, v_to, false);
  if v_names is null then
    return jsonb_build_object('linked', false, 'stars', v_stars);
  end if;
  select sum(sale) as sale, sum(bills) as bills into v_mine
  from public.staff_sales_window(v_store, v_from, v_to) w where w.staff = any(v_names);
  select count(*) + 1 into v_rank from public.staff_sales_window(v_store, v_from, v_to) w
  where w.sale > coalesce(v_mine.sale, 0) and not (w.staff = any(v_names));
  select count(*) into v_count from public.staff_sales_window(v_store, v_from, v_to) w where w.sale > 0;
  return jsonb_build_object(
    'linked', true, 'from', v_from, 'to', v_to,
    'sale', coalesce(round(v_mine.sale), 0), 'bills', coalesce(v_mine.bills, 0),
    'rank', case when coalesce(v_mine.sale, 0) > 0 then v_rank end, 'of', v_count,
    'names', to_jsonb(v_names), 'stars', v_stars);
end $$;

revoke all on function public.store_week_stars(uuid), public.my_week_highlights() from public, anon;
grant execute on function public.store_week_stars(uuid), public.my_week_highlights() to authenticated;

commit;
