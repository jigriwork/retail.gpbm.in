-- Buying and stock tools, from the stock and sales uploads:
--  * stock position per lot: latest stock report less units sold since it,
--    first stock report it appears in, last sale;
--  * sell-through and days of cover by brand;
--  * reorder suggestions by item and size (other stores' stock shown so a
--    transfer can come first);
--  * transfer suggestions between stores;
--  * markdown list for the end-of-season sale (no sale for 90+ days);
--  * buying budgets per brand and season against posted purchases;
--  * stock counts: a blind count of a brand or category against the expected
--    stock, with the difference in units and value.
-- Stock files carry no purchase date, so age is "days without a sale"
-- (sales history starts April 2026) and "first stock report it appears in".
begin;

-- ---------------------------------------------------------------- stock position
-- Internal: no access check; only called by the checked functions below.
create function public.stock_position_internal(p_store uuid)
returns table (lot_code text, brand text, item_name text, size text, category text, mrp numeric, unit_cost numeric,
  snapshot_date date, snapshot_qty numeric, sold_since numeric, on_hand numeric, first_seen date, last_sale date,
  sold_30 numeric, sold_90 numeric, net_90 numeric)
language sql stable security definer set search_path = '' as $$
  with snap as (
    select r.id, r.report_date from public.reports r
    where r.store_id = p_store and r.report_type = 'stock' and r.is_current and r.status = 'processed'
    order by r.period_month desc nulls last, r.report_date desc limit 1
  ), lots as (
    select k.lot_code, max(upper(btrim(k.brand))) as brand, max(k.item_name) as item_name, max(upper(btrim(k.size))) as size,
      max(k.category) as category, max(k.mrp) as mrp, max(coalesce(k.basic_rate, k.purchase_rate)) as unit_cost, sum(k.quantity) as qty
    from public.stock_rows k join snap on k.report_id = snap.id
    where k.lot_code is not null
    group by k.lot_code
  -- Rows are read report by report: each upload's rows sit together on disk,
  -- which is many times faster than reading a store's rows scattered by date.
  ), seen as (
    select k.lot_code, min(coalesce(r.period_month, r.report_date)) as first_seen
    from public.reports r cross join lateral (select x.lot_code from public.stock_rows x where x.report_id = r.id and x.lot_code is not null) k
    where r.store_id = p_store and r.report_type = 'stock' and r.is_current
    group by k.lot_code
  ), sold as (
    select s.lot_code, max(s.sale_date) as last_sale,
      sum(s.quantity) filter (where s.sale_date > (select report_date from snap)) as since,
      sum(s.quantity) filter (where s.sale_date >= public.india_today() - 30) as d30,
      sum(s.quantity) filter (where s.sale_date >= public.india_today() - 90) as d90,
      sum(s.net_sale) filter (where s.sale_date >= public.india_today() - 90) as n90
    from public.reports r cross join lateral (
      select x.lot_code, x.sale_date, x.quantity, x.net_sale from public.sales_rows x
      where x.report_id = r.id and x.lot_code is not null and x.line_kind = 'item') s
    where r.store_id = p_store and r.report_type = 'sales' and r.is_current
    group by s.lot_code
  )
  select l.lot_code, l.brand, l.item_name, l.size, l.category, l.mrp, l.unit_cost, snap.report_date, l.qty,
    coalesce(x.since, 0), greatest(l.qty - coalesce(x.since, 0), 0), seen.first_seen, x.last_sale,
    coalesce(x.d30, 0), coalesce(x.d90, 0), coalesce(x.n90, 0)
  from lots l cross join snap left join sold x on x.lot_code = l.lot_code left join seen on seen.lot_code = l.lot_code
$$;
revoke all on function public.stock_position_internal(uuid) from public, anon, authenticated;

-- Units sold per item and size in the last p_days (item lines only).
create function public.sales_by_item_internal(p_store uuid, p_days integer)
returns table (brand text, item_name text, size text, sold numeric, net numeric, last_sale date)
language sql stable security definer set search_path = '' as $$
  select upper(btrim(s.brand)), s.item_name, upper(btrim(coalesce(s.raw_data->>'PACK / SIZE', ''))), sum(s.quantity), sum(s.net_sale), max(s.sale_date)
  from public.reports r cross join lateral (
    select x.brand, x.item_name, x.raw_data, x.quantity, x.net_sale, x.sale_date from public.sales_rows x
    where x.report_id = r.id and x.line_kind = 'item' and x.item_name is not null and x.sale_date >= public.india_today() - p_days) s
  where r.store_id = p_store and r.report_type = 'sales' and r.is_current and r.report_date >= public.india_today() - p_days - 1
  group by 1, 2, 3
$$;
revoke all on function public.sales_by_item_internal(uuid, integer) from public, anon, authenticated;

-- Saved stock position per store, recalculated only when the store's sales or
-- stock reports change or the day changes (one store per request, so pages stay
-- fast however large the files grow).
create table public.stock_position_cache (
  store_id uuid not null references public.stores(id),
  lot_code text not null,
  brand text, item_name text, size text, category text, mrp numeric, unit_cost numeric,
  snapshot_date date, snapshot_qty numeric, sold_since numeric, on_hand numeric, first_seen date, last_sale date,
  sold_30 numeric, sold_90 numeric, net_90 numeric,
  primary key (store_id, lot_code)
);
create table public.stock_position_state (
  store_id uuid primary key references public.stores(id),
  stamp text not null,
  refreshed_at timestamptz not null default now()
);
alter table public.stock_position_cache enable row level security;
alter table public.stock_position_state enable row level security;
revoke all on public.stock_position_cache, public.stock_position_state from anon, authenticated;

-- Active stores whose positions transfers and reorder compare (ids only).
create function public.stock_position_store_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.stores s
  where s.is_active and exists (select 1 from public.profiles where id = auth.uid() and is_active and role in ('owner', 'manager'))
  order by s.code
$$;

-- Returns true when it recalculated. Any active owner or manager may trigger it:
-- it exposes nothing, and transfers need every store's position.
create function public.refresh_stock_position(p_store uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_stamp text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active and role in ('owner', 'manager')) then
    raise exception 'Not allowed.';
  end if;
  select public.india_today()::text || '|' || coalesce(max(r.created_at)::text, '') || '|' || count(*)
  into v_stamp from public.reports r where r.store_id = p_store and r.is_current and r.report_type in ('sales', 'stock');
  if exists (select 1 from public.stock_position_state where store_id = p_store and stamp = v_stamp) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store::text || 'stock-position', 0));
  if exists (select 1 from public.stock_position_state where store_id = p_store and stamp = v_stamp) then return false; end if;
  delete from public.stock_position_cache where store_id = p_store;
  insert into public.stock_position_cache
  select p_store, p.* from public.stock_position_internal(p_store) p;
  insert into public.stock_position_state(store_id, stamp, refreshed_at) values (p_store, v_stamp, now())
  on conflict (store_id) do update set stamp = excluded.stamp, refreshed_at = now();
  return true;
end $$;

-- Sell-through by brand: units sold in the window against stock on hand.
create function public.brand_sell_through(p_store uuid, p_days integer)
returns table (brand text, sold_units numeric, net_sales numeric, on_hand numeric, on_hand_mrp numeric, on_hand_cost numeric,
  cost_known_units numeric, sell_through_pct numeric, days_cover numeric, no_sale_90_units numeric, snapshot_date date)
language sql stable security definer set search_path = '' as $$
  with stock as (
    select brand, sum(on_hand) as on_hand, sum(on_hand * mrp) as mrp_value, sum(on_hand * unit_cost) filter (where unit_cost is not null) as cost_value,
      sum(on_hand) filter (where unit_cost is not null) as cost_units,
      sum(on_hand) filter (where coalesce(last_sale, '1900-01-01') < public.india_today() - 90) as stale, max(snapshot_date) as snap
    from public.stock_position_cache where store_id = p_store group by brand
  ), sales as (
    select brand, sum(sold) as sold, sum(net) as net from public.sales_by_item_internal(p_store, greatest(least(p_days, 365), 7)) group by brand
  )
  select coalesce(st.brand, sa.brand), coalesce(sa.sold, 0), coalesce(sa.net, 0), coalesce(st.on_hand, 0), coalesce(st.mrp_value, 0),
    st.cost_value, coalesce(st.cost_units, 0),
    case when coalesce(sa.sold, 0) + coalesce(st.on_hand, 0) > 0 then round(100 * coalesce(sa.sold, 0) / (coalesce(sa.sold, 0) + coalesce(st.on_hand, 0)), 1) end,
    case when coalesce(sa.sold, 0) > 0 then round(coalesce(st.on_hand, 0) / (sa.sold / greatest(least(p_days, 365), 7)), 0) end,
    coalesce(st.stale, 0), (select max(snap) from stock)
  from stock st full join sales sa on sa.brand = st.brand
  where public.can_access_store(p_store) and coalesce(st.brand, sa.brand) is not null
  order by coalesce(sa.net, 0) desc, coalesce(st.on_hand, 0) desc
$$;

-- Reorder: sold at least twice in the window and stock covers fewer days
-- than the target. Other stores' stock of the same item and size is shown.
create function public.reorder_suggestions(p_store uuid, p_days integer, p_cover_days integer)
returns table (brand text, item_name text, size text, sold numeric, on_hand numeric, suggest_qty numeric,
  other_store_on_hand numeric, other_store_names text, last_sale date)
language sql stable security definer set search_path = '' as $$
  with window_days as (select greatest(least(coalesce(p_days, 30), 180), 7) as d, greatest(least(coalesce(p_cover_days, 30), 120), 7) as cover),
  sales as (select * from public.sales_by_item_internal(p_store, (select d from window_days))),
  here as (select brand, item_name, size, sum(on_hand) as on_hand from public.stock_position_cache where store_id = p_store group by 1, 2, 3),
  others as (
    select p.brand, p.item_name, p.size, sum(p.on_hand) as on_hand, string_agg(distinct st.name, ', ') as names
    from public.stock_position_cache p join public.stores st on st.id = p.store_id
    where st.is_active and p.store_id <> p_store and p.on_hand > 0
    group by 1, 2, 3
  )
  select s.brand, s.item_name, nullif(s.size, ''), s.sold, coalesce(h.on_hand, 0),
    greatest(ceil(s.sold / (select d from window_days) * (select cover from window_days)) - coalesce(h.on_hand, 0), 0),
    coalesce(o.on_hand, 0), o.names, s.last_sale
  from sales s left join here h on h.brand = s.brand and h.item_name = s.item_name and h.size = s.size
  left join others o on o.brand = s.brand and o.item_name = s.item_name and o.size = s.size
  where public.can_access_store(p_store) and s.sold >= 2
    and coalesce(h.on_hand, 0) < s.sold / (select d from window_days) * (select cover from window_days)
  order by s.sold desc, s.brand, s.item_name, s.size
  limit 500
$$;

-- Transfers: one store holds stock it has not sold in 60 days; another sold
-- the same item and size in the last 30 days and has none.
create function public.transfer_suggestions()
returns table (brand text, item_name text, size text, from_store_id uuid, from_store text, to_store_id uuid, to_store text,
  from_on_hand numeric, to_sold_30 numeric, qty numeric)
language sql stable security definer set search_path = '' as $$
  with stores as (select id, name from public.stores where is_active),
  stock as (
    select p.store_id, p.brand, p.item_name, p.size, sum(p.on_hand) as on_hand, max(p.last_sale) as last_sale
    from public.stock_position_cache p join stores st on st.id = p.store_id group by 1, 2, 3, 4
  ), sold as (
    select st.id as store_id, s.brand, s.item_name, s.size, s.sold
    from stores st cross join lateral public.sales_by_item_internal(st.id, 30) s
  )
  select f.brand, f.item_name, nullif(f.size, ''), f.store_id, sf.name, t.store_id, stt.name, f.on_hand, t.sold, least(f.on_hand, t.sold)
  from stock f
  join sold t on t.brand = f.brand and t.item_name = f.item_name and t.size = f.size and t.store_id <> f.store_id
  join stores sf on sf.id = f.store_id join stores stt on stt.id = t.store_id
  left join stock th on th.store_id = t.store_id and th.brand = f.brand and th.item_name = f.item_name and th.size = f.size
  where f.on_hand > 0 and coalesce(f.last_sale, '1900-01-01') < public.india_today() - 60 and coalesce(th.on_hand, 0) = 0
    and (public.can_access_store(f.store_id) or public.can_access_store(t.store_id))
  order by t.sold desc, f.on_hand desc
  limit 500
$$;

-- Markdown candidates: in stock, no sale for 90+ days. Suggested discount
-- 20% (90+ days), 30% (180+), 40% (365+). Sales history start bounds "never sold".
create function public.markdown_candidates(p_store uuid)
returns table (brand text, item_name text, size text, category text, mrp numeric, on_hand numeric, value_mrp numeric,
  last_sale date, days_without_sale integer, first_seen date, suggested_pct integer)
language sql stable security definer set search_path = '' as $$
  with history as (
    select coalesce(min(s.sale_date), public.india_today()) as start
    from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.store_id = p_store
  ), items as (
    select brand, item_name, size, max(category) as category, mrp, sum(on_hand) as on_hand, max(last_sale) as last_sale, min(first_seen) as first_seen
    from public.stock_position_cache where store_id = p_store and on_hand > 0 group by brand, item_name, size, mrp
  ), aged as (
    select i.*, (public.india_today() - coalesce(i.last_sale, (select start from history)))::integer as days
    from items i
  )
  select brand, item_name, nullif(size, ''), category, mrp, on_hand, on_hand * coalesce(mrp, 0), last_sale, days, first_seen,
    case when days >= 365 then 40 when days >= 180 then 30 else 20 end
  from aged
  where public.can_access_store(p_store) and days >= 90 and coalesce(first_seen, public.india_today()) <= public.india_today() - 60
  order by days desc, on_hand * coalesce(mrp, 0) desc
  limit 1000
$$;

-- ---------------------------------------------------------------- buying budgets (owner)
create table public.buying_budgets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  store_id uuid references public.stores(id),
  season text not null check (length(btrim(season)) between 2 and 40),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  budget_amount numeric(14,2) not null check (budget_amount > 0),
  note text check (note is null or length(note) <= 300),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.buying_budgets enable row level security;
revoke all on public.buying_budgets from anon, authenticated;
grant select, insert, update, delete on public.buying_budgets to authenticated;
create policy buying_budgets_owner on public.buying_budgets for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Budget against posted purchases (Accounts) of that brand, and units sold
-- / on hand under the brand's name and spellings.
create function public.budget_status()
returns table (id uuid, brand_id uuid, brand text, store_id uuid, store_name text, season text, starts_on date, ends_on date,
  budget_amount numeric, purchased numeric, remaining numeric, used_pct numeric, sold_units numeric, net_sales numeric)
language sql stable security definer set search_path = '' as $$
  select b.id, b.brand_id, br.name, b.store_id, st.name, b.season, b.starts_on, b.ends_on, b.budget_amount,
    coalesce(p.purchased, 0), b.budget_amount - coalesce(p.purchased, 0), round(100 * coalesce(p.purchased, 0) / b.budget_amount, 1),
    coalesce(s.units, 0), coalesce(s.net, 0)
  from public.buying_budgets b join public.brands br on br.id = b.brand_id left join public.stores st on st.id = b.store_id
  left join lateral (
    select sum(l.taxable_amount) as purchased from public.purchase_invoice_lines l join public.purchase_invoices i on i.id = l.invoice_id
    where l.brand_id = b.brand_id and i.status = 'posted' and i.invoice_date between b.starts_on and b.ends_on
      and (b.store_id is null or i.store_id = b.store_id)) p on true
  left join lateral (
    select sum(x.quantity) as units, sum(x.net_sale) as net from public.sales_rows x
    join public.reports r on r.id = x.report_id and r.is_current and r.report_type = 'sales'
    where x.line_kind = 'item' and x.sale_date between b.starts_on and b.ends_on and (b.store_id is null or x.store_id = b.store_id)
      and public.finance_norm(x.brand) in (select br.normalized union select a.normalized from public.brand_aliases a where a.brand_id = b.brand_id)) s on true
  where public.is_owner()
  order by b.starts_on desc, br.name
$$;

-- ---------------------------------------------------------------- stock counts
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  title text not null check (length(btrim(title)) between 2 and 80),
  scope_brand text,
  scope_category text,
  snapshot_date date,
  status text not null default 'counting' check (status in ('counting', 'submitted', 'reviewed')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 500)
);
create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts(id) on delete cascade,
  lot_code text,
  brand text,
  item_name text,
  size text,
  mrp numeric(12,2),
  unit_cost numeric(12,2),
  expected_qty numeric(12,3) not null default 0,
  counted_qty numeric(12,3) check (counted_qty is null or counted_qty >= 0),
  is_extra boolean not null default false,
  counted_by uuid references public.profiles(id),
  counted_at timestamptz
);
create index stock_count_lines_count on public.stock_count_lines (count_id);
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
revoke all on public.stock_counts, public.stock_count_lines from anon, authenticated;
grant select on public.stock_counts, public.stock_count_lines to authenticated;
create policy stock_counts_read on public.stock_counts for select to authenticated
  using (public.is_active_user() and public.can_access_store(store_id));
-- Counters do not see expected quantities while counting (blind count): the
-- lines are read through stock_count_sheet, which hides them until submitted.
create policy stock_count_lines_owner on public.stock_count_lines for select to authenticated using (public.is_owner());

create function public.start_stock_count(p_store uuid, p_title text, p_brand text, p_category text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_lines integer;
begin
  if not public.can_access_store(p_store) then raise exception 'You cannot count this store.'; end if;
  perform public.refresh_stock_position(p_store);
  if nullif(btrim(coalesce(p_brand, '')), '') is null and nullif(btrim(coalesce(p_category, '')), '') is null then
    raise exception 'Choose a brand or a category to count.';
  end if;
  insert into public.stock_counts(store_id, title, scope_brand, scope_category, snapshot_date)
  values (p_store, coalesce(nullif(btrim(p_title), ''), concat_ws(' · ', nullif(btrim(p_brand), ''), nullif(btrim(p_category), ''))),
    nullif(upper(btrim(coalesce(p_brand, ''))), ''), nullif(btrim(coalesce(p_category, '')), ''),
    (select max(snapshot_date) from public.stock_position_cache where store_id = p_store))
  returning id into v_id;
  insert into public.stock_count_lines(count_id, lot_code, brand, item_name, size, mrp, unit_cost, expected_qty)
  select v_id, p.lot_code, p.brand, p.item_name, p.size, p.mrp, p.unit_cost, p.on_hand
  from public.stock_position_cache p
  where p.store_id = p_store and p.on_hand > 0
    and (nullif(btrim(coalesce(p_brand, '')), '') is null or p.brand = upper(btrim(p_brand)))
    and (nullif(btrim(coalesce(p_category, '')), '') is null or p.category ilike btrim(p_category))
  order by p.item_name, p.size
  limit 3000;
  get diagnostics v_lines = row_count;
  if v_lines = 0 then raise exception 'Nothing in stock for that brand or category in the latest stock report.'; end if;
  return v_id;
end $$;

-- The count sheet: expected quantity only once the count is submitted.
create function public.stock_count_sheet(p_count uuid)
returns table (id uuid, lot_code text, brand text, item_name text, size text, mrp numeric, expected_qty numeric, counted_qty numeric, is_extra boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.lot_code, l.brand, l.item_name, l.size, l.mrp,
    case when c.status <> 'counting' then l.expected_qty end, l.counted_qty, l.is_extra
  from public.stock_count_lines l join public.stock_counts c on c.id = l.count_id
  where l.count_id = p_count and public.can_access_store(c.store_id)
  order by l.is_extra, l.item_name, l.size
$$;

create function public.record_stock_count(p_line uuid, p_qty numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count public.stock_counts;
begin
  select c.* into v_count from public.stock_counts c join public.stock_count_lines l on l.count_id = c.id where l.id = p_line;
  if v_count.id is null or not public.can_access_store(v_count.store_id) then raise exception 'Count line not found.'; end if;
  if v_count.status <> 'counting' then raise exception 'This count is already submitted.'; end if;
  if p_qty is not null and (p_qty < 0 or p_qty > 100000) then raise exception 'Enter the quantity counted.'; end if;
  update public.stock_count_lines set counted_qty = p_qty, counted_by = auth.uid(), counted_at = now() where id = p_line;
end $$;

-- An item found on the shelf that is not on the sheet.
create function public.add_stock_count_extra(p_count uuid, p_code text, p_item text, p_size text, p_qty numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count public.stock_counts;
begin
  select * into v_count from public.stock_counts where id = p_count;
  if v_count.id is null or not public.can_access_store(v_count.store_id) then raise exception 'Count not found.'; end if;
  if v_count.status <> 'counting' then raise exception 'This count is already submitted.'; end if;
  if length(btrim(coalesce(p_item, ''))) < 2 and length(btrim(coalesce(p_code, ''))) < 2 then raise exception 'Enter the item name or code.'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Enter the quantity found.'; end if;
  insert into public.stock_count_lines(count_id, lot_code, brand, item_name, size, expected_qty, counted_qty, is_extra, counted_by, counted_at)
  values (p_count, nullif(btrim(p_code), ''), v_count.scope_brand, nullif(btrim(p_item), ''), nullif(upper(btrim(coalesce(p_size, ''))), ''), 0, p_qty, true, auth.uid(), now());
end $$;

create function public.submit_stock_count(p_count uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count public.stock_counts; v_missing integer;
begin
  select * into v_count from public.stock_counts where id = p_count for update;
  if v_count.id is null or not public.can_access_store(v_count.store_id) then raise exception 'Count not found.'; end if;
  if v_count.status <> 'counting' then raise exception 'This count is already submitted.'; end if;
  select count(*) into v_missing from public.stock_count_lines where count_id = p_count and counted_qty is null;
  if v_missing > 0 then raise exception '% item(s) are not counted yet. Enter 0 for items not found.', v_missing; end if;
  update public.stock_counts set status = 'submitted', submitted_by = auth.uid(), submitted_at = now() where id = p_count;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'stock_count_submitted', 'stock_count', p_count, v_count.store_id, '{}'::jsonb);
end $$;

create function public.review_stock_count(p_count uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owner reviews stock counts.'; end if;
  update public.stock_counts set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_count and status = 'submitted';
  if not found then raise exception 'Only a submitted count can be reviewed.'; end if;
end $$;

-- Totals: lines counted, units and value short or over (after submission).
create function public.stock_count_summary(p_count uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'lines', count(*), 'counted', count(*) filter (where l.counted_qty is not null),
    'expected_units', case when max(c.status) <> 'counting' then sum(l.expected_qty) end,
    'counted_units', sum(l.counted_qty),
    'short_units', case when max(c.status) <> 'counting' then sum(greatest(l.expected_qty - coalesce(l.counted_qty, 0), 0)) end,
    'over_units', case when max(c.status) <> 'counting' then sum(greatest(coalesce(l.counted_qty, 0) - l.expected_qty, 0)) end,
    'short_value_mrp', case when max(c.status) <> 'counting' then sum(greatest(l.expected_qty - coalesce(l.counted_qty, 0), 0) * coalesce(l.mrp, 0)) end,
    'net_value_mrp', case when max(c.status) <> 'counting' then sum((coalesce(l.counted_qty, 0) - l.expected_qty) * coalesce(l.mrp, 0)) end,
    'net_value_cost', case when max(c.status) <> 'counting' then sum((coalesce(l.counted_qty, 0) - l.expected_qty) * l.unit_cost) filter (where l.unit_cost is not null) end,
    'expected_value_mrp', case when max(c.status) <> 'counting' then sum(l.expected_qty * coalesce(l.mrp, 0)) end)
  from public.stock_count_lines l join public.stock_counts c on c.id = l.count_id
  where l.count_id = p_count and public.can_access_store(c.store_id)
$$;

revoke all on function public.stock_position_store_ids(), public.refresh_stock_position(uuid), public.brand_sell_through(uuid, integer), public.reorder_suggestions(uuid, integer, integer),
  public.transfer_suggestions(), public.markdown_candidates(uuid), public.budget_status(),
  public.start_stock_count(uuid, text, text, text), public.stock_count_sheet(uuid), public.record_stock_count(uuid, numeric),
  public.add_stock_count_extra(uuid, text, text, text, numeric), public.submit_stock_count(uuid), public.review_stock_count(uuid, text),
  public.stock_count_summary(uuid) from public, anon;
grant execute on function public.stock_position_store_ids(), public.refresh_stock_position(uuid), public.brand_sell_through(uuid, integer), public.reorder_suggestions(uuid, integer, integer),
  public.transfer_suggestions(), public.markdown_candidates(uuid), public.budget_status(),
  public.start_stock_count(uuid, text, text, text), public.stock_count_sheet(uuid), public.record_stock_count(uuid, numeric),
  public.add_stock_count_extra(uuid, text, text, text, numeric), public.submit_stock_count(uuid), public.review_stock_count(uuid, text),
  public.stock_count_summary(uuid) to authenticated;

commit;
