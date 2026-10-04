-- Store money: blind day-end cash close, store expenses, fixed monthly costs
-- and a monthly profit statement per store.
--
-- Day close: the person closing (store manager; later the cashier) enters the
-- cash counted and the UPI, card and other totals without seeing Logic's sale
-- for the day. Expected cash = opening cash + (Logic net sale - UPI - card -
-- other) - expenses paid from the till. A submitted close is locked; only the
-- owner can reopen it.
--
-- Profit (owner only): sales without GST from the daily sales reports, cost of
-- the goods sold (purchase batch cost, else the stock report's basic/purchase
-- rate for the same lot code, else the store's estimated margin), salaries
-- from the latest payslip upload for the month, expenses and fixed costs.
-- Every estimate is shown as such.
begin;

alter table public.stores add column estimated_margin_pct numeric(5,2)
  check (estimated_margin_pct is null or estimated_margin_pct between 0 and 90);
comment on column public.stores.estimated_margin_pct is
  'Owner''s estimate of gross margin on sales without GST, used for profit only where a sold item has no known cost.';

create function public.india_today() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- ---------------------------------------------------------------- day close
create table public.store_day_closes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  close_date date not null,
  opening_cash numeric(12,2) not null check (opening_cash >= 0),
  cash_counted numeric(12,2) not null check (cash_counted >= 0),
  upi_amount numeric(12,2) not null default 0 check (upi_amount >= 0),
  card_amount numeric(12,2) not null default 0 check (card_amount >= 0),
  other_amount numeric(12,2) not null default 0 check (other_amount >= 0),
  other_note text check (other_note is null or length(other_note) <= 200),
  cash_deposited numeric(12,2) not null default 0 check (cash_deposited >= 0 and cash_deposited <= cash_counted),
  note text check (note is null or length(note) <= 500),
  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'reopened')),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 500),
  unique (store_id, close_date)
);
alter table public.store_day_closes enable row level security;
revoke all on public.store_day_closes from anon, authenticated;
grant select on public.store_day_closes to authenticated;
create policy day_closes_read on public.store_day_closes for select to authenticated
  using (public.is_active_user() and public.can_access_store(store_id));

-- ---------------------------------------------------------------- expenses
create table public.store_expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  expense_date date not null,
  category text not null check (category in (
    'tea_snacks', 'transport', 'repairs', 'packaging', 'cleaning', 'stationery', 'alteration',
    'electricity', 'rent', 'internet_phone', 'marketing', 'staff_welfare', 'other')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  paid_from text not null check (paid_from in ('cash', 'bank', 'upi', 'owner')),
  paid_to text check (paid_to is null or length(paid_to) <= 120),
  note text check (note is null or length(note) <= 500),
  status text not null default 'recorded' check (status in ('recorded', 'checked', 'rejected')),
  reject_reason text check (reject_reason is null or length(reject_reason) <= 300),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  checked_by uuid references public.profiles(id),
  checked_at timestamptz
);
create index store_expenses_store_date on public.store_expenses (store_id, expense_date);
alter table public.store_expenses enable row level security;
revoke all on public.store_expenses from anon, authenticated;
grant select, insert, delete on public.store_expenses to authenticated;
grant update (status, reject_reason, checked_by, checked_at) on public.store_expenses to authenticated;
create policy expenses_read on public.store_expenses for select to authenticated
  using (public.is_active_user() and public.can_access_store(store_id));
-- Store staff record the last 7 days only, never the future, as themselves.
create policy expenses_add on public.store_expenses for insert to authenticated
  with check (public.can_access_store(store_id) and created_by = auth.uid() and status = 'recorded'
    and checked_by is null and expense_date <= public.india_today()
    and (public.is_owner() or expense_date >= public.india_today() - 7));
-- The owner checks or rejects.
create policy expenses_review on public.store_expenses for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
-- The person who entered it can remove it within a day while unchecked; the owner any time.
create policy expenses_remove on public.store_expenses for delete to authenticated
  using (public.is_owner() or (created_by = auth.uid() and status = 'recorded'
    and created_at > now() - interval '1 day' and public.can_access_store(store_id)));

-- ---------------------------------------------------------------- fixed monthly costs (owner)
create table public.store_monthly_costs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null check (length(btrim(name)) between 2 and 80),
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  valid_from date not null check (extract(day from valid_from) = 1),
  valid_to date check (valid_to is null or (extract(day from valid_to) = 1 and valid_to >= valid_from)),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.store_monthly_costs enable row level security;
revoke all on public.store_monthly_costs from anon, authenticated;
grant select, insert, update, delete on public.store_monthly_costs to authenticated;
create policy monthly_costs_owner on public.store_monthly_costs for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- day close rules
-- Opening cash is the previous close's cash kept in the drawer; it can be
-- entered only for a store's first close.
create function public.submit_day_close(
  p_store uuid, p_date date, p_opening numeric, p_cash numeric, p_upi numeric, p_card numeric,
  p_other numeric, p_other_note text, p_deposited numeric, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_prev public.store_day_closes; v_row public.store_day_closes; v_opening numeric; v_id uuid;
begin
  if not public.can_access_store(p_store) then raise exception 'You cannot close this store.'; end if;
  if p_date is null or p_date > public.india_today() then raise exception 'Choose today or an earlier date.'; end if;
  if not public.is_owner() and p_date < public.india_today() - 3 then
    raise exception 'Closes older than 3 days can only be entered by the owner.';
  end if;
  if coalesce(p_cash, -1) < 0 or coalesce(p_upi, 0) < 0 or coalesce(p_card, 0) < 0 or coalesce(p_other, 0) < 0 or coalesce(p_deposited, 0) < 0 then
    raise exception 'Amounts cannot be negative.';
  end if;
  if coalesce(p_deposited, 0) > p_cash then raise exception 'Cash deposited cannot be more than the cash counted.'; end if;
  if coalesce(p_other, 0) > 0 and length(btrim(coalesce(p_other_note, ''))) < 3 then
    raise exception 'Say what the "other" payments were (credit note, gift voucher, ...).';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store::text || 'day-close', 0));
  select * into v_row from public.store_day_closes where store_id = p_store and close_date = p_date for update;
  if v_row.id is not null and v_row.status <> 'reopened' then
    raise exception 'This day is already closed. Ask the owner to reopen it if something is wrong.';
  end if;
  select * into v_prev from public.store_day_closes where store_id = p_store and close_date < p_date order by close_date desc limit 1;
  v_opening := case when v_prev.id is not null then v_prev.cash_counted - v_prev.cash_deposited else p_opening end;
  if v_opening is null or v_opening < 0 then raise exception 'Enter the cash in the drawer when the day started.'; end if;

  if v_row.id is null then
    insert into public.store_day_closes(store_id, close_date, opening_cash, cash_counted, upi_amount, card_amount,
      other_amount, other_note, cash_deposited, note, submitted_by)
    values (p_store, p_date, v_opening, p_cash, coalesce(p_upi, 0), coalesce(p_card, 0), coalesce(p_other, 0),
      nullif(btrim(coalesce(p_other_note, '')), ''), coalesce(p_deposited, 0), nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    returning id into v_id;
  else
    update public.store_day_closes set opening_cash = v_opening, cash_counted = p_cash, upi_amount = coalesce(p_upi, 0),
      card_amount = coalesce(p_card, 0), other_amount = coalesce(p_other, 0), other_note = nullif(btrim(coalesce(p_other_note, '')), ''),
      cash_deposited = coalesce(p_deposited, 0), note = nullif(btrim(coalesce(p_note, '')), ''), status = 'submitted',
      submitted_by = auth.uid(), submitted_at = now(), reviewed_by = null, reviewed_at = null
    where id = v_row.id returning id into v_id;
  end if;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, report_date, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'day_close_submitted', 'day_close', v_id, p_store, p_date,
    jsonb_build_object('cash', p_cash, 'upi', p_upi, 'card', p_card, 'other', p_other, 'deposited', p_deposited, 'resubmitted', v_row.id is not null));
  return v_id;
end $$;

-- Owner marks a close as checked, or reopens it for correction (with a reason).
create function public.review_day_close(p_id uuid, p_action text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.store_day_closes;
begin
  if not public.is_owner() then raise exception 'Only the owner reviews day closes.'; end if;
  select * into v_row from public.store_day_closes where id = p_id for update;
  if v_row.id is null then raise exception 'Day close not found.'; end if;
  if p_action = 'review' then
    update public.store_day_closes set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  elsif p_action = 'reopen' then
    if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say why the close is being reopened.'; end if;
    update public.store_day_closes set status = 'reopened', review_note = btrim(p_note), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  else raise exception 'Unknown action'; end if;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, store_id, report_date, metadata)
  values (auth.uid(), 'owner', 'day_close_' || p_action, 'day_close', p_id, v_row.store_id, v_row.close_date, jsonb_build_object('note', p_note));
end $$;

-- Closes with Logic's sale for the day and the computed difference.
-- Positive difference = more cash than expected (excess), negative = short.
create function public.day_close_overview(p_store uuid, p_from date, p_to date)
returns table (id uuid, close_date date, status text, opening_cash numeric, cash_counted numeric, upi_amount numeric,
  card_amount numeric, other_amount numeric, other_note text, cash_deposited numeric, note text, review_note text,
  submitted_by_name text, submitted_at timestamptz, logic_net_sale numeric, sales_report_uploaded boolean,
  cash_expenses numeric, expected_cash numeric, difference numeric)
language sql stable security definer set search_path = '' as $$
  select c.id, c.close_date, c.status, c.opening_cash, c.cash_counted, c.upi_amount, c.card_amount, c.other_amount, c.other_note,
    c.cash_deposited, c.note, c.review_note, p.full_name, c.submitted_at,
    s.net_sale, s.report_id is not null, coalesce(e.cash_spent, 0),
    case when s.report_id is not null then c.opening_cash + (s.net_sale - c.upi_amount - c.card_amount - c.other_amount) - coalesce(e.cash_spent, 0) end,
    case when s.report_id is not null then c.cash_counted - (c.opening_cash + (s.net_sale - c.upi_amount - c.card_amount - c.other_amount) - coalesce(e.cash_spent, 0)) end
  from public.store_day_closes c
  left join public.profiles p on p.id = c.submitted_by
  left join lateral (
    select r.id as report_id, coalesce((select sum(x.net_sale) from public.sales_rows x where x.report_id = r.id and x.line_kind in ('item', 'summary')), 0) as net_sale
    from public.reports r where r.store_id = c.store_id and r.report_type = 'sales' and r.is_current and r.report_date = c.close_date
    limit 1) s on true
  left join lateral (
    select sum(x.amount) as cash_spent from public.store_expenses x
    where x.store_id = c.store_id and x.expense_date = c.close_date and x.paid_from = 'cash' and x.status <> 'rejected') e on true
  where public.can_access_store(p_store) and c.store_id = p_store and c.close_date between p_from and p_to and p_to - p_from <= 400
  order by c.close_date desc
$$;

-- Days without a close (from the store's first close, up to yesterday).
create function public.missing_day_closes(p_store uuid, p_days integer default 14)
returns setof date language sql stable security definer set search_path = '' as $$
  select d::date from generate_series(public.india_today() - least(greatest(p_days, 1), 60), public.india_today() - 1, interval '1 day') d
  where public.can_access_store(p_store)
    and d::date >= coalesce((select min(close_date) from public.store_day_closes where store_id = p_store), public.india_today())
    and not exists (select 1 from public.store_day_closes c where c.store_id = p_store and c.close_date = d::date)
  order by 1 desc
$$;

-- ---------------------------------------------------------------- profit (owner)
create index stock_rows_store_lot_cost on public.stock_rows (store_id, lot_code)
  where lot_code is not null and (basic_rate is not null or purchase_rate is not null);

create function public.store_profit(p_store uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m_start date := date_trunc('month', p_month)::date;
  m_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_store public.stores;
  v_sales record;
  v_salary record;
  v_expenses jsonb;
  v_expense_total numeric;
  v_fixed jsonb;
  v_fixed_total numeric;
  v_days integer;
  v_gross numeric;
  v_net numeric;
begin
  if not public.is_owner() then raise exception 'Only the owner can see store profit.'; end if;
  select * into v_store from public.stores where id = p_store;
  if v_store.id is null then raise exception 'Store not found.'; end if;
  v_days := (least(m_end, public.india_today() - 1) - m_start) + 1;

  with lines as (
    select x.id, x.quantity, x.net_sale, x.lot_code,
      coalesce(x.taxable_amount, x.net_sale - x.tax_amount,
        x.net_sale / case when abs(x.net_sale) / nullif(abs(coalesce(x.quantity, 1)), 0) > 2625 then 1.18 else 1.05 end) as taxable,
      (x.taxable_amount is null and x.tax_amount is null) as taxable_estimated
    from public.sales_rows x join public.reports r on r.id = x.report_id and r.is_current and r.report_type = 'sales'
    where x.store_id = p_store and x.sale_date between m_start and m_end and x.line_kind in ('item', 'summary')
  ), batch_cost as (
    select a.sales_row_id, sum(a.qty * b.unit_cost) as cost
    from public.stock_allocations a join public.purchase_batches b on b.id = a.batch_id
    where a.status = 'active' and b.unit_cost is not null and a.sales_row_id in (select id from lines)
    group by a.sales_row_id
  ), lot_cost as (
    select distinct on (k.lot_code) k.lot_code, coalesce(k.basic_rate, k.purchase_rate) as unit_cost
    from public.stock_rows k join public.reports r on r.id = k.report_id and r.is_current
    where k.store_id = p_store and k.lot_code is not null and (k.basic_rate is not null or k.purchase_rate is not null)
      and k.lot_code in (select lot_code from lines where lot_code is not null)
    order by k.lot_code, r.period_month desc nulls last
  ), costed as (
    select l.*, coalesce(bc.cost, l.quantity * lc.unit_cost) as known_cost,
      case when bc.cost is not null then 'batch' when lc.unit_cost is not null and l.quantity is not null then 'stock' else null end as cost_source
    from lines l left join batch_cost bc on bc.sales_row_id = l.id left join lot_cost lc on lc.lot_code = l.lot_code
  )
  select coalesce(sum(net_sale), 0) as sales_incl_gst,
    coalesce(sum(taxable), 0) as net_sales,
    coalesce(sum(taxable) filter (where taxable_estimated), 0) as taxable_estimated_sales,
    coalesce(sum(known_cost) filter (where cost_source is not null), 0) as known_cost,
    coalesce(sum(taxable) filter (where cost_source is not null), 0) as known_cost_sales,
    coalesce(sum(taxable) filter (where cost_source is null), 0) as unknown_cost_sales,
    (select count(distinct r.report_date) from public.reports r where r.store_id = p_store and r.report_type = 'sales'
       and r.is_current and r.report_date between m_start and m_end) as sales_days
  into v_sales from costed;

  -- Latest payslip upload for the month. Salary cost adds back advances,
  -- which are deducted on the payslip but are still salary.
  select b.id as batch_id, b.source_file_name, b.created_at,
    coalesce(sum(coalesce(r.salary_amount, 0) - coalesce(r.abs_amount, 0) + coalesce(r.sunday_pay_amount, 0) + coalesce(r.commission, 0)), 0) as cost,
    count(r.*) as people
  into v_salary
  from public.payslip_batches b join public.payslip_rows r on r.batch_id = b.id and r.store_id = p_store
  where b.salary_month = m_start
    and b.id = (select b2.id from public.payslip_batches b2 where b2.salary_month = m_start order by b2.created_at desc limit 1)
  group by b.id;

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount', amount) order by amount desc), '[]'::jsonb), coalesce(sum(amount), 0)
  into v_expenses, v_expense_total
  from (select category, sum(amount) as amount from public.store_expenses
        where store_id = p_store and expense_date between m_start and m_end and status <> 'rejected' group by category) e;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'amount', amount) order by amount desc), '[]'::jsonb), coalesce(sum(amount), 0)
  into v_fixed, v_fixed_total
  from public.store_monthly_costs where store_id = p_store and valid_from <= m_start and (valid_to is null or valid_to >= m_start);

  v_gross := v_sales.net_sales - v_sales.known_cost
    - case when v_store.estimated_margin_pct is not null then v_sales.unknown_cost_sales * (1 - v_store.estimated_margin_pct / 100) else 0 end;
  v_net := v_gross - coalesce(v_salary.cost, 0) - v_expense_total - v_fixed_total;

  return jsonb_build_object(
    'store_id', p_store, 'month', m_start, 'days_elapsed', greatest(v_days, 0), 'sales_days', v_sales.sales_days,
    'sales_incl_gst', round(v_sales.sales_incl_gst, 2), 'gst', round(v_sales.sales_incl_gst - v_sales.net_sales, 2),
    'net_sales', round(v_sales.net_sales, 2), 'taxable_estimated_sales', round(v_sales.taxable_estimated_sales, 2),
    'cost_known', round(v_sales.known_cost, 2), 'cost_known_sales', round(v_sales.known_cost_sales, 2),
    'cost_unknown_sales', round(v_sales.unknown_cost_sales, 2), 'estimated_margin_pct', v_store.estimated_margin_pct,
    'cost_estimated', case when v_store.estimated_margin_pct is not null then round(v_sales.unknown_cost_sales * (1 - v_store.estimated_margin_pct / 100), 2) end,
    'gross_profit', round(v_gross, 2),
    'gross_profit_complete', v_sales.unknown_cost_sales = 0 or v_store.estimated_margin_pct is not null,
    'salaries', round(coalesce(v_salary.cost, 0), 2), 'salary_people', coalesce(v_salary.people, 0),
    'salary_file', v_salary.source_file_name, 'salary_uploaded_at', v_salary.created_at,
    'expenses', v_expenses, 'expenses_total', round(v_expense_total, 2),
    'fixed_costs', v_fixed, 'fixed_total', round(v_fixed_total, 2),
    'net_profit', round(v_net, 2));
end $$;

revoke all on function public.submit_day_close(uuid, date, numeric, numeric, numeric, numeric, numeric, text, numeric, text) from public, anon;
revoke all on function public.review_day_close(uuid, text, text) from public, anon;
revoke all on function public.day_close_overview(uuid, date, date) from public, anon;
revoke all on function public.missing_day_closes(uuid, integer) from public, anon;
revoke all on function public.store_profit(uuid, date) from public, anon;
grant execute on function public.submit_day_close(uuid, date, numeric, numeric, numeric, numeric, numeric, text, numeric, text) to authenticated;
grant execute on function public.review_day_close(uuid, text, text) to authenticated;
grant execute on function public.day_close_overview(uuid, date, date) to authenticated;
grant execute on function public.missing_day_closes(uuid, integer) to authenticated;
grant execute on function public.store_profit(uuid, date) to authenticated;

commit;
