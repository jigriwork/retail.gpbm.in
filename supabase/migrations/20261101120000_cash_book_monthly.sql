-- Continuous monthly cash book (additive; no stored balance is rewritten).
--
-- 1. Opening rule by effective date (cash_book_policies). From 1 Sep 2026 a
--    day opens with the previous day's CALCULATED closing (bookkeeping
--    roll-forward); before that date the original rule (previous day's
--    counted cash) still applies. Closed days keep the opening and closing
--    they were closed with. When this migration was written production had
--    no cash book days at all (checked read-only on 1 Nov 2026).
-- 2. Book Sales (typed, cash_book_days.sale_amount) stays separate from
--    Software Sales (current processed sales report: item rows, or summary
--    rows only when the report has no item rows; returns are negative lines
--    and are netted). Pending when no processed report; ₹0 only when a
--    processed report has no sale lines or the day is confirmed as no-sale.
--    Owners and accountants with an explicit grant may correct Software Sales
--    for the cash book only, with a reason; the uploaded rows never change.
-- 3. New payment buckets on the day: Card (card swipes on the EDC machine)
--    and UPI (every UPI payment, including UPI taken on the EDC machine).
--    The old combined "EDC" line keeps its meaning on older days and cannot
--    be mixed with the new buckets on the same day.
-- 4. A day can be entered before the previous day is closed; it can be
--    closed only when the previous day is closed and every required figure
--    (Book Sales, Card, UPI, Counted cash) is entered; 0 must be typed.
-- 5. Accountants: cash book view / entry / Software Sales correction through
--    finance_grants (store or firm scope). Such a grant gives no Accounts
--    access unless an Accounts permission is also given.
-- 6. Every change is written to cash_book_events with who, when and why.
-- 7. Legacy workbook import (owner or service role), validated and
--    idempotent per store and file hash.
begin;

-- ---------------------------------------------------------------- policies
create table public.cash_book_policies (
  effective_from date primary key,
  opening_rule text not null check (opening_rule in ('previous_counted', 'previous_calculated')),
  note text not null check (length(note) between 5 and 500),
  created_at timestamptz not null default now()
);
insert into public.cash_book_policies(effective_from, opening_rule, note) values
  ('2026-09-01', 'previous_calculated',
   'Bookkeeping roll-forward requested by the owner: each day opens with the previous day''s calculated closing. Counted cash is compared, never carried.');

create function public.cash_book_opening_rule(p_date date) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select opening_rule from public.cash_book_policies where effective_from <= p_date
    order by effective_from desc limit 1), 'previous_counted')
$$;

-- ---------------------------------------------------------------- days
alter table public.cash_book_days alter column opening_balance drop not null;
alter table public.cash_book_days
  add column card_amount numeric(12,2) check (card_amount is null or card_amount >= 0),
  add column upi_amount numeric(12,2) check (upi_amount is null or upi_amount >= 0),
  add column opening_rule text check (opening_rule is null or opening_rule in ('previous_counted', 'previous_calculated', 'start', 'legacy_import')),
  add column source text not null default 'app' check (source in ('app', 'legacy_import')),
  add column import_id uuid,
  add column legacy_software_sales numeric(12,2),
  add column software_at_close jsonb,
  add column flags jsonb not null default '[]'::jsonb,
  add column revision integer not null default 0,
  add column updated_by uuid references public.profiles(id),
  add column updated_at timestamptz,
  add column reopened_by uuid references public.profiles(id),
  add column reopened_at timestamptz,
  add column reopen_reason text check (reopen_reason is null or length(reopen_reason) <= 500);
comment on column public.cash_book_days.sale_amount is 'Book Sales: typed by the store from the paper book. Never filled from the report.';
comment on column public.cash_book_days.closing_balance is 'Calculated closing, frozen when the day is closed (null while open).';
-- Days that existed before this migration were made under the original rule.
update public.cash_book_days set opening_rule = 'previous_counted' where opening_rule is null and source = 'app';

-- ---------------------------------------------------------------- entries
alter table public.cash_book_entries drop constraint cash_book_entries_entry_type_check;
alter table public.cash_book_entries add constraint cash_book_entries_entry_type_check check (entry_type in (
  'cash_in', 'from_store', 'adjustment_in',
  'edc', 'expense', 'staff_payment', 'owner', 'home', 'donation', 'bank_deposit', 'to_store', 'other_out',
  'adjustment_out', 'legacy_combined'));
alter table public.cash_book_entries drop column direction;
alter table public.cash_book_entries add column direction text generated always as (
  case when entry_type in ('cash_in', 'from_store', 'adjustment_in') then 'in' else 'out' end) stored;
alter table public.cash_book_entries
  add column reference text check (reference is null or length(reference) <= 80),
  add column client_key uuid;
create unique index cash_book_entries_client_key on public.cash_book_entries(store_id, client_key) where client_key is not null;

-- ---------------------------------------------------------------- Software Sales corrections
create table public.cash_book_software_overrides (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.cash_book_days(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  book_date date not null,
  report_status text not null,
  report_amount numeric(12,2),
  report_ids jsonb not null default '[]'::jsonb,
  corrected_amount numeric(12,2) not null check (corrected_amount >= 0),
  reason text not null check (length(btrim(reason)) between 5 and 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  restored_by uuid references public.profiles(id),
  restored_at timestamptz,
  restore_reason text check (restore_reason is null or length(restore_reason) <= 500)
);
create unique index cash_book_software_overrides_active on public.cash_book_software_overrides(day_id) where restored_at is null;
create index cash_book_software_overrides_store_date on public.cash_book_software_overrides(store_id, book_date);

-- ---------------------------------------------------------------- audit
create table public.cash_book_events (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id),
  book_date date,
  day_id uuid,
  action text not null,
  entity_id uuid,
  actor_id uuid,
  actor_role text,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index cash_book_events_store_date on public.cash_book_events(store_id, book_date, created_at desc);

-- ---------------------------------------------------------------- legacy imports
create table public.cash_book_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  file_name text not null check (length(file_name) between 1 and 200),
  sheet text not null check (length(sheet) between 1 and 80),
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  opening numeric(12,2) not null,
  closing numeric(12,2) not null,
  totals jsonb not null,
  day_count integer not null,
  imported_by uuid not null references public.profiles(id),
  imported_at timestamptz not null default now(),
  unique (store_id, source_sha256),
  unique (store_id, period_from)
);
alter table public.cash_book_days add constraint cash_book_days_import_fk foreign key (import_id) references public.cash_book_imports(id);

-- ---------------------------------------------------------------- bank/UPI-paid expenses
-- Non-drawer expenses stay in store_expenses (one record per expense); the
-- cash book shows them for information and never deducts them from cash.
alter table public.store_expenses drop constraint store_expenses_category_check;
alter table public.store_expenses add constraint store_expenses_category_check check (category in (
  'tea_snacks', 'food', 'water', 'transport', 'courier', 'repairs', 'packaging', 'cleaning', 'stationery',
  'alteration', 'electricity', 'rent', 'staff_room', 'security', 'internet_phone', 'marketing', 'pooja',
  'staff_welfare', 'other'));
alter table public.store_expenses add column client_key uuid, add column reference text check (reference is null or length(reference) <= 80);
create unique index store_expenses_client_key on public.store_expenses(store_id, client_key) where client_key is not null;

alter table public.cash_book_policies enable row level security;
alter table public.cash_book_software_overrides enable row level security;
alter table public.cash_book_events enable row level security;
alter table public.cash_book_imports enable row level security;
revoke all on public.cash_book_policies, public.cash_book_software_overrides, public.cash_book_events, public.cash_book_imports
  from anon, authenticated;

-- ---------------------------------------------------------------- accountant grants
alter table public.finance_grants
  add column cash_book_view boolean not null default false,
  add column cash_book_enter boolean not null default false,
  add column cash_book_override boolean not null default false;

-- A cash-book-only grant must not open Accounts: the Accounts helpers now
-- require an Accounts permission on the grant.
create or replace function public.finance_any(p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists(
    select 1 from public.finance_grants g join public.profiles p on p.id = g.user_id
    where g.user_id = auth.uid() and p.is_active and p.role in ('accountant', 'manager')
      and g.revoked_at is null
      and (now() at time zone 'Asia/Kolkata')::date between g.valid_from and coalesce(g.valid_to, 'infinity'::date)
      and case p_action
        when 'view' then g.can_view or g.can_post or g.can_manage_masters or g.can_approve or g.can_close_period
        when 'post' then g.can_post
        when 'masters' then g.can_manage_masters
        when 'approve' then g.can_approve
        when 'close' then g.can_close_period
        else false end)
$$;

create or replace function public.finance_store_visible(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner()
    or p_store in (select public.user_store_ids())
    or exists(
      select 1 from public.finance_grants g join public.profiles p on p.id = g.user_id
      where g.user_id = auth.uid() and p.is_active and p.role in ('accountant', 'manager')
        and g.revoked_at is null
        and (g.can_view or g.can_post or g.can_manage_masters or g.can_approve or g.can_close_period)
        and (now() at time zone 'Asia/Kolkata')::date between g.valid_from and coalesce(g.valid_to, 'infinity'::date)
        and (g.store_id is null or g.store_id = p_store))
$$;

-- Accountant cash book grant for a store on a date. Firm scope follows the
-- store's confirmed billing firm on that date.
create function public.cash_book_grant_allows(p_action text, p_store uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_store is not null and exists(
    select 1 from public.finance_grants g
    join public.profiles p on p.id = g.user_id
    join public.stores s on s.id = p_store and s.is_active
    where g.user_id = auth.uid() and p.is_active and p.role = 'accountant' and g.revoked_at is null
      and public.india_today() between g.valid_from and coalesce(g.valid_to, 'infinity'::date)
      and (g.store_id is null or g.store_id = p_store)
      and (g.firm_id is null or g.firm_id = public.store_firm_on(p_store, coalesce(p_date, public.india_today())))
      and case p_action
        when 'view' then g.cash_book_view or g.cash_book_enter or g.cash_book_override
        when 'enter' then g.cash_book_enter
        when 'override' then g.cash_book_override
        else false end)
$$;

create function public.cash_book_can_view(p_store uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_store is not null and (coalesce(public.can_work_store(p_store), false) or public.cash_book_grant_allows('view', p_store, p_date))
$$;

-- Owner any day; managers and cashiers of the store the last 3 days;
-- accountants with an entry grant any day in scope. Never the future.
create or replace function public.cash_book_can_edit(p_store uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_store is not null and p_date is not null and p_date <= public.india_today() and (
    (coalesce(public.can_work_store(p_store), false) and (public.is_owner() or p_date >= public.india_today() - 3))
    or public.cash_book_grant_allows('enter', p_store, p_date))
$$;

create function public.cash_book_can_override(p_store uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_store is not null and p_date is not null and p_date <= public.india_today()
    and ((public.is_owner() and coalesce(public.can_access_store(p_store), false)) or public.cash_book_grant_allows('override', p_store, p_date))
$$;

-- ---------------------------------------------------------------- audit helper
create function public.cash_book_log(p_store uuid, p_date date, p_day uuid, p_action text, p_reason text,
  p_before jsonb, p_after jsonb, p_entity uuid default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.cash_book_events(store_id, book_date, day_id, action, entity_id, actor_id, actor_role, reason, before, after)
  values (p_store, p_date, p_day, p_action, p_entity, auth.uid(),
    coalesce((select role from public.profiles where id = auth.uid()), auth.role()),
    nullif(btrim(coalesce(p_reason, '')), ''), p_before, p_after)
$$;

-- Rupees from JSON: number or plain numeric text with up to 2 decimals;
-- null stays null (not entered), never zero.
create function public.cash_book_amount(p_value jsonb, p_label text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
  v := btrim(p_value #>> '{}');
  if v = '' then return null; end if;
  if v !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'Enter % in rupees (0 or more, up to 2 decimals).', p_label; end if;
  if v::numeric > 100000000 then raise exception '% is too large.', p_label; end if;
  return v::numeric;
end $$;

-- ---------------------------------------------------------------- Software Sales
-- Canonical day total from the current processed sales report: item lines
-- when the report has any, otherwise its summary lines (never both, so a
-- report carrying both cannot double count). Returns are negative lines.
-- Lines without amounts (return companions) are ignored.
create function public.cash_book_software(p_store uuid, p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with cur as (
    select r.id, r.status, r.created_at from public.reports r
    where r.store_id = p_store and r.report_type = 'sales' and r.report_date = p_date and r.is_current),
  ok as (select * from cur where status = 'processed'),
  agg as (
    select count(*) filter (where x.line_kind = 'item') as items, count(*) filter (where x.line_kind = 'summary') as summaries,
      coalesce(sum(x.net_sale) filter (where x.line_kind = 'item'), 0) as item_sum,
      coalesce(sum(x.net_sale) filter (where x.line_kind = 'summary'), 0) as summary_sum
    from public.sales_rows x join ok on ok.id = x.report_id where x.line_kind in ('item', 'summary'))
  select case
    when exists (select 1 from ok) then jsonb_build_object(
      'status', 'ready',
      'amount', round(case when a.items > 0 then a.item_sum else a.summary_sum end, 2),
      'basis', case when a.items > 0 then 'item' when a.summaries > 0 then 'summary' else 'zero_report' end,
      'summary_ignored', a.items > 0 and a.summaries > 0,
      'report_ids', (select jsonb_agg(id order by id) from ok),
      'uploaded_at', (select max(created_at) from ok))
    when exists (select 1 from public.sales_day_confirmations z where z.store_id = p_store and z.sale_date = p_date and z.status = 'zero_sales')
      then jsonb_build_object('status', 'ready', 'amount', 0, 'basis', 'zero_confirmed', 'summary_ignored', false, 'report_ids', '[]'::jsonb)
    when exists (select 1 from cur where status not in ('cancelled'))
      then jsonb_build_object('status', 'processing', 'amount', null, 'basis', null, 'report_ids', '[]'::jsonb)
    else jsonb_build_object('status', 'pending', 'amount', null, 'basis', null, 'report_ids', '[]'::jsonb) end
  from agg a
$$;

-- Software Sales used by the cash book: an active correction, else the report.
create function public.cash_book_software_effective(p_store uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rep jsonb := public.cash_book_software(p_store, p_date); o public.cash_book_software_overrides;
begin
  select ov.* into o from public.cash_book_software_overrides ov
  join public.cash_book_days d on d.id = ov.day_id
  where d.store_id = p_store and d.book_date = p_date and ov.restored_at is null;
  return jsonb_build_object(
    'report_status', v_rep->>'status', 'report_amount', v_rep->'amount', 'basis', v_rep->>'basis',
    'summary_ignored', coalesce((v_rep->>'summary_ignored')::boolean, false), 'report_ids', v_rep->'report_ids',
    'uploaded_at', v_rep->'uploaded_at',
    'source', case when o.id is not null then 'override' when v_rep->>'status' = 'ready' then 'report' else 'pending' end,
    'amount', case when o.id is not null then to_jsonb(o.corrected_amount) when v_rep->>'status' = 'ready' then v_rep->'amount' else 'null'::jsonb end,
    'override', case when o.id is null then null else jsonb_build_object(
      'id', o.id, 'original', o.report_amount, 'original_status', o.report_status, 'corrected', o.corrected_amount, 'reason', o.reason,
      'by', (select full_name from public.profiles where id = o.created_by), 'at', o.created_at) end);
end $$;

-- Software Sales for a cash book day: an imported (workbook) day keeps the
-- workbook figure, as corrected by the owner, unless corrected in the app;
-- the uploaded report is shown beside it.
create function public.cash_book_software_day(p_store uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare sw jsonb := public.cash_book_software_effective(p_store, p_date); v_legacy numeric;
begin
  select legacy_software_sales into v_legacy from public.cash_book_days where store_id = p_store and book_date = p_date and source = 'legacy_import';
  if v_legacy is not null and sw->>'source' <> 'override' then
    sw := sw || jsonb_build_object('source', 'workbook', 'amount', v_legacy);
  end if;
  return sw;
end $$;

-- ---------------------------------------------------------------- figures
-- One day's movements and calculated closing:
--   Opening + Book Sales - Card - UPI - (old combined EDC) + cash in
--   - deposits - cash expenses - staff - owner/home - donations - transfers
--   - other payouts (- legacy combined deduction on imported days).
-- Null closing while a required figure is missing. A closed day returns the
-- closing it was closed with.
create function public.cash_book_figures(d public.cash_book_days) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t record; v_legacy boolean; v_missing text[] := '{}'; v_closing numeric; v_noncash numeric;
begin
  select coalesce(sum(amount) filter (where direction = 'in'), 0) as cash_in,
    coalesce(sum(amount) filter (where direction = 'out'), 0) as cash_out,
    coalesce(sum(amount) filter (where entry_type = 'edc'), 0) as edc,
    count(*) filter (where entry_type = 'edc') as edc_lines,
    coalesce(sum(amount) filter (where entry_type = 'legacy_combined'), 0) as legacy,
    count(*) filter (where entry_type = 'legacy_combined') as legacy_lines,
    coalesce(sum(amount) filter (where entry_type = 'bank_deposit'), 0) as deposit,
    count(*) filter (where entry_type = 'bank_deposit') as deposit_lines,
    coalesce(sum(amount) filter (where entry_type = 'expense'), 0) as shop_expenses,
    coalesce(sum(amount) filter (where entry_type = 'staff_payment'), 0) as staff,
    coalesce(sum(amount) filter (where entry_type = 'donation'), 0) as donation,
    coalesce(sum(amount) filter (where entry_type in ('owner', 'home')), 0) as owner_home,
    coalesce(sum(amount) filter (where entry_type = 'to_store'), 0) as to_store,
    coalesce(sum(amount) filter (where entry_type in ('other_out', 'adjustment_out')), 0) as other_out,
    coalesce(sum(amount) filter (where entry_type in ('cash_in', 'from_store', 'adjustment_in')), 0) as other_in,
    count(*) as lines
  into t from public.cash_book_entries e where d.id is not null and e.day_id = d.id;
  v_legacy := t.edc_lines > 0 or t.legacy_lines > 0 or coalesce(d.source, 'app') = 'legacy_import';
  if d.opening_balance is null then v_missing := v_missing || 'opening'::text; end if;
  if d.sale_amount is null then v_missing := v_missing || 'book_sales'::text; end if;
  if not v_legacy and d.card_amount is null then v_missing := v_missing || 'card'::text; end if;
  if not v_legacy and d.upi_amount is null then v_missing := v_missing || 'upi'::text; end if;
  if d.source = 'app' and d.counted_cash is null then v_missing := v_missing || 'counted'::text; end if;
  v_noncash := coalesce(d.card_amount, 0) + coalesce(d.upi_amount, 0) + t.edc;
  if d.status <> 'open' then
    v_closing := d.closing_balance;
  elsif d.opening_balance is not null and d.sale_amount is not null and (v_legacy or (d.card_amount is not null and d.upi_amount is not null)) then
    v_closing := d.opening_balance + d.sale_amount - coalesce(d.card_amount, 0) - coalesce(d.upi_amount, 0) + t.cash_in - t.cash_out;
  end if;
  return jsonb_build_object(
    'closing', v_closing, 'missing', to_jsonb(v_missing), 'legacy_mode', v_legacy,
    'noncash', v_noncash, 'edc', t.edc, 'legacy_combined', t.legacy, 'deposit', t.deposit, 'deposit_lines', t.deposit_lines,
    'cash_expenses', t.shop_expenses + t.staff + t.donation, 'shop_expenses', t.shop_expenses, 'staff', t.staff, 'donation', t.donation,
    'owner_home', t.owner_home, 'to_store', t.to_store, 'other_out', t.other_out, 'other_in', t.other_in,
    'other_net', t.other_in - t.owner_home - t.to_store - t.other_out - t.legacy,
    'cash_in', t.cash_in, 'cash_out', t.cash_out, 'lines', t.lines);
end $$;

-- The opening a day should have under the rule in force on that date.
create function public.cash_book_expected_opening(p_store uuid, p_date date) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare s public.cash_book_starts; prev public.cash_book_days;
begin
  select * into s from public.cash_book_starts where store_id = p_store;
  if s.store_id is null or p_date < s.start_date then return null; end if;
  if p_date = s.start_date then return s.opening_balance; end if;
  select * into prev from public.cash_book_days where store_id = p_store and book_date = p_date - 1;
  if prev.id is null then return null; end if;
  if public.cash_book_opening_rule(p_date) = 'previous_counted' then
    return case when prev.status <> 'open' then prev.counted_cash end;
  end if;
  if prev.status <> 'open' then return prev.closing_balance; end if;
  return (public.cash_book_figures(prev)->>'closing')::numeric;
end $$;

-- Open days from p_date on take their opening from the chain again (after any
-- change to an earlier day). Closed days are never touched.
create function public.cash_book_refresh_from(p_store uuid, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id, book_date from public.cash_book_days where store_id = p_store and book_date >= p_date and status = 'open' order by book_date loop
    update public.cash_book_days set opening_balance = public.cash_book_expected_opening(p_store, r.book_date),
      opening_rule = case when book_date = (select start_date from public.cash_book_starts where store_id = p_store) then 'start'
        else public.cash_book_opening_rule(r.book_date) end
    where id = r.id;
  end loop;
end $$;

-- The day's row, created when first used. A day may be entered while the
-- previous day is still open; closing waits for it.
create or replace function public.cash_book_open_day(p_store uuid, p_date date) returns public.cash_book_days
language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; s public.cash_book_starts;
begin
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date;
  if found then return d; end if;
  select * into s from public.cash_book_starts where store_id = p_store;
  if s.store_id is null then raise exception 'The owner has to set the cash book start (date and opening cash) first.'; end if;
  if p_date < s.start_date then raise exception 'This store''s cash book starts on %.', to_char(s.start_date, 'DD Mon YYYY'); end if;
  if p_date > public.india_today() then raise exception 'A future day cannot be opened.'; end if;
  insert into public.cash_book_days(store_id, book_date, opening_balance, opening_rule)
  values (p_store, p_date, public.cash_book_expected_opening(p_store, p_date),
    case when p_date = s.start_date then 'start' else public.cash_book_opening_rule(p_date) end)
  on conflict (store_id, book_date) do nothing;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date;
  return d;
end $$;

-- ---------------------------------------------------------------- one row
create function public.cash_book_row(p_store uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.cash_book_days; s public.cash_book_starts; f jsonb; sw jsonb; v_hide boolean := public.is_cashier();
  v_status text; v_opening numeric; v_closing numeric; v_soft numeric; v_changed boolean := false; v_prev_closed boolean;
  v_bank numeric;
begin
  select * into s from public.cash_book_starts where store_id = p_store;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date;
  f := public.cash_book_figures(d);
  sw := public.cash_book_software_day(p_store, p_date);
  v_status := case
    when d.id is not null then d.status
    when s.store_id is null then 'not_started'
    when p_date < s.start_date then 'before_start'
    when p_date > public.india_today() then 'future'
    else 'missing' end;
  v_opening := case when d.id is not null then d.opening_balance when v_status = 'missing' then public.cash_book_expected_opening(p_store, p_date) end;
  v_closing := (f->>'closing')::numeric;
  -- Closed days keep what they were closed with; a later report change is flagged.
  if d.id is not null and d.status <> 'open' and d.software_at_close is not null then
    v_changed := (d.software_at_close->>'report_status') is distinct from (sw->>'report_status')
      or (d.software_at_close->'report_amount') is distinct from (sw->'report_amount')
      or (d.software_at_close->'report_ids') is distinct from (sw->'report_ids');
    v_soft := (d.software_at_close->>'amount')::numeric;
  else
    v_soft := (sw->>'amount')::numeric;
  end if;
  v_prev_closed := s.store_id is not null and (p_date = s.start_date or exists (
    select 1 from public.cash_book_days p where p.store_id = p_store and p.book_date = p_date - 1 and p.status <> 'open'));
  select sum(e.amount) into v_bank from public.store_expenses e
  where e.store_id = p_store and e.expense_date = p_date and e.paid_from in ('upi', 'bank') and e.status <> 'rejected';
  return jsonb_build_object(
    'date', p_date, 'exists', d.id is not null, 'status', v_status, 'source', coalesce(d.source, 'app'),
    'opening', v_opening, 'opening_rule', d.opening_rule, 'book_sales', d.sale_amount,
    'software', jsonb_build_object(
      'status', case when d.id is not null and d.status <> 'open' and d.software_at_close is not null then d.software_at_close->>'source' else sw->>'source' end,
      'report_status', sw->>'report_status', 'basis', sw->>'basis', 'summary_ignored', sw->'summary_ignored',
      'amount', case when v_hide then null else v_soft end,
      'report_amount', case when v_hide then null else sw->'report_amount' end,
      'override', case when v_hide or sw->'override' is null or jsonb_typeof(sw->'override') = 'null' then null else sw->'override' end,
      'overridden', sw->'override' is not null and jsonb_typeof(sw->'override') <> 'null',
      'at_close', case when v_hide then null else d.software_at_close end,
      'changed_after_close', v_changed,
      'report_differs', sw->>'report_status' = 'ready' and v_soft is not null and abs((sw->>'report_amount')::numeric - v_soft) > 1
        and coalesce(d.software_at_close->>'source', sw->>'source') in ('workbook', 'override'),
      'legacy_workbook', case when v_hide then null else d.legacy_software_sales end,
      'matches', case when v_soft is null or d.sale_amount is null then null else abs(v_soft - d.sale_amount) <= 1 end),
    'sales_difference', case when v_hide or v_soft is null or d.sale_amount is null then null else v_soft - d.sale_amount end,
    'card', d.card_amount, 'upi', d.upi_amount, 'edc_legacy', (f->>'edc')::numeric, 'noncash', (f->>'noncash')::numeric,
    'deposit', (f->>'deposit')::numeric, 'deposit_lines', (f->>'deposit_lines')::int,
    'cash_expenses', (f->>'cash_expenses')::numeric, 'shop_expenses', (f->>'shop_expenses')::numeric,
    'staff', (f->>'staff')::numeric, 'donation', (f->>'donation')::numeric,
    'owner_home', (f->>'owner_home')::numeric, 'to_store', (f->>'to_store')::numeric, 'other_out', (f->>'other_out')::numeric,
    'other_in', (f->>'other_in')::numeric, 'legacy_combined', (f->>'legacy_combined')::numeric, 'other_net', (f->>'other_net')::numeric,
    'bank_paid_expenses', v_bank,
    'closing', v_closing, 'counted', d.counted_cash,
    'cash_difference', case when d.counted_cash is null or v_closing is null then null else d.counted_cash - v_closing end,
    'missing', case when d.id is null then '[]'::jsonb else f->'missing' end,
    'legacy_mode', (f->>'legacy_mode')::boolean,
    'previous_closed', v_prev_closed,
    'can_close', d.id is not null and d.status = 'open' and v_prev_closed and jsonb_array_length(f->'missing') = 0,
    'flags', coalesce(d.flags, '[]'::jsonb) || case when v_closing < 0 then '["negative_closing"]'::jsonb else '[]'::jsonb end,
    'bank_day', public.cash_is_bank_day(p_date),
    'revision', coalesce(d.revision, 0), 'lines', (f->>'lines')::int,
    'note', d.note, 'closed_by', (select full_name from public.profiles where id = d.closed_by), 'closed_at', d.closed_at,
    'reviewed_by', (select full_name from public.profiles where id = d.reviewed_by), 'reviewed_at', d.reviewed_at,
    'reopened_by', (select full_name from public.profiles where id = d.reopened_by), 'reopened_at', d.reopened_at, 'reopen_reason', d.reopen_reason,
    'updated_by', (select full_name from public.profiles where id = d.updated_by), 'updated_at', d.updated_at,
    'can_edit', public.cash_book_can_edit(p_store, p_date) and coalesce(d.status, 'open') = 'open' and v_status in ('open', 'missing'),
    'can_override', public.cash_book_can_override(p_store, p_date) and coalesce(d.status, 'open') = 'open' and v_status in ('open', 'missing'));
end $$;

-- ---------------------------------------------------------------- month
-- Every calendar day of the month. Totals add movements only; the month's
-- opening is its first day's opening and its closing the last closed day's
-- calculated closing (complete only when every day is closed).
create function public.cash_book_month(p_store uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_month)::date; v_to date; v_rows jsonb := '[]'::jsonb; g date; s public.cash_book_starts;
  v_totals jsonb; v_first date; v_last_closed jsonb; v_complete boolean; v_view boolean := false;
begin
  if p_store is null or p_month is null then raise exception 'Store access denied.'; end if;
  v_to := (v_from + interval '1 month' - interval '1 day')::date;
  select * into s from public.cash_book_starts where store_id = p_store;
  for g in select gs::date from generate_series(v_from, v_to, interval '1 day') gs loop
    if public.cash_book_can_view(p_store, g) then
      v_view := true;
      v_rows := v_rows || jsonb_build_array(public.cash_book_row(p_store, g));
    else
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('date', g, 'status', 'no_access'));
    end if;
  end loop;
  if not v_view then raise exception 'Store access denied.'; end if;
  v_first := greatest(v_from, coalesce(s.start_date, v_from));
  select r into v_last_closed from jsonb_array_elements(v_rows) r
  where r->>'status' in ('closed', 'reviewed') order by r->>'date' desc limit 1;
  v_complete := s.store_id is not null and s.start_date <= v_to and v_to < public.india_today() and not exists (
    select 1 from jsonb_array_elements(v_rows) r where (r->>'date')::date >= v_first and r->>'status' not in ('closed', 'reviewed'));
  select jsonb_build_object(
    'book_sales', sum((r->>'book_sales')::numeric),
    'software_sales', sum((r->'software'->>'amount')::numeric),
    'sales_difference', sum((r->>'sales_difference')::numeric),
    'card', sum((r->>'card')::numeric), 'upi', sum((r->>'upi')::numeric), 'edc_legacy', sum((r->>'edc_legacy')::numeric),
    'noncash', sum((r->>'noncash')::numeric), 'deposit', sum((r->>'deposit')::numeric),
    'cash_expenses', sum((r->>'cash_expenses')::numeric), 'shop_expenses', sum((r->>'shop_expenses')::numeric),
    'staff', sum((r->>'staff')::numeric), 'donation', sum((r->>'donation')::numeric),
    'owner_home', sum((r->>'owner_home')::numeric), 'to_store', sum((r->>'to_store')::numeric),
    'other_out', sum((r->>'other_out')::numeric), 'other_in', sum((r->>'other_in')::numeric),
    'legacy_combined', sum((r->>'legacy_combined')::numeric), 'other_net', sum((r->>'other_net')::numeric),
    'bank_paid_expenses', sum((r->>'bank_paid_expenses')::numeric),
    'cash_difference', sum((r->>'cash_difference')::numeric) filter (where r->>'status' in ('closed', 'reviewed')),
    'days_closed', count(*) filter (where r->>'status' in ('closed', 'reviewed')),
    'days_open', count(*) filter (where r->>'status' = 'open'),
    'days_missing', count(*) filter (where r->>'status' = 'missing'),
    'days_software_pending', count(*) filter (where r->>'exists' = 'true' and r->'software'->>'status' = 'pending'),
    'days_report_changed', count(*) filter (where (r->'software'->>'changed_after_close')::boolean),
    'days_overridden', count(*) filter (where (r->'software'->>'overridden')::boolean),
    'days_negative', count(*) filter (where (r->'flags') ? 'negative_closing'))
  into v_totals from jsonb_array_elements(v_rows) r where r->>'status' <> 'no_access';
  return jsonb_build_object(
    'month', v_from, 'from', v_from, 'to', v_to, 'today', public.india_today(),
    'start', case when s.store_id is null then null else jsonb_build_object('date', s.start_date, 'opening', s.opening_balance) end,
    'opening', (select (r->>'opening')::numeric from jsonb_array_elements(v_rows) r where (r->>'date')::date = v_first),
    'opening_date', case when s.store_id is null or s.start_date > v_to then null else v_first end,
    'closing', (v_last_closed->>'closing')::numeric, 'closing_date', v_last_closed->>'date',
    'complete', coalesce(v_complete, false),
    'totals', v_totals,
    'access', jsonb_build_object(
      'owner', public.is_owner(), 'cashier', public.is_cashier(),
      'enter', public.cash_book_can_edit(p_store, least(v_to, public.india_today())),
      'override', public.cash_book_can_override(p_store, least(v_to, public.india_today())),
      'manager', coalesce(public.can_access_store(p_store), false) and not public.is_owner()),
    'days', v_rows);
end $$;

-- Stores this person can open in the cash book (owner, store staff, or an
-- accountant's cash book grant).
create function public.cash_book_stores() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code) order by s.name), '[]'::jsonb)
  from public.stores s
  where s.is_active and (coalesce(public.can_work_store(s.id), false) or exists (
    select 1 from public.finance_grants g join public.profiles p on p.id = g.user_id
    where g.user_id = auth.uid() and p.is_active and p.role = 'accountant' and g.revoked_at is null
      and public.india_today() between g.valid_from and coalesce(g.valid_to, 'infinity'::date)
      and (g.cash_book_view or g.cash_book_enter or g.cash_book_override)
      and (g.store_id is null or g.store_id = s.id)
      and (g.firm_id is null or exists (select 1 from public.store_firm_periods fp
        where fp.store_id = s.id and fp.firm_id = g.firm_id and fp.status = 'confirmed'))))
$$;

-- ---------------------------------------------------------------- writes
create or replace function public.cash_book_set_start(p_store uuid, p_date date, p_opening numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  if not public.is_owner() then raise exception 'Only the owner sets where the cash book starts.'; end if;
  if p_date is null or p_date > public.india_today() then raise exception 'Choose the first day of the cash book (today or earlier).'; end if;
  if p_opening is null or p_opening < 0 then raise exception 'Enter the opening cash (OB) for that day.'; end if;
  if exists (select 1 from public.cash_book_days where store_id = p_store and status <> 'open') then
    raise exception 'Days are already closed in this cash book; the start can no longer be changed.';
  end if;
  delete from public.cash_book_days d where d.store_id = p_store
    and not exists (select 1 from public.cash_book_entries e where e.day_id = d.id)
    and d.sale_amount is null and d.card_amount is null and d.upi_amount is null and d.counted_cash is null
    and not exists (select 1 from public.cash_book_software_overrides o where o.day_id = d.id);
  if exists (select 1 from public.cash_book_days where store_id = p_store) then
    raise exception 'Clear the figures and lines of the open days first, then change the start.';
  end if;
  select to_jsonb(s) into v_before from public.cash_book_starts s where s.store_id = p_store;
  insert into public.cash_book_starts(store_id, start_date, opening_balance) values (p_store, p_date, round(p_opening, 2))
  on conflict (store_id) do update set start_date = excluded.start_date, opening_balance = excluded.opening_balance,
    set_by = auth.uid(), set_at = now();
  perform public.cash_book_log(p_store, p_date, null, 'set_start', null, v_before,
    jsonb_build_object('start_date', p_date, 'opening', round(p_opening, 2)));
end $$;

-- Saves typed day figures (Book Sales, Card, UPI, Counted cash, note, single
-- bank deposit). A key that is present is saved; null clears it (not entered).
-- p_revision guards against overwriting someone else's newer save.
create function public.cash_book_save_day(p_store uuid, p_date date, p_values jsonb, p_revision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; v_before jsonb; k text; v_sale numeric; v_card numeric; v_upi numeric; v_counted numeric;
  v_deposit numeric; v_dep record; v_note text; v_edc int;
begin
  if not public.cash_book_can_edit(p_store, p_date) then
    raise exception 'You cannot change the cash book for this day. Older days can be changed only by the owner.';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then raise exception 'Nothing to save.'; end if;
  for k in select jsonb_object_keys(p_values) loop
    if k not in ('book_sales', 'card', 'upi', 'counted', 'note', 'deposit') then raise exception 'Unknown field %.', k; end if;
  end loop;
  v_sale := public.cash_book_amount(p_values->'book_sales', 'Book Sales');
  v_card := public.cash_book_amount(p_values->'card', 'Card');
  v_upi := public.cash_book_amount(p_values->'upi', 'UPI');
  v_counted := public.cash_book_amount(p_values->'counted', 'Counted cash');
  v_deposit := public.cash_book_amount(p_values->'deposit', 'Bank deposit');
  v_note := nullif(btrim(coalesce(p_values->>'note', '')), '');
  if length(v_note) > 500 then raise exception 'The note is too long.'; end if;

  d := public.cash_book_open_day(p_store, p_date);
  select * into d from public.cash_book_days where id = d.id for update;
  if d.status <> 'open' then raise exception 'This day is closed. Ask the owner to reopen it.'; end if;
  if p_revision is not null and p_revision <> d.revision then
    raise exception 'Someone else changed this day just now. Reload to see their figures before saving.';
  end if;
  select count(*) into v_edc from public.cash_book_entries where day_id = d.id and entry_type in ('edc', 'legacy_combined');
  if v_edc > 0 and ((p_values ? 'card' and v_card is not null) or (p_values ? 'upi' and v_upi is not null)) then
    raise exception 'This day already has an old combined EDC (card + UPI) line. Remove it before entering Card and UPI separately, so nothing is counted twice.';
  end if;
  v_before := to_jsonb(d);

  if p_values ? 'deposit' then
    select count(*) as n, min(id::text)::uuid as id into v_dep from public.cash_book_entries where day_id = d.id and entry_type = 'bank_deposit';
    if v_dep.n > 1 then raise exception 'This day has several bank deposit lines. Change them in the day''s lines.'; end if;
    if coalesce(v_deposit, 0) = 0 then
      delete from public.cash_book_entries where id = v_dep.id;
    elsif v_dep.n = 1 then
      update public.cash_book_entries set amount = round(v_deposit, 2) where id = v_dep.id;
    else
      insert into public.cash_book_entries(day_id, store_id, book_date, entry_type, amount)
      values (d.id, p_store, p_date, 'bank_deposit', round(v_deposit, 2));
    end if;
  end if;

  update public.cash_book_days set
    sale_amount = case when p_values ? 'book_sales' then round(v_sale, 2) else sale_amount end,
    card_amount = case when p_values ? 'card' then round(v_card, 2) else card_amount end,
    upi_amount = case when p_values ? 'upi' then round(v_upi, 2) else upi_amount end,
    counted_cash = case when p_values ? 'counted' then round(v_counted, 2) else counted_cash end,
    note = case when p_values ? 'note' then v_note else note end,
    revision = revision + 1, updated_by = auth.uid(), updated_at = now()
  where id = d.id returning * into d;
  perform public.cash_book_log(p_store, p_date, d.id, 'save', null, v_before, p_values);
  perform public.cash_book_refresh_from(p_store, p_date + 1);
  return public.cash_book_row(p_store, p_date);
end $$;

drop function public.cash_book_add_entry(uuid, date, text, numeric, text, text, uuid, uuid);
create function public.cash_book_add_entry(
  p_store uuid, p_date date, p_type text, p_amount numeric,
  p_category text default null, p_note text default null, p_employee uuid default null, p_other_store uuid default null,
  p_reference text default null, p_client_key uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; v_id uuid; v_staff text; v_transfer uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ref text := nullif(btrim(coalesce(p_reference, '')), ''); e public.cash_book_entries;
begin
  if not public.cash_book_can_edit(p_store, p_date) then
    raise exception 'You cannot change the cash book for this day. Older days can be changed only by the owner.';
  end if;
  if p_client_key is not null then
    select * into e from public.cash_book_entries where store_id = p_store and client_key = p_client_key;
    if e.id is not null then
      if e.book_date <> p_date or e.entry_type <> p_type or e.amount <> round(p_amount, 2) then
        raise exception 'This line was already saved with different details. Reload the page.';
      end if;
      return e.id;
    end if;
  end if;
  if p_type not in ('cash_in', 'edc', 'expense', 'staff_payment', 'owner', 'home', 'donation', 'bank_deposit', 'to_store', 'other_out',
                    'adjustment_in', 'adjustment_out') then
    raise exception 'Choose what the money was for.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 or round(p_amount, 2) <> p_amount then raise exception 'Enter the amount in rupees.'; end if;
  if p_type = 'expense' and p_category is null then raise exception 'Choose the expense type.'; end if;
  if p_type <> 'expense' and p_category is not null then raise exception 'Only expenses have an expense type.'; end if;
  if (p_type in ('cash_in', 'other_out') or p_category = 'other') and length(coalesce(v_note, '')) < 3 then
    raise exception 'Write what this money was for.';
  end if;
  if p_type in ('adjustment_in', 'adjustment_out') then
    if not public.is_owner() then raise exception 'Only the owner can record a cash adjustment.'; end if;
    if length(coalesce(v_note, '')) < 5 then raise exception 'Write the reason for the adjustment.'; end if;
  end if;
  if length(v_ref) > 80 then raise exception 'The reference is too long.'; end if;
  if p_type = 'staff_payment' then
    if p_employee is not null then
      select staff_name into v_staff from public.employee_contacts where id = p_employee and store_id = p_store;
      if v_staff is null then raise exception 'Choose a staff member of this store.'; end if;
    elsif length(coalesce(v_note, '')) < 2 then
      raise exception 'Choose the staff member or write their name.';
    end if;
  elsif p_employee is not null then
    raise exception 'A staff member is only for staff payments.';
  end if;
  if p_type = 'to_store' then
    if p_other_store is null or p_other_store = p_store or not exists (select 1 from public.stores where id = p_other_store and is_active) then
      raise exception 'Choose the store the cash is going to.';
    end if;
  elsif p_other_store is not null then
    raise exception 'A store is only for cash sent to another store.';
  end if;

  d := public.cash_book_open_day(p_store, p_date);
  select * into d from public.cash_book_days where id = d.id for update;
  if d.status <> 'open' then raise exception 'This day is closed. Ask the owner to reopen it.'; end if;
  if p_type = 'edc' and (d.card_amount is not null or d.upi_amount is not null) then
    raise exception 'Card and UPI are entered separately for this day; the combined EDC line would count them twice.';
  end if;

  if p_type = 'to_store' then
    insert into public.cash_transfers(from_store_id, to_store_id, amount, sent_date, note)
    values (p_store, p_other_store, round(p_amount, 2), p_date, v_note) returning id into v_transfer;
  end if;
  insert into public.cash_book_entries(day_id, store_id, book_date, entry_type, category, amount, note, employee_id, staff_name,
    other_store_id, transfer_id, reference, client_key)
  values (d.id, p_store, p_date, p_type, p_category, round(p_amount, 2), v_note, p_employee, v_staff, p_other_store, v_transfer, v_ref, p_client_key)
  on conflict (store_id, client_key) where client_key is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.cash_book_entries where store_id = p_store and client_key = p_client_key;
    return v_id;
  end if;
  update public.cash_book_days set revision = revision + 1, updated_by = auth.uid(), updated_at = now() where id = d.id;
  perform public.cash_book_log(p_store, p_date, d.id, 'add_line', case when p_type like 'adjustment%' then v_note end, null,
    (select to_jsonb(e2) from public.cash_book_entries e2 where e2.id = v_id), v_id);
  perform public.cash_book_refresh_from(p_store, p_date + 1);
  return v_id;
end $$;

drop function public.cash_book_delete_entry(uuid);
create function public.cash_book_delete_entry(p_entry uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.cash_book_entries; d public.cash_book_days; t public.cash_transfers;
begin
  select * into e from public.cash_book_entries where id = p_entry;
  if e.id is null then raise exception 'Entry not found.'; end if;
  select * into d from public.cash_book_days where id = e.day_id for update;
  if not public.cash_book_can_edit(e.store_id, e.book_date) then raise exception 'You cannot change the cash book for this day.'; end if;
  if d.status <> 'open' then raise exception 'This day is closed. Ask the owner to reopen it.'; end if;
  if not (coalesce(public.can_access_store(e.store_id), false) or e.created_by = auth.uid()
          or public.cash_book_grant_allows('enter', e.store_id, e.book_date)) then
    raise exception 'Only the person who entered it, the manager or the owner can remove it.';
  end if;
  if e.entry_type = 'legacy_combined' and not public.is_owner() then raise exception 'Only the owner can remove an imported line.'; end if;
  if e.transfer_id is not null then
    select * into t from public.cash_transfers where id = e.transfer_id for update;
    if e.entry_type = 'to_store' then
      if t.status = 'received' then raise exception 'The other store has already received this cash; it cannot be removed here.'; end if;
      update public.cash_transfers set status = 'cancelled' where id = t.id;
    else
      update public.cash_transfers set status = 'sent', received_date = null, received_by = null where id = t.id;
    end if;
  end if;
  delete from public.cash_book_entries where id = e.id;
  update public.cash_book_days set revision = revision + 1, updated_by = auth.uid(), updated_at = now() where id = d.id;
  perform public.cash_book_log(e.store_id, e.book_date, d.id, 'remove_line', p_reason, to_jsonb(e), null, e.id);
  perform public.cash_book_refresh_from(e.store_id, e.book_date + 1);
end $$;

create or replace function public.cash_book_receive_transfer(p_transfer uuid, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.cash_transfers; d public.cash_book_days; v_id uuid;
begin
  select * into t from public.cash_transfers where id = p_transfer for update;
  if t.id is null or t.status <> 'sent' then raise exception 'This cash is not waiting to be received.'; end if;
  if not public.cash_book_can_edit(t.to_store_id, p_date) then raise exception 'You cannot change the cash book for this day.'; end if;
  if p_date < t.sent_date then raise exception 'Cash cannot be received before it was sent.'; end if;
  d := public.cash_book_open_day(t.to_store_id, p_date);
  select * into d from public.cash_book_days where id = d.id for update;
  if d.status <> 'open' then raise exception 'This day is closed. Ask the owner to reopen it.'; end if;
  insert into public.cash_book_entries(day_id, store_id, book_date, entry_type, amount, note, other_store_id, transfer_id)
  values (d.id, t.to_store_id, p_date, 'from_store', t.amount, t.note, t.from_store_id, t.id) returning id into v_id;
  update public.cash_transfers set status = 'received', received_date = p_date, received_by = auth.uid() where id = t.id;
  update public.cash_book_days set revision = revision + 1, updated_by = auth.uid(), updated_at = now() where id = d.id;
  perform public.cash_book_log(t.to_store_id, p_date, d.id, 'receive_transfer', null, null, to_jsonb(t), v_id);
  perform public.cash_book_refresh_from(t.to_store_id, p_date + 1);
  return v_id;
end $$;

-- Closes a day with the figures already saved. The previous day must be
-- closed (unbroken chain) and every required figure entered.
create function public.cash_book_close(p_store uuid, p_date date, p_revision integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; prev public.cash_book_days; s public.cash_book_starts; f jsonb; v_opening numeric; v_closing numeric;
  v_missing text; sw jsonb;
begin
  if not public.cash_book_can_edit(p_store, p_date) then
    raise exception 'You cannot change the cash book for this day. Older days can be changed only by the owner.';
  end if;
  select * into s from public.cash_book_starts where store_id = p_store;
  if s.store_id is null then raise exception 'The owner has to set the cash book start (date and opening cash) first.'; end if;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date for update;
  if d.id is null then raise exception 'Enter the day''s figures first.'; end if;
  if d.status <> 'open' then raise exception 'This day is already closed.'; end if;
  if p_revision is not null and p_revision <> d.revision then
    raise exception 'Someone else changed this day just now. Reload and check the figures before closing.';
  end if;
  if p_date <> s.start_date then
    select * into prev from public.cash_book_days where store_id = p_store and book_date = p_date - 1 for share;
    if prev.id is null or prev.status = 'open' then
      raise exception 'Close % first: the balance runs from day to day without gaps.', to_char(p_date - 1, 'DD Mon YYYY');
    end if;
  end if;
  v_opening := public.cash_book_expected_opening(p_store, p_date);
  if v_opening is null then raise exception 'The opening balance for this day is not known yet.'; end if;
  update public.cash_book_days set opening_balance = v_opening,
    opening_rule = case when p_date = s.start_date then 'start' else public.cash_book_opening_rule(p_date) end
  where id = d.id returning * into d;
  f := public.cash_book_figures(d);
  if jsonb_array_length(f->'missing') > 0 then
    select string_agg(case m when 'book_sales' then 'Book Sales' when 'card' then 'Card' when 'upi' then 'UPI'
      when 'counted' then 'Counted cash' else m end, ', ') into v_missing from jsonb_array_elements_text(f->'missing') m;
    raise exception 'Fill in before closing: % (type 0 when there was none).', v_missing;
  end if;
  v_closing := (f->>'closing')::numeric;
  sw := public.cash_book_software_day(p_store, p_date);
  update public.cash_book_days set status = 'closed', closing_balance = v_closing, closed_by = auth.uid(), closed_at = now(),
    software_at_close = sw, revision = revision + 1, updated_by = auth.uid(), updated_at = now()
  where id = d.id;
  perform public.cash_book_log(p_store, p_date, d.id, 'close', null, null,
    jsonb_build_object('opening', v_opening, 'closing', v_closing, 'counted', d.counted_cash, 'software', sw));
  perform public.cash_book_refresh_from(p_store, p_date + 1);
  return jsonb_build_object('opening', v_opening, 'closing', v_closing, 'counted', d.counted_cash, 'difference', d.counted_cash - v_closing);
end $$;

-- Original one-step close (sale and counted cash typed at closing).
create or replace function public.cash_book_close_day(p_store uuid, p_date date, p_sale numeric, p_counted numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.cash_book_can_edit(p_store, p_date) then
    raise exception 'You cannot change the cash book for this day. Older days can be changed only by the owner.';
  end if;
  if p_sale is null or p_sale < 0 then raise exception 'Enter the day''s Book Sales.'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Count the cash in the drawer and enter it.'; end if;
  perform public.cash_book_save_day(p_store, p_date,
    jsonb_build_object('book_sales', round(p_sale, 2), 'counted', round(p_counted, 2), 'note', p_note), null);
  return public.cash_book_close(p_store, p_date, null);
end $$;

drop function public.cash_book_reopen_day(uuid, date);
create function public.cash_book_reopen_day(p_store uuid, p_date date, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_owner() then raise exception 'Only the owner can reopen a closed day.'; end if;
  if length(coalesce(v_reason, '')) < 5 then raise exception 'Write why the day is being reopened.'; end if;
  if exists (select 1 from public.cash_book_days where store_id = p_store and book_date > p_date and status <> 'open') then
    raise exception 'Later days are closed. Reopen the latest closed day first.';
  end if;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date for update;
  if d.id is null or d.status = 'open' then raise exception 'This day is not closed.'; end if;
  update public.cash_book_days set status = 'open', closing_balance = null, software_at_close = null,
    closed_by = null, closed_at = null, reviewed_by = null, reviewed_at = null,
    reopened_by = auth.uid(), reopened_at = now(), reopen_reason = v_reason,
    revision = revision + 1, updated_by = auth.uid(), updated_at = now()
  where id = d.id;
  perform public.cash_book_log(p_store, p_date, d.id, 'reopen', v_reason, to_jsonb(d), null);
  perform public.cash_book_refresh_from(p_store, p_date + 1);
end $$;

create or replace function public.cash_book_review_day(p_store uuid, p_date date, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days;
begin
  if not coalesce(public.can_access_store(p_store), false) then raise exception 'Only the owner or the store manager can check a day.'; end if;
  update public.cash_book_days set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where store_id = p_store and book_date = p_date and status = 'closed' returning * into d;
  if d.id is null then raise exception 'Only a closed day can be marked as checked.'; end if;
  perform public.cash_book_log(p_store, p_date, d.id, 'review', p_note, null, null);
end $$;

-- Software Sales correction for the cash book only (uploaded rows unchanged).
create function public.cash_book_override_software(p_store uuid, p_date date, p_amount numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; rep jsonb; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_id uuid;
begin
  if not public.cash_book_can_override(p_store, p_date) then
    raise exception 'Only the owner or an accountant allowed to correct Software Sales can change it.';
  end if;
  if length(coalesce(v_reason, '')) < 5 then raise exception 'Write why the report figure is being corrected.'; end if;
  if length(v_reason) > 500 then raise exception 'The reason is too long.'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000 or round(p_amount, 2) <> p_amount then
    raise exception 'Enter the corrected Software Sales in rupees.';
  end if;
  d := public.cash_book_open_day(p_store, p_date);
  select * into d from public.cash_book_days where id = d.id for update;
  if d.status <> 'open' then raise exception 'This day is closed. The owner must reopen it before Software Sales can be changed.'; end if;
  rep := public.cash_book_software(p_store, p_date);
  update public.cash_book_software_overrides set restored_at = now(), restored_by = auth.uid(), restore_reason = 'Replaced by a newer correction'
  where day_id = d.id and restored_at is null;
  insert into public.cash_book_software_overrides(day_id, store_id, book_date, report_status, report_amount, report_ids, corrected_amount, reason, created_by)
  values (d.id, p_store, p_date, rep->>'status', (rep->>'amount')::numeric, coalesce(rep->'report_ids', '[]'::jsonb), p_amount, v_reason, auth.uid())
  returning id into v_id;
  update public.cash_book_days set revision = revision + 1, updated_by = auth.uid(), updated_at = now() where id = d.id;
  perform public.cash_book_log(p_store, p_date, d.id, 'override_software', v_reason,
    jsonb_build_object('report_status', rep->>'status', 'report_amount', rep->'amount'), jsonb_build_object('corrected', p_amount), v_id);
  return public.cash_book_row(p_store, p_date);
end $$;

create function public.cash_book_restore_software(p_store uuid, p_date date, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; o public.cash_book_software_overrides;
begin
  if not public.cash_book_can_override(p_store, p_date) then
    raise exception 'Only the owner or an accountant allowed to correct Software Sales can change it.';
  end if;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date for update;
  if d.id is null then raise exception 'There is no correction on this day.'; end if;
  if d.status <> 'open' then raise exception 'This day is closed. The owner must reopen it before Software Sales can be changed.'; end if;
  update public.cash_book_software_overrides set restored_at = now(), restored_by = auth.uid(),
    restore_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Report value restored')
  where day_id = d.id and restored_at is null returning * into o;
  if o.id is null then raise exception 'There is no correction on this day.'; end if;
  update public.cash_book_days set revision = revision + 1, updated_by = auth.uid(), updated_at = now() where id = d.id;
  perform public.cash_book_log(p_store, p_date, d.id, 'restore_software', p_reason, to_jsonb(o), null, o.id);
  return public.cash_book_row(p_store, p_date);
end $$;

-- An expense paid by UPI or bank transfer: recorded once in store_expenses
-- (the "Other expenses" record) and never deducted from drawer cash.
create function public.cash_book_add_paid_expense(p_store uuid, p_date date, p_category text, p_amount numeric, p_paid_from text,
  p_note text default null, p_reference text default null, p_client_key uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.cash_book_can_edit(p_store, p_date) then raise exception 'You cannot change the cash book for this day.'; end if;
  if p_paid_from not in ('upi', 'bank') then raise exception 'Choose how it was paid (UPI or bank).'; end if;
  if p_category is null then raise exception 'Choose the expense type.'; end if;
  if p_category = 'other' and length(coalesce(v_note, '')) < 3 then raise exception 'Write what this money was for.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 or round(p_amount, 2) <> p_amount then raise exception 'Enter the amount in rupees.'; end if;
  if p_client_key is not null then
    select id into v_id from public.store_expenses where store_id = p_store and client_key = p_client_key;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.store_expenses(store_id, expense_date, category, amount, paid_from, note, reference, client_key, created_by)
  values (p_store, p_date, p_category, round(p_amount, 2), p_paid_from, v_note, nullif(btrim(coalesce(p_reference, '')), ''), p_client_key, auth.uid())
  on conflict (store_id, client_key) where client_key is not null do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.store_expenses where store_id = p_store and client_key = p_client_key; end if;
  perform public.cash_book_log(p_store, p_date, null, 'add_paid_expense', null, null,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'paid_from', p_paid_from), v_id);
  return v_id;
end $$;

-- Owner: reopens a day and every later closed day in one step (latest
-- first), with one reason recorded on each, so an old day can be corrected.
create function public.cash_book_reopen_from(p_store uuid, p_date date, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer := 0; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_owner() then raise exception 'Only the owner can reopen a closed day.'; end if;
  if length(coalesce(v_reason, '')) < 5 then raise exception 'Write why the days are being reopened.'; end if;
  if not exists (select 1 from public.cash_book_days where store_id = p_store and book_date = p_date and status <> 'open') then
    raise exception 'This day is not closed.';
  end if;
  for r in select book_date from public.cash_book_days where store_id = p_store and book_date >= p_date and status <> 'open'
           order by book_date desc for update loop
    perform public.cash_book_reopen_day(p_store, r.book_date,
      v_reason || case when r.book_date <> p_date then ' (reopened with ' || to_char(p_date, 'DD Mon YYYY') || ')' else '' end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Closes open days in date order up to p_to, stopping at the first day that
-- cannot be closed (and saying why). Each close is the normal close.
create function public.cash_book_close_through(p_store uuid, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer := 0; v_stop date; v_why text;
begin
  for r in select book_date from public.cash_book_days where store_id = p_store and book_date <= p_to and status = 'open' order by book_date loop
    begin
      perform public.cash_book_close(p_store, r.book_date, null);
      v_count := v_count + 1;
    exception when raise_exception then
      v_stop := r.book_date; v_why := sqlerrm;
      exit;
    end;
  end loop;
  return jsonb_build_object('closed', v_count, 'stopped_at', v_stop, 'reason', v_why);
end $$;

-- ---------------------------------------------------------------- day detail
create or replace function public.cash_book_day(p_store uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.cash_book_days; s public.cash_book_starts; v_hide boolean := public.is_cashier();
begin
  if p_store is null or p_date is null or not public.cash_book_can_view(p_store, p_date) then raise exception 'Store access denied.'; end if;
  select * into s from public.cash_book_starts where store_id = p_store;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date;
  return public.cash_book_row(p_store, p_date) || jsonb_build_object(
    'start', case when s.store_id is null then null else jsonb_build_object('date', s.start_date, 'opening', s.opening_balance) end,
    'blocked', case when s.store_id is null then 'not_started' when p_date < s.start_date then 'before_start' end,
    -- Kept for the store checklist and older screens.
    'sale', d.sale_amount, 'review_note', d.review_note,
    'report_uploaded', public.cash_book_software(p_store, p_date)->>'status' = 'ready',
    'report_sale', case when v_hide then null else (public.cash_book_software(p_store, p_date)->>'amount')::numeric end,
    'report_matches', case when d.sale_amount is null or public.cash_book_software(p_store, p_date)->>'status' <> 'ready' then null
      else abs((public.cash_book_software(p_store, p_date)->>'amount')::numeric - d.sale_amount) <= 1 end,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.entry_type, 'direction', e.direction, 'category', e.category,
        'amount', e.amount, 'note', e.note, 'reference', e.reference, 'staff_name', e.staff_name,
        'other_store', (select name from public.stores where id = e.other_store_id),
        'transfer_status', (select status from public.cash_transfers where id = e.transfer_id),
        'by', (select full_name from public.profiles where id = e.created_by), 'mine', e.created_by = auth.uid(),
        'at', e.created_at) order by e.created_at)
      from public.cash_book_entries e where e.day_id = d.id), '[]'::jsonb),
    'paid_expenses', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'category', x.category, 'amount', x.amount, 'paid_from', x.paid_from,
        'note', x.note, 'reference', x.reference, 'status', x.status,
        'by', (select full_name from public.profiles where id = x.created_by)) order by x.created_at)
      from public.store_expenses x where x.store_id = p_store and x.expense_date = p_date and x.paid_from in ('upi', 'bank')), '[]'::jsonb),
    'overrides', case when v_hide then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'original', o.report_amount, 'original_status', o.report_status,
        'corrected', o.corrected_amount, 'reason', o.reason, 'by', (select full_name from public.profiles where id = o.created_by),
        'at', o.created_at, 'restored_by', (select full_name from public.profiles where id = o.restored_by),
        'restored_at', o.restored_at, 'restore_reason', o.restore_reason) order by (o.restored_at is null) desc, o.created_at desc, o.restored_at desc)
      from public.cash_book_software_overrides o where o.day_id = d.id), '[]'::jsonb) end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('action', ev.action, 'reason', ev.reason, 'at', ev.created_at, 'role', ev.actor_role,
        'by', (select full_name from public.profiles where id = ev.actor_id)) order by ev.id desc)
      from (select * from public.cash_book_events ev where ev.store_id = p_store and ev.book_date = p_date
            order by ev.id desc limit 30) ev), '[]'::jsonb),
    'incoming', case when not coalesce(public.can_work_store(p_store), false) and not public.cash_book_grant_allows('enter', p_store, p_date)
      then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'from', (select name from public.stores where id = t.from_store_id),
        'amount', t.amount, 'sent_date', t.sent_date, 'note', t.note) order by t.sent_date)
      from public.cash_transfers t where t.to_store_id = p_store and t.status = 'sent'), '[]'::jsonb) end
  );
end $$;

create or replace function public.cash_book_other_stores(p_store uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
  from public.stores where public.cash_book_can_view(p_store, public.india_today()) and is_active and id <> p_store
$$;

-- Staff names for staff payments (accountants with an entry grant included).
create function public.cash_book_staff(p_store uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', staff_name) order by staff_name), '[]'::jsonb)
  from public.employee_contacts
  where store_id = p_store and is_active is distinct from false
    and (coalesce(public.can_work_store(p_store), false) or public.cash_book_grant_allows('enter', p_store, public.india_today()))
$$;

-- ---------------------------------------------------------------- legacy import
-- Imports a closed historical period from a workbook whose daily deduction
-- combines payment collections and expenses (no split available). Every day
-- must chain exactly: opening = previous closing; closing = opening + Book
-- Sales + cash in - combined deduction. p_dry_run validates without writing.
-- Idempotent: the same file for the same store returns 'already_imported'.
create function public.cash_book_import_legacy(p_store uuid, p_source jsonb, p_days jsonb, p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_from date; v_to date; v_open numeric; v_close numeric; v_sha text; s public.cash_book_starts;
  r jsonb; v_prev numeric; v_date date; v_expect date; v_b numeric; v_ded numeric; v_in numeric; v_cl numeric; v_op numeric;
  v_sw numeric; v_tb numeric := 0; v_td numeric := 0; v_ts numeric := 0; v_ti numeric := 0; v_neg jsonb := '[]'::jsonb;
  v_import uuid; v_day uuid; v_count int; v_next public.cash_book_days; v_existing public.cash_book_imports; v_flags jsonb;
  v_fixes jsonb := coalesce(p_source->'corrections', '[]'::jsonb); c jsonb; v_fix jsonb;
begin
  if public.is_owner() then v_actor := auth.uid();
  elsif coalesce(auth.role(), '') = 'service_role' then
    v_actor := nullif(p_source->>'imported_by', '')::uuid;
    if not exists (select 1 from public.profiles where id = v_actor and role = 'owner' and is_active) then
      raise exception 'imported_by must be an active owner.';
    end if;
  else raise exception 'Only the owner can import an old cash book.'; end if;
  if not exists (select 1 from public.stores where id = p_store and is_active) then raise exception 'Store not found.'; end if;
  v_sha := lower(p_source->>'sha256');
  if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then raise exception 'The workbook fingerprint (sha256) is missing.'; end if;
  select * into v_existing from public.cash_book_imports where store_id = p_store and source_sha256 = v_sha;
  if v_existing.id is not null then
    return jsonb_build_object('status', 'already_imported', 'import_id', v_existing.id, 'imported_at', v_existing.imported_at,
      'period_from', v_existing.period_from, 'period_to', v_existing.period_to);
  end if;
  v_from := (p_source->>'period_from')::date; v_to := (p_source->>'period_to')::date;
  v_open := (p_source->>'opening')::numeric; v_close := (p_source->>'closing')::numeric;
  if v_from is null or v_to is null or v_to < v_from or v_to >= public.india_today() then raise exception 'Invalid period.'; end if;
  if v_open is null or v_open < 0 or v_close is null then raise exception 'Opening and closing balances are required.'; end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> (v_to - v_from + 1) then
    raise exception 'Expected % days from % to %, got %.', v_to - v_from + 1, v_from, v_to, coalesce(jsonb_array_length(p_days), 0);
  end if;
  if exists (select 1 from public.cash_book_days where store_id = p_store and book_date between v_from and v_to) then
    raise exception 'The app already has cash book days in this period; nothing was imported.';
  end if;
  select * into s from public.cash_book_starts where store_id = p_store;
  if s.store_id is not null and not (
       (s.start_date = v_from and s.opening_balance = v_open)
    or (s.start_date = v_to + 1 and s.opening_balance = v_close)) then
    raise exception 'This store''s cash book already starts on % with %; it does not join this import.', s.start_date, s.opening_balance;
  end if;
  if exists (select 1 from public.cash_book_days where store_id = p_store and book_date < v_from) then
    raise exception 'The app has days before this period.';
  end if;

  v_prev := v_open; v_expect := v_from;
  for r in select value from jsonb_array_elements(p_days) loop
    v_date := (r->>'date')::date;
    if v_date is distinct from v_expect then raise exception 'Day % is missing or out of order.', v_expect; end if;
    v_op := (r->>'opening')::numeric; v_b := (r->>'book_sales')::numeric; v_ded := (r->>'combined_deduction')::numeric;
    v_in := coalesce((r->>'cash_in')::numeric, 0); v_cl := (r->>'closing')::numeric; v_sw := (r->>'software_sales')::numeric;
    if v_b is null or v_ded is null or v_cl is null or v_op is null then raise exception 'Day %: Opening, Book Sales, Expenses and Closing are required (0 for none).', v_date; end if;
    if v_b < 0 or v_ded < 0 or v_in < 0 or v_sw < 0 then raise exception 'Day %: negative amounts are not expected.', v_date; end if;
    if v_op <> v_prev then raise exception 'Day %: opening % does not equal the previous closing %.', v_date, v_op, v_prev; end if;
    if v_op + v_b + v_in - v_ded <> v_cl then raise exception 'Day %: % + % + % - % is not the closing %.', v_date, v_op, v_b, v_in, v_ded, v_cl; end if;
    if v_cl < 0 then v_neg := v_neg || to_jsonb(v_date); end if;
    v_tb := v_tb + v_b; v_td := v_td + v_ded; v_ti := v_ti + v_in; v_ts := v_ts + coalesce(v_sw, 0);
    v_prev := v_cl; v_expect := v_expect + 1;
  end loop;
  if v_prev <> v_close then raise exception 'The last day closes at %, not %.', v_prev, v_close; end if;
  if p_source->'totals' ? 'book_sales' and (p_source->'totals'->>'book_sales')::numeric <> v_tb then
    raise exception 'Book Sales total % does not match the workbook total %.', v_tb, p_source->'totals'->>'book_sales'; end if;
  if p_source->'totals' ? 'combined_deduction' and (p_source->'totals'->>'combined_deduction')::numeric <> v_td then
    raise exception 'Expenses total % does not match the workbook total %.', v_td, p_source->'totals'->>'combined_deduction'; end if;
  if p_source->'totals' ? 'software_sales' and (p_source->'totals'->>'software_sales')::numeric <> v_ts then
    raise exception 'Software Sales total % does not match the workbook total %.', v_ts, p_source->'totals'->>'software_sales'; end if;
  -- Owner-stated corrections of typing errors in the workbook: Software Sales
  -- only (it changes no balance); the workbook value, the corrected value and
  -- the reason are kept, and the day is marked.
  if jsonb_typeof(v_fixes) <> 'array' then raise exception 'Corrections must be a list.'; end if;
  for c in select value from jsonb_array_elements(v_fixes) loop
    if c->>'field' is distinct from 'software_sales' then raise exception 'Only Software Sales can be corrected in an import.'; end if;
    if length(btrim(coalesce(c->>'reason', ''))) < 5 then raise exception 'Correction for %: write the reason.', c->>'date'; end if;
    if (c->>'workbook_value') is null or (c->>'corrected_value') is null or (c->>'corrected_value')::numeric < 0 then
      raise exception 'Correction for %: workbook and corrected values are required.', c->>'date';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_days) d where d->>'date' = c->>'date'
                   and (d->>'software_sales')::numeric = (c->>'corrected_value')::numeric) then
      raise exception 'Correction for % does not match the day sent.', c->>'date';
    end if;
    if (select count(*) from jsonb_array_elements(v_fixes) x where x->>'date' = c->>'date') > 1 then
      raise exception 'Day % is corrected twice.', c->>'date';
    end if;
  end loop;
  if jsonb_array_length(v_fixes) > 0 and (p_source->'totals'->>'software_sales_workbook')::numeric
       <> v_ts - (select sum((x->>'corrected_value')::numeric - (x->>'workbook_value')::numeric) from jsonb_array_elements(v_fixes) x) then
    raise exception 'The corrections do not explain the difference from the workbook''s Software Sales total.';
  end if;
  select * into v_next from public.cash_book_days where store_id = p_store and book_date = v_to + 1;
  if v_next.id is not null and v_next.status <> 'open' and v_next.opening_balance <> v_close then
    raise exception 'The closed day % opened with %, not the imported closing %.', v_to + 1, v_next.opening_balance, v_close;
  end if;

  if p_dry_run then
    return jsonb_build_object('status', 'valid', 'days', v_to - v_from + 1, 'opening', v_open, 'closing', v_close,
      'book_sales', v_tb, 'combined_deduction', v_td, 'cash_in', v_ti, 'software_sales', v_ts,
      'software_sales_workbook', coalesce((p_source->'totals'->>'software_sales_workbook')::numeric, v_ts), 'corrections', v_fixes, 'negative_days', v_neg,
      'start_action', case when s.store_id is null then 'create' when s.start_date = v_from then 'keep' else 'move_back' end);
  end if;

  insert into public.cash_book_imports(store_id, source_sha256, file_name, sheet, period_from, period_to, opening, closing, totals, day_count, imported_by)
  values (p_store, v_sha, coalesce(p_source->>'file_name', 'workbook'), coalesce(p_source->>'sheet', 'sheet'), v_from, v_to, v_open, v_close,
    jsonb_build_object('book_sales', v_tb, 'combined_deduction', v_td, 'cash_in', v_ti, 'software_sales', v_ts,
      'software_sales_workbook', coalesce((p_source->'totals'->>'software_sales_workbook')::numeric, v_ts), 'corrections', v_fixes, 'negative_days', v_neg),
    jsonb_array_length(p_days), v_actor)
  returning id into v_import;
  insert into public.cash_book_starts(store_id, start_date, opening_balance, set_by) values (p_store, v_from, v_open, v_actor)
  on conflict (store_id) do update set start_date = excluded.start_date, opening_balance = excluded.opening_balance, set_by = v_actor, set_at = now();

  for r in select value from jsonb_array_elements(p_days) loop
    v_date := (r->>'date')::date; v_cl := (r->>'closing')::numeric;
    select x into v_fix from jsonb_array_elements(v_fixes) x where x->>'date' = r->>'date';
    v_flags := '["legacy_import"]'::jsonb
      || case when v_fix is not null then '["workbook_corrected"]'::jsonb else '[]'::jsonb end
      || case when (r->>'software_sales') is not null and abs((r->>'software_sales')::numeric - (r->>'book_sales')::numeric) > 100000
              then '["workbook_software_outlier"]'::jsonb else '[]'::jsonb end;
    insert into public.cash_book_days(store_id, book_date, opening_balance, sale_amount, closing_balance, counted_cash, status,
      note, closed_by, closed_at, opening_rule, source, import_id, legacy_software_sales, software_at_close, flags, updated_by, updated_at)
    values (p_store, v_date, (r->>'opening')::numeric, (r->>'book_sales')::numeric, v_cl, null, 'closed',
      left('Imported from ' || coalesce(p_source->>'file_name', 'workbook') || ' (' || coalesce(p_source->>'sheet', '') || '). No counted cash in the workbook.'
        || case when v_fix is not null then ' Software Sales corrected from ' || (v_fix->>'workbook_value') || ' to ' || (v_fix->>'corrected_value')
             || ': ' || (v_fix->>'reason') else '' end, 500),
      v_actor, now(), case when v_date = v_from then 'start' else 'legacy_import' end, 'legacy_import', v_import,
      (r->>'software_sales')::numeric,
      public.cash_book_software_effective(p_store, v_date)
        || case when (r->>'software_sales') is not null then jsonb_build_object('source', 'workbook', 'amount', (r->>'software_sales')::numeric) else '{}'::jsonb end,
      v_flags, v_actor, now())
    returning id into v_day;
    if (r->>'combined_deduction')::numeric > 0 then
      insert into public.cash_book_entries(day_id, store_id, book_date, entry_type, amount, note, created_by)
      values (v_day, p_store, v_date, 'legacy_combined', (r->>'combined_deduction')::numeric,
        'Legacy combined deduction (payments + expenses, no split in the workbook)', v_actor);
    end if;
    if coalesce((r->>'cash_in')::numeric, 0) > 0 then
      insert into public.cash_book_entries(day_id, store_id, book_date, entry_type, amount, note, created_by)
      values (v_day, p_store, v_date, 'cash_in', (r->>'cash_in')::numeric, 'Imported cash received', v_actor);
    end if;
  end loop;
  insert into public.cash_book_events(store_id, book_date, action, entity_id, actor_id, actor_role, reason, after)
  values (p_store, v_from, 'legacy_import', v_import, v_actor, 'owner', 'Imported ' || coalesce(p_source->>'file_name', 'workbook'),
    jsonb_build_object('period_from', v_from, 'period_to', v_to, 'opening', v_open, 'closing', v_close, 'sha256', v_sha));
  perform public.cash_book_refresh_from(p_store, v_to + 1);
  select count(*) into v_count from public.cash_book_days where import_id = v_import;
  return jsonb_build_object('status', 'imported', 'import_id', v_import, 'days', v_count, 'opening', v_open, 'closing', v_close,
    'book_sales', v_tb, 'combined_deduction', v_td, 'negative_days', v_neg);
end $$;

create function public.cash_book_import_list(p_store uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'file_name', i.file_name, 'sheet', i.sheet, 'period_from', i.period_from,
    'period_to', i.period_to, 'opening', i.opening, 'closing', i.closing, 'totals', i.totals, 'imported_at', i.imported_at,
    'by', (select full_name from public.profiles where id = i.imported_by)) order by i.period_from), '[]'::jsonb)
  from public.cash_book_imports i where i.store_id = p_store and public.cash_book_can_view(p_store, i.period_to)
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.cash_book_opening_rule(date), public.cash_book_grant_allows(text, uuid, date),
  public.cash_book_can_view(uuid, date), public.cash_book_can_override(uuid, date),
  public.cash_book_log(uuid, date, uuid, text, text, jsonb, jsonb, uuid), public.cash_book_amount(jsonb, text),
  public.cash_book_software(uuid, date), public.cash_book_software_effective(uuid, date), public.cash_book_figures(public.cash_book_days),
  public.cash_book_expected_opening(uuid, date), public.cash_book_refresh_from(uuid, date), public.cash_book_row(uuid, date),
  public.cash_book_software_day(uuid, date),
  public.cash_book_can_edit(uuid, date), public.cash_book_open_day(uuid, date)
  from public, anon, authenticated;
revoke all on function public.cash_book_month(uuid, date), public.cash_book_stores(), public.cash_book_reopen_from(uuid, date, text), public.cash_book_close_through(uuid, date), public.cash_book_save_day(uuid, date, jsonb, integer),
  public.cash_book_add_entry(uuid, date, text, numeric, text, text, uuid, uuid, text, uuid), public.cash_book_delete_entry(uuid, text),
  public.cash_book_close(uuid, date, integer), public.cash_book_reopen_day(uuid, date, text),
  public.cash_book_override_software(uuid, date, numeric, text), public.cash_book_restore_software(uuid, date, text),
  public.cash_book_add_paid_expense(uuid, date, text, numeric, text, text, text, uuid), public.cash_book_staff(uuid),
  public.cash_book_import_legacy(uuid, jsonb, jsonb, boolean), public.cash_book_import_list(uuid)
  from public, anon;
grant execute on function public.cash_book_month(uuid, date), public.cash_book_stores(), public.cash_book_reopen_from(uuid, date, text), public.cash_book_close_through(uuid, date), public.cash_book_save_day(uuid, date, jsonb, integer),
  public.cash_book_add_entry(uuid, date, text, numeric, text, text, uuid, uuid, text, uuid), public.cash_book_delete_entry(uuid, text),
  public.cash_book_close(uuid, date, integer), public.cash_book_reopen_day(uuid, date, text),
  public.cash_book_override_software(uuid, date, numeric, text), public.cash_book_restore_software(uuid, date, text),
  public.cash_book_add_paid_expense(uuid, date, text, numeric, text, text, text, uuid), public.cash_book_staff(uuid),
  public.cash_book_import_legacy(uuid, jsonb, jsonb, boolean), public.cash_book_import_list(uuid)
  to authenticated;
grant execute on function public.cash_book_import_legacy(uuid, jsonb, jsonb, boolean) to service_role;

commit;
