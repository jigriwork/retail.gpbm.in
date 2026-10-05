-- Cash book: the cashier's daily book, as kept on paper today.
--   OB (yesterday's counted cash) + Sale (Logic total, typed at closing)
--   + cash received - EDC - expenses - staff - owner - home - donations
--   - bank deposit - cash sent to the other store = CB (book);
--   the cashier counts the drawer and the difference is shown.
-- Days close in order; the next day opens with the counted cash. Cashiers
-- and managers work on the last 3 days; the owner on any day and is the
-- only one who can reopen. Cash sent to the other store waits there until
-- that store confirms it. Bank days are Mon-Fri except marked holidays.
-- Reads and writes go through the functions below (no direct table access).
begin;

create table public.cash_book_starts (
  store_id uuid primary key references public.stores(id),
  start_date date not null,
  opening_balance numeric(12,2) not null check (opening_balance >= 0),
  set_by uuid default auth.uid() references public.profiles(id),
  set_at timestamptz not null default now()
);

create table public.cash_book_days (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  book_date date not null,
  opening_balance numeric(12,2) not null,
  sale_amount numeric(12,2) check (sale_amount is null or sale_amount >= 0),
  closing_balance numeric(12,2),
  counted_cash numeric(12,2) check (counted_cash is null or counted_cash >= 0),
  status text not null default 'open' check (status in ('open', 'closed', 'reviewed')),
  note text check (note is null or length(note) <= 500),
  review_note text check (review_note is null or length(review_note) <= 500),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, book_date)
);

create table public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  from_store_id uuid not null references public.stores(id),
  to_store_id uuid not null references public.stores(id),
  amount numeric(12,2) not null check (amount > 0),
  sent_date date not null,
  status text not null default 'sent' check (status in ('sent', 'received', 'cancelled')),
  received_date date,
  received_by uuid references public.profiles(id),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  check (from_store_id <> to_store_id)
);

create table public.cash_book_entries (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.cash_book_days(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  book_date date not null,
  entry_type text not null check (entry_type in (
    'cash_in', 'from_store',
    'edc', 'expense', 'staff_payment', 'owner', 'home', 'donation', 'bank_deposit', 'to_store', 'other_out')),
  direction text generated always as (case when entry_type in ('cash_in', 'from_store') then 'in' else 'out' end) stored,
  category text check (category is null or category in (
    'tea_snacks', 'food', 'water', 'transport', 'courier', 'repairs', 'packaging', 'cleaning', 'stationery',
    'alteration', 'electricity', 'rent', 'staff_room', 'security', 'internet_phone', 'marketing', 'pooja',
    'staff_welfare', 'other')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  note text check (note is null or length(note) <= 300),
  employee_id uuid references public.employee_contacts(id),
  staff_name text check (staff_name is null or length(staff_name) <= 80),
  other_store_id uuid references public.stores(id),
  transfer_id uuid references public.cash_transfers(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (entry_type <> 'expense' or category is not null)
);
create index cash_book_entries_day_idx on public.cash_book_entries(day_id);
create index cash_book_entries_store_date_idx on public.cash_book_entries(store_id, book_date);
create index cash_transfers_to_idx on public.cash_transfers(to_store_id, status);

create table public.bank_holidays (
  day date primary key,
  note text check (note is null or length(note) <= 80),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.cash_book_starts enable row level security;
alter table public.cash_book_days enable row level security;
alter table public.cash_transfers enable row level security;
alter table public.cash_book_entries enable row level security;
alter table public.bank_holidays enable row level security;
revoke all on public.cash_book_starts, public.cash_book_days, public.cash_transfers, public.cash_book_entries, public.bank_holidays
  from anon, authenticated;

-- ---------------------------------------------------------------- helpers
create function public.cash_is_bank_day(p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select extract(isodow from p_day) between 1 and 5 and not exists (select 1 from public.bank_holidays h where h.day = p_day)
$$;

-- Owner any day; managers and cashiers of the store the last 3 days.
create function public.cash_book_can_edit(p_store uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_store is not null and p_date is not null and coalesce(public.can_work_store(p_store), false)
    and p_date <= public.india_today() and (public.is_owner() or p_date >= public.india_today() - 3)
$$;

-- The day's row, created in order: the start day opens with the owner's
-- opening cash, every later day with the previous day's counted cash.
create function public.cash_book_open_day(p_store uuid, p_date date) returns public.cash_book_days
language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; s public.cash_book_starts; prev public.cash_book_days; v_opening numeric;
begin
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date;
  if found then return d; end if;
  select * into s from public.cash_book_starts where store_id = p_store;
  if s.store_id is null then raise exception 'The owner has to set the cash book start (date and opening cash) first.'; end if;
  if p_date < s.start_date then raise exception 'This store''s cash book starts on %.', to_char(s.start_date, 'DD Mon YYYY'); end if;
  if p_date > public.india_today() then raise exception 'A future day cannot be opened.'; end if;
  if p_date = s.start_date then
    v_opening := s.opening_balance;
  else
    select * into prev from public.cash_book_days where store_id = p_store and book_date = p_date - 1;
    if prev.id is null or prev.status = 'open' then
      raise exception 'Close % first: each day starts with the previous day''s counted cash.', to_char(p_date - 1, 'DD Mon');
    end if;
    v_opening := prev.counted_cash;
  end if;
  insert into public.cash_book_days(store_id, book_date, opening_balance) values (p_store, p_date, v_opening)
  on conflict (store_id, book_date) do nothing;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date;
  return d;
end $$;

create function public.cash_book_report_sale(p_store uuid, p_date date) returns numeric
language sql stable security definer set search_path = '' as $$
  select sum(x.net_sale) from public.sales_rows x
  join public.reports r on r.id = x.report_id and r.is_current and r.status = 'processed' and r.report_type = 'sales'
  where r.store_id = p_store and r.report_date = p_date and x.line_kind in ('item', 'summary')
$$;

-- ---------------------------------------------------------------- writes
create function public.cash_book_set_start(p_store uuid, p_date date, p_opening numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owner sets where the cash book starts.'; end if;
  if p_date is null or p_date > public.india_today() then raise exception 'Choose the first day of the cash book (today or earlier).'; end if;
  if p_opening is null or p_opening < 0 then raise exception 'Enter the opening cash (OB) for that day.'; end if;
  if exists (select 1 from public.cash_book_days where store_id = p_store and status <> 'open') then
    raise exception 'Days are already closed in this cash book; the start can no longer be changed.';
  end if;
  delete from public.cash_book_days d where d.store_id = p_store
    and not exists (select 1 from public.cash_book_entries e where e.day_id = d.id);
  if exists (select 1 from public.cash_book_days where store_id = p_store) then
    raise exception 'Remove the entries of the open day first, then change the start.';
  end if;
  insert into public.cash_book_starts(store_id, start_date, opening_balance) values (p_store, p_date, round(p_opening, 2))
  on conflict (store_id) do update set start_date = excluded.start_date, opening_balance = excluded.opening_balance,
    set_by = auth.uid(), set_at = now();
end $$;

create function public.cash_book_add_entry(
  p_store uuid, p_date date, p_type text, p_amount numeric,
  p_category text default null, p_note text default null, p_employee uuid default null, p_other_store uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; v_id uuid; v_staff text; v_transfer uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.cash_book_can_edit(p_store, p_date) then
    raise exception 'You cannot change the cash book for this day. Older days can be changed only by the owner.';
  end if;
  if p_type not in ('cash_in', 'edc', 'expense', 'staff_payment', 'owner', 'home', 'donation', 'bank_deposit', 'to_store', 'other_out') then
    raise exception 'Choose what the money was for.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then raise exception 'Enter the amount in rupees.'; end if;
  if p_type = 'expense' and p_category is null then raise exception 'Choose the expense type.'; end if;
  if p_type <> 'expense' and p_category is not null then raise exception 'Only expenses have an expense type.'; end if;
  if (p_type in ('cash_in', 'other_out') or p_category = 'other') and length(coalesce(v_note, '')) < 3 then
    raise exception 'Write what this money was for.';
  end if;
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
  if d.status <> 'open' then raise exception 'This day is closed. Ask the owner to reopen it.'; end if;

  if p_type = 'to_store' then
    insert into public.cash_transfers(from_store_id, to_store_id, amount, sent_date, note)
    values (p_store, p_other_store, round(p_amount, 2), p_date, v_note) returning id into v_transfer;
  end if;
  insert into public.cash_book_entries(day_id, store_id, book_date, entry_type, category, amount, note, employee_id, staff_name, other_store_id, transfer_id)
  values (d.id, p_store, p_date, p_type, p_category, round(p_amount, 2), v_note, p_employee, v_staff, p_other_store, v_transfer)
  returning id into v_id;
  return v_id;
end $$;

create function public.cash_book_delete_entry(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.cash_book_entries; d public.cash_book_days; t public.cash_transfers;
begin
  select * into e from public.cash_book_entries where id = p_entry;
  if e.id is null then raise exception 'Entry not found.'; end if;
  select * into d from public.cash_book_days where id = e.day_id for update;
  if not public.cash_book_can_edit(e.store_id, e.book_date) then raise exception 'You cannot change the cash book for this day.'; end if;
  if d.status <> 'open' then raise exception 'This day is closed. Ask the owner to reopen it.'; end if;
  if not (coalesce(public.can_access_store(e.store_id), false) or e.created_by = auth.uid()) then
    raise exception 'Only the person who entered it, the manager or the owner can remove it.';
  end if;
  if e.transfer_id is not null then
    select * into t from public.cash_transfers where id = e.transfer_id for update;
    if e.entry_type = 'to_store' then
      if t.status = 'received' then raise exception 'The other store has already received this cash; it cannot be removed here.'; end if;
      delete from public.cash_book_entries where id = e.id;
      update public.cash_transfers set status = 'cancelled' where id = t.id;
      return;
    else
      update public.cash_transfers set status = 'sent', received_date = null, received_by = null where id = t.id;
    end if;
  end if;
  delete from public.cash_book_entries where id = e.id;
end $$;

-- The receiving store confirms cash sent by the other store; it is added
-- to that store's open day.
create function public.cash_book_receive_transfer(p_transfer uuid, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.cash_transfers; d public.cash_book_days; v_id uuid;
begin
  select * into t from public.cash_transfers where id = p_transfer for update;
  if t.id is null or t.status <> 'sent' then raise exception 'This cash is not waiting to be received.'; end if;
  if not public.cash_book_can_edit(t.to_store_id, p_date) then raise exception 'You cannot change the cash book for this day.'; end if;
  if p_date < t.sent_date then raise exception 'Cash cannot be received before it was sent.'; end if;
  d := public.cash_book_open_day(t.to_store_id, p_date);
  if d.status <> 'open' then raise exception 'This day is closed. Ask the owner to reopen it.'; end if;
  insert into public.cash_book_entries(day_id, store_id, book_date, entry_type, amount, note, other_store_id, transfer_id)
  values (d.id, t.to_store_id, p_date, 'from_store', t.amount, t.note, t.from_store_id, t.id) returning id into v_id;
  update public.cash_transfers set status = 'received', received_date = p_date, received_by = auth.uid() where id = t.id;
  return v_id;
end $$;

create function public.cash_book_close_day(p_store uuid, p_date date, p_sale numeric, p_counted numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.cash_book_days; v_in numeric; v_out numeric; v_closing numeric;
begin
  if not public.cash_book_can_edit(p_store, p_date) then
    raise exception 'You cannot change the cash book for this day. Older days can be changed only by the owner.';
  end if;
  if p_sale is null or p_sale < 0 then raise exception 'Enter the day''s total sale from Logic.'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Count the cash in the drawer and enter it.'; end if;
  d := public.cash_book_open_day(p_store, p_date);
  select * into d from public.cash_book_days where id = d.id for update;
  if d.status <> 'open' then raise exception 'This day is already closed.'; end if;
  select coalesce(sum(amount) filter (where direction = 'in'), 0), coalesce(sum(amount) filter (where direction = 'out'), 0)
  into v_in, v_out from public.cash_book_entries where day_id = d.id;
  v_closing := d.opening_balance + round(p_sale, 2) + v_in - v_out;
  update public.cash_book_days set sale_amount = round(p_sale, 2), counted_cash = round(p_counted, 2), closing_balance = v_closing,
    status = 'closed', note = nullif(btrim(coalesce(p_note, '')), ''), closed_by = auth.uid(), closed_at = now()
  where id = d.id;
  -- A day already opened after a reopen starts from the new counted cash.
  update public.cash_book_days set opening_balance = round(p_counted, 2)
  where store_id = p_store and book_date = p_date + 1 and status = 'open';
  return jsonb_build_object('closing', v_closing, 'counted', round(p_counted, 2), 'difference', round(p_counted, 2) - v_closing);
end $$;

create function public.cash_book_reopen_day(p_store uuid, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can reopen a closed day.'; end if;
  if exists (select 1 from public.cash_book_days where store_id = p_store and book_date > p_date and status <> 'open') then
    raise exception 'Later days are closed. Reopen the latest closed day first.';
  end if;
  update public.cash_book_days set status = 'open', closed_by = null, closed_at = null, reviewed_by = null, reviewed_at = null
  where store_id = p_store and book_date = p_date and status <> 'open';
  if not found then raise exception 'This day is not closed.'; end if;
end $$;

create function public.cash_book_review_day(p_store uuid, p_date date, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.can_access_store(p_store), false) then raise exception 'Only the owner or the store manager can check a day.'; end if;
  update public.cash_book_days set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '')
  where store_id = p_store and book_date = p_date and status = 'closed';
  if not found then raise exception 'Only a closed day can be marked as checked.'; end if;
end $$;

create function public.cash_book_set_holiday(p_day date, p_note text, p_remove boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owner marks bank holidays.'; end if;
  if p_remove then delete from public.bank_holidays where day = p_day; return; end if;
  insert into public.bank_holidays(day, note) values (p_day, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (day) do update set note = excluded.note;
end $$;

-- ---------------------------------------------------------------- reads
-- One day of the book. A cashier is not shown Logic's report total, only
-- whether the typed sale matches it.
create function public.cash_book_day(p_store uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.cash_book_days; s public.cash_book_starts; prev public.cash_book_days; v_report numeric;
  v_opening numeric; v_blocked text;
begin
  if p_store is null or not coalesce(public.can_work_store(p_store), false) then raise exception 'Store access denied.'; end if;
  select * into s from public.cash_book_starts where store_id = p_store;
  select * into d from public.cash_book_days where store_id = p_store and book_date = p_date;
  if d.id is null then
    if s.store_id is null then v_blocked := 'not_started';
    elsif p_date < s.start_date then v_blocked := 'before_start';
    elsif p_date = s.start_date then v_opening := s.opening_balance;
    else
      select * into prev from public.cash_book_days where store_id = p_store and book_date = p_date - 1;
      if prev.id is null or prev.status = 'open' then v_blocked := 'previous_open'; else v_opening := prev.counted_cash; end if;
    end if;
  else
    v_opening := d.opening_balance;
  end if;
  v_report := public.cash_book_report_sale(p_store, p_date);
  return jsonb_build_object(
    'date', p_date,
    'start', case when s.store_id is null then null else jsonb_build_object('date', s.start_date, 'opening', s.opening_balance) end,
    'status', coalesce(d.status, 'not_opened'),
    'blocked', v_blocked,
    'opening', v_opening,
    'sale', d.sale_amount, 'counted', d.counted_cash, 'closing', d.closing_balance, 'note', d.note, 'review_note', d.review_note,
    'closed_by', (select full_name from public.profiles where id = d.closed_by), 'closed_at', d.closed_at,
    'reviewed_by', (select full_name from public.profiles where id = d.reviewed_by),
    'can_edit', public.cash_book_can_edit(p_store, p_date) and coalesce(d.status, 'open') = 'open' and v_blocked is null,
    'bank_day', public.cash_is_bank_day(p_date),
    'report_uploaded', v_report is not null,
    'report_sale', case when public.is_cashier() then null else v_report end,
    'report_matches', case when v_report is null or d.sale_amount is null then null else abs(v_report - d.sale_amount) <= 1 end,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.entry_type, 'direction', e.direction, 'category', e.category,
        'amount', e.amount, 'note', e.note, 'staff_name', e.staff_name,
        'other_store', (select name from public.stores where id = e.other_store_id),
        'transfer_status', (select status from public.cash_transfers where id = e.transfer_id),
        'by', (select full_name from public.profiles where id = e.created_by), 'mine', e.created_by = auth.uid(),
        'at', e.created_at) order by e.created_at)
      from public.cash_book_entries e where e.day_id = d.id), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'from', (select name from public.stores where id = t.from_store_id),
        'amount', t.amount, 'sent_date', t.sent_date, 'note', t.note) order by t.sent_date)
      from public.cash_transfers t where t.to_store_id = p_store and t.status = 'sent'), '[]'::jsonb)
  );
end $$;

create function public.cash_book_history(p_store uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', d.book_date, 'status', d.status, 'opening', d.opening_balance, 'sale', d.sale_amount,
    'in', coalesce(t.cash_in, 0), 'out', coalesce(t.cash_out, 0), 'edc', coalesce(t.edc, 0), 'deposit', coalesce(t.deposit, 0),
    'closing', d.closing_balance, 'counted', d.counted_cash,
    'difference', case when d.status <> 'open' then d.counted_cash - d.closing_balance end,
    'bank_day', public.cash_is_bank_day(d.book_date),
    'report_matches', case when d.sale_amount is null or public.cash_book_report_sale(d.store_id, d.book_date) is null then null
      else abs(public.cash_book_report_sale(d.store_id, d.book_date) - d.sale_amount) <= 1 end
  ) order by d.book_date desc), '[]'::jsonb)
  from public.cash_book_days d
  left join lateral (
    select sum(amount) filter (where direction = 'in') as cash_in, sum(amount) filter (where direction = 'out') as cash_out,
      sum(amount) filter (where entry_type = 'edc') as edc, sum(amount) filter (where entry_type = 'bank_deposit') as deposit
    from public.cash_book_entries e where e.day_id = d.id) t on true
  where coalesce(public.can_work_store(p_store), false) and d.store_id = p_store and d.book_date between p_from and p_to and p_to - p_from <= 400
$$;

-- Stores the cash can be sent to (names only), and the marked bank holidays.
create function public.cash_book_other_stores(p_store uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
  from public.stores where coalesce(public.can_work_store(p_store), false) and is_active and id <> p_store
$$;

create function public.bank_holiday_list(p_from date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'note', note) order by day), '[]'::jsonb)
  from public.bank_holidays where day >= p_from
$$;

-- Daily checklist for the store: sales report on time (by noon the next
-- day, bill-wise), cash book closed, tasks due. No sales figures.
create function public.store_checklist(p_store uuid, p_days integer default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not coalesce(public.can_work_store(p_store), false) then null else jsonb_build_object(
    'cash_start', (select start_date from public.cash_book_starts where store_id = p_store),
    'tasks_due', (select count(*) from public.tasks t where t.store_id = p_store and t.status = 'pending'
      and t.due_date <= public.india_today() and not coalesce(t.is_private, false)),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'report', case
          when r.first_at is null then 'missing'
          when not exists (select 1 from public.sales_rows x join public.reports rr on rr.id = x.report_id and rr.is_current
                           where rr.store_id = p_store and rr.report_type = 'sales' and rr.report_date = g.day and x.line_kind = 'item') then 'summary_only'
          when r.first_at <= ((g.day + 1) + time '12:00') at time zone 'Asia/Kolkata' then 'on_time'
          else 'late' end,
        'cash', coalesce((select status from public.cash_book_days c where c.store_id = p_store and c.book_date = g.day), 'not_done')
      ) order by g.day desc)
      from (select gs::date as day from generate_series(public.india_today() - greatest(1, least(p_days, 60)), public.india_today() - 1, interval '1 day') gs) g
      left join lateral (
        select min(rp.created_at) as first_at from public.reports rp
        where rp.store_id = p_store and rp.report_type = 'sales' and rp.report_date = g.day and rp.status = 'processed') r on true)
  ) end
$$;

revoke all on function public.cash_is_bank_day(date), public.cash_book_can_edit(uuid, date), public.cash_book_open_day(uuid, date),
  public.cash_book_report_sale(uuid, date) from public, anon, authenticated;
grant execute on function public.cash_is_bank_day(date) to authenticated, service_role;
revoke all on function public.cash_book_set_start(uuid, date, numeric),
  public.cash_book_add_entry(uuid, date, text, numeric, text, text, uuid, uuid), public.cash_book_delete_entry(uuid),
  public.cash_book_receive_transfer(uuid, date), public.cash_book_close_day(uuid, date, numeric, numeric, text),
  public.cash_book_reopen_day(uuid, date), public.cash_book_review_day(uuid, date, text), public.cash_book_set_holiday(date, text, boolean),
  public.cash_book_day(uuid, date), public.cash_book_history(uuid, date, date), public.store_checklist(uuid, integer),
  public.cash_book_other_stores(uuid), public.bank_holiday_list(date)
  from public, anon;
grant execute on function public.cash_book_set_start(uuid, date, numeric),
  public.cash_book_add_entry(uuid, date, text, numeric, text, text, uuid, uuid), public.cash_book_delete_entry(uuid),
  public.cash_book_receive_transfer(uuid, date), public.cash_book_close_day(uuid, date, numeric, numeric, text),
  public.cash_book_reopen_day(uuid, date), public.cash_book_review_day(uuid, date, text), public.cash_book_set_holiday(date, text, boolean),
  public.cash_book_day(uuid, date), public.cash_book_history(uuid, date, date), public.store_checklist(uuid, integer),
  public.cash_book_other_stores(uuid), public.bank_holiday_list(date)
  to authenticated;

-- ---------------------------------------------------------------- staff list for cashiers
-- Cashiers see and update their store's staff (names, phones, notes) like
-- managers. They cannot add (new staff go through owner approval), remove,
-- reactivate or move staff to another store.
create policy employee_contacts_cashier_select on public.employee_contacts for select to authenticated
  using (store_id in (select public.cashier_store_ids()));
create policy employee_contacts_cashier_update on public.employee_contacts for update to authenticated
  using (store_id in (select public.cashier_store_ids()))
  with check (store_id in (select public.cashier_store_ids()));

create function public.employee_contacts_cashier_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.is_cashier() and (new.is_active is distinct from old.is_active or new.store_id is distinct from old.store_id) then
    raise exception 'Only the owner or the manager can remove staff or move them to another store.';
  end if;
  return new;
end $$;
create trigger employee_contacts_cashier_guard before update on public.employee_contacts
  for each row execute function public.employee_contacts_cashier_guard();

-- ---------------------------------------------------------------- owner summary: cash from the cash book
create or replace function public.owner_daily_summary_facts(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('month', p_day)::date as month_start,
           (date_trunc('month', p_day) - interval '1 month')::date as prev_start,
           (date_trunc('month', p_day) - interval '1 day')::date as prev_end
  ),
  rep as (
    select r.id, r.store_id, r.report_date
    from public.reports r
    where r.report_type = 'sales' and r.is_current and r.status = 'processed'
      and r.report_date between least((select prev_start from bounds), p_day - 34) and p_day
  ),
  lines as (
    select x.store_id, x.sale_date, nullif(btrim(x.bill_no), '') as bill_no, nullif(btrim(x.brand), '') as brand,
      -- A trailing " S" marks the shop counter ("SHAIK SHABAZ S" = "SHAIK SHABAZ").
      nullif(regexp_replace(coalesce(a.canonical_staff_name, a2.canonical_staff_name,
        regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')), '\s+[sS]$', ''), '') as staff,
      coalesce(x.net_sale, 0)::numeric as net, coalesce(x.quantity, 0)::numeric as qty,
      case when x.mrp > 0 then x.mrp * coalesce(x.quantity, 0) end as mrp_value, x.line_kind
    from public.sales_rows x
    join rep on rep.id = x.report_id
    left join public.staff_name_aliases a
      on a.store_id = x.store_id and a.source_type = 'sales_report' and a.is_active
      and a.normalized_source_name = lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g'))
    left join public.staff_name_aliases a2
      on a.id is null and a2.store_id = x.store_id and a2.source_type = 'sales_report' and a2.is_active
      and a2.normalized_source_name = regexp_replace(lower(regexp_replace(btrim(x.staff_name), '\s+', ' ', 'g')), ' s$', '')
  ),
  named as (
    select * from lines
    where staff is not null and staff !~* '^(nil|na|n/a|none|unspecified|-|0)$'
  )
  select jsonb_build_object(
    'day', p_day,
    'stores', coalesce((
      select jsonb_agg(store_facts order by store_facts->>'code')
      from (
        select jsonb_build_object(
          'code', s.code,
          'name', s.name,
          'status', case
            when not exists (select 1 from rep where rep.store_id = s.id and rep.report_date = p_day) then 'missing'
            when not exists (select 1 from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item') then 'summary_only'
            else 'bill_level' end,
          'sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day),
          'bills', (select count(distinct bill_no) from lines l where l.store_id = s.id and l.sale_date = p_day),
          'qty', (select sum(qty) from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item'),
          -- Discount = 1 - net / MRP value, on lines that carry an MRP.
          'discount_pct', (select round(100 * (1 - sum(net) / nullif(sum(mrp_value), 0)), 1) from lines l
            where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and l.mrp_value is not null),
          'usual_discount_pct', (select round(100 * (1 - sum(net) / nullif(sum(mrp_value), 0)), 1) from lines l
            where l.store_id = s.id and l.sale_date between p_day - 28 and p_day - 1 and l.line_kind = 'item' and l.mrp_value is not null),
          'last_week_sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day - 7),
          'month_sale', (select sum(net) from lines l where l.store_id = s.id and l.sale_date between (select month_start from bounds) and p_day),
          'month_days', p_day - (select month_start from bounds) + 1,
          'last_month_same_days_sale', (select sum(net) from lines l where l.store_id = s.id
            and l.sale_date between (select prev_start from bounds)
              and least((select prev_start from bounds) + (p_day - (select month_start from bounds)), (select prev_end from bounds))),
          'month_target', (select sum(t.target) from public.staff_targets t where t.store_id = s.id and t.month = (select month_start from bounds)),
          'missing_days', (
            select count(*) from generate_series((select month_start from bounds), p_day, interval '1 day') g
            where not exists (select 1 from rep where rep.store_id = s.id and rep.report_date = g::date)),
          'summary_days', (
            select count(*) from rep
            where rep.store_id = s.id and rep.report_date >= (select month_start from bounds)
              and not exists (select 1 from lines l where l.store_id = s.id and l.sale_date = rep.report_date and l.line_kind = 'item')),
          'returns', (select -sum(net) from lines l where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and net < 0),
          'return_brands', (
            select coalesce(jsonb_agg(brand order by amount desc), '[]'::jsonb) from (
              select brand, -sum(net) as amount from lines l
              where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and net < 0 and brand is not null
              group by brand order by 2 desc limit 2) b),
          -- Cash book (cashier's daily book): status, book CB, counted cash,
          -- and whether a bank deposit was entered on a bank day.
          'cash', (
            select jsonb_build_object('status', d.status, 'book', d.closing_balance, 'counted', d.counted_cash,
              'bank_day', public.cash_is_bank_day(p_day),
              'deposit', exists (select 1 from public.cash_book_entries e where e.day_id = d.id and e.entry_type = 'bank_deposit'))
            from public.cash_book_days d where d.store_id = s.id and d.book_date = p_day),
          'top_staff', (
            select jsonb_build_object('name', staff, 'sale', sale, 'bills', bills) from (
              select staff, sum(net) as sale, count(distinct bill_no) as bills from named n
              where n.store_id = s.id and n.sale_date = p_day and n.line_kind = 'item'
              group by staff having sum(net) > 0 order by 2 desc limit 1) t),
          'top_staffs', (
            select coalesce(jsonb_agg(jsonb_build_object('name', staff, 'sale', sale, 'bills', bills) order by sale desc), '[]'::jsonb) from (
              select staff, sum(net) as sale, count(distinct bill_no) as bills from named n
              where n.store_id = s.id and n.sale_date = p_day and n.line_kind = 'item'
              group by staff having sum(net) > 0 order by 2 desc limit 2) t),
          'top_brands', (
            select coalesce(jsonb_agg(jsonb_build_object('name', brand, 'sale', sale) order by sale desc), '[]'::jsonb) from (
              select brand, sum(net) as sale from lines l
              where l.store_id = s.id and l.sale_date = p_day and l.line_kind = 'item' and brand is not null
              group by brand having sum(net) > 0 order by 2 desc limit 3) b),
          -- Last 7 days per working day well below the person's own usual
          -- (previous 28 days, at least 5 working days). One day alone is noise.
          'attention', (
            select jsonb_build_object('name', staff, 'recent_per_day', round(recent_per_day), 'usual_per_day', round(usual_per_day)) from (
              select staff,
                sum(net) filter (where sale_date > p_day - 7) / nullif(count(distinct sale_date) filter (where sale_date > p_day - 7), 0) as recent_per_day,
                sum(net) filter (where sale_date <= p_day - 7) / nullif(count(distinct sale_date) filter (where sale_date <= p_day - 7), 0) as usual_per_day,
                count(distinct sale_date) filter (where sale_date > p_day - 7) as recent_days,
                count(distinct sale_date) filter (where sale_date <= p_day - 7) as usual_days
              from named n
              where n.store_id = s.id and n.line_kind = 'item' and n.sale_date between p_day - 34 and p_day
              group by staff) w
            where recent_days >= 2 and usual_days >= 5 and usual_per_day >= 1000 and recent_per_day < usual_per_day * 0.5
            order by recent_per_day / usual_per_day limit 1)
        ) as store_facts
        from public.stores s
        where s.is_active
      ) per_store
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.owner_daily_summary_facts(date) from public, anon, authenticated;
grant execute on function public.owner_daily_summary_facts(date) to service_role;

commit;
