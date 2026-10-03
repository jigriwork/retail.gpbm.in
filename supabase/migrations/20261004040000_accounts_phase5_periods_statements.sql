-- Company Accounts, phase 5: month close per firm, company statement
-- comparison, chain-store summary reporting, and set-based lookups.
begin;

-- ---------------------------------------------------------------- numbering fix
-- lpad() truncates: the 10,000th voucher of a year became ".../1000" and
-- clashed. Numbers now keep all their digits (at least four).
create or replace function public.next_voucher_no(p_firm uuid, p_date date, p_type text) returns text
language plpgsql security definer set search_path = '' as $$
declare fy text := public.financial_year(p_date); n integer; prefix text;
begin
  insert into public.voucher_sequences(firm_id, financial_year, voucher_type) values (p_firm, fy, p_type)
  on conflict do nothing;
  update public.voucher_sequences set last_no = last_no + 1
  where firm_id = p_firm and financial_year = fy and voucher_type = p_type returning last_no into n;
  prefix := case p_type when 'opening' then 'OB' when 'purchase' then 'PUR' when 'payment' then 'PAY' when 'receipt' then 'RCT'
    when 'credit_note' then 'CN' when 'debit_note' then 'DN' else 'JV' end;
  return prefix || '/' || fy || '/' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
end $$;
create or replace function public.next_return_no(p_firm uuid, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare fy text := public.financial_year(p_date); n integer;
begin
  insert into public.voucher_sequences(firm_id, financial_year, voucher_type) values (p_firm, fy, 'return') on conflict do nothing;
  update public.voucher_sequences set last_no = last_no + 1 where firm_id = p_firm and financial_year = fy and voucher_type = 'return' returning last_no into n;
  return 'RET/' || fy || '/' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
end $$;
revoke all on function public.next_voucher_no(uuid, date, text), public.next_return_no(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- periods
create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  month date not null check (extract(day from month) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  reopened_by uuid references public.profiles(id),
  reopened_at timestamptz,
  reopen_reason text check (reopen_reason is null or length(reopen_reason) <= 500),
  updated_at timestamptz not null default now()
);
create unique index accounting_periods_key on public.accounting_periods (firm_id, month);

create or replace function public.period_is_closed(p_firm uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.accounting_periods where firm_id = p_firm and month = date_trunc('month', p_date)::date and status = 'closed')
$$;

-- Nothing is posted into a closed month (corrections go into an open month
-- as reversals). Workings for a closed month cannot be approved either.
create or replace function public.guard_closed_period() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.period_is_closed(new.firm_id, new.voucher_date) then
    raise exception '% is closed for this firm. Date the entry in an open month, or ask the owner to reopen it.', to_char(new.voucher_date, 'Mon YYYY');
  end if;
  return new;
end $$;
create or replace function public.guard_closed_period_working() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'approved' and old.status <> 'approved' and public.period_is_closed(new.firm_id, new.period_to) then
    raise exception 'The month is closed for this firm. Ask the owner to reopen it before approving.';
  end if;
  return new;
end $$;
create trigger vouchers_closed_period before insert on public.vouchers for each row execute function public.guard_closed_period();
create trigger calculation_runs_closed_period before update of status on public.calculation_runs for each row execute function public.guard_closed_period_working();

create or replace function public.close_period(p_firm uuid, p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', p_month)::date;
begin
  if not public.finance_can('close', p_firm, null) then raise exception 'Only the owner or an accountant allowed to close months can close.'; end if;
  if m >= date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date then raise exception 'Only past months can be closed.'; end if;
  insert into public.accounting_periods(firm_id, month, status, closed_by, closed_at) values (p_firm, m, 'closed', auth.uid(), now())
  on conflict (firm_id, month) do update set status = 'closed', closed_by = auth.uid(), closed_at = now(), updated_at = now()
  where public.accounting_periods.status = 'open';
end $$;

create or replace function public.reopen_period(p_firm uuid, p_month date, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only an owner can reopen a closed month.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Write why the month is being reopened.'; end if;
  update public.accounting_periods set status = 'open', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = btrim(p_reason), updated_at = now()
  where firm_id = p_firm and month = date_trunc('month', p_month)::date and status = 'closed';
  if not found then raise exception 'That month is not closed.'; end if;
end $$;

-- ---------------------------------------------------------------- company statements
-- The supplier's statement of our account, kept for comparison only. Their
-- "debit" is a bill to us (our credit); their "credit" is a payment or note.
create table public.supplier_statements (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  party_id uuid not null references public.parties(id),
  document_id uuid references public.finance_documents(id),
  period_from date not null,
  period_to date not null,
  opening_balance numeric(14,2),
  closing_balance numeric(14,2) not null,
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (period_to >= period_from)
);
create index supplier_statements_party_idx on public.supplier_statements (firm_id, party_id, period_to desc);

create table public.supplier_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.supplier_statements(id),
  line_date date,
  doc_no text check (doc_no is null or length(doc_no) <= 80),
  doc_key text generated always as (upper(regexp_replace(coalesce(doc_no, ''), '[^a-zA-Z0-9]', '', 'g'))) stored,
  description text check (description is null or length(description) <= 300),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  matched_voucher_id uuid references public.vouchers(id),
  match_note text check (match_note is null or length(match_note) <= 300)
);
create index supplier_statement_lines_idx on public.supplier_statement_lines (statement_id);

create or replace function public.save_supplier_statement(p_firm uuid, p_party uuid, p_from date, p_to date, p_opening numeric, p_closing numeric,
  p_document uuid, p_lines jsonb, p_notes text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.finance_can('post', p_firm, null) then raise exception 'You cannot record statements for this firm.'; end if;
  if p_closing is null or p_from is null or p_to is null or p_to < p_from then raise exception 'Enter the statement period and closing balance.'; end if;
  insert into public.supplier_statements(firm_id, party_id, document_id, period_from, period_to, opening_balance, closing_balance, notes, created_by)
  values (p_firm, p_party, p_document, p_from, p_to, round(p_opening, 2), round(p_closing, 2), nullif(btrim(p_notes), ''), auth.uid()) returning id into v_id;
  insert into public.supplier_statement_lines(statement_id, line_date, doc_no, description, debit, credit)
  select v_id, nullif(x->>'date', '')::date, nullif(btrim(x->>'doc_no'), ''), nullif(btrim(x->>'description'), ''),
    round(coalesce((x->>'debit')::numeric, 0), 2), round(coalesce((x->>'credit')::numeric, 0), 2)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
  where coalesce((x->>'debit')::numeric, 0) <> 0 or coalesce((x->>'credit')::numeric, 0) <> 0;
  perform public.match_statement(v_id);
  return v_id;
end $$;

-- Matches statement lines to our vouchers by document number and amount:
-- their debit = our bill (purchase/opening), their credit = our payment or
-- credit note. Each voucher matches at most one line.
create or replace function public.match_statement(p_statement uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare s public.supplier_statements; l record; v uuid; n integer := 0;
begin
  select * into s from public.supplier_statements where id = p_statement;
  if s.id is null or not public.finance_can('post', s.firm_id, null) then raise exception 'Statement not found.'; end if;
  for l in select * from public.supplier_statement_lines where statement_id = s.id and matched_voucher_id is null order by line_date loop
    select vo.id into v from public.vouchers vo
    where vo.firm_id = s.firm_id and vo.party_id = s.party_id and vo.status = 'posted' and vo.reverses_voucher_id is null
      and vo.supplier_side = case when l.debit > 0 then 'credit' else 'debit' end
      and vo.amount = greatest(l.debit, l.credit)
      and (l.doc_key = '' or upper(regexp_replace(coalesce(vo.reference_no, ''), '[^a-zA-Z0-9]', '', 'g')) = l.doc_key)
      and not exists(select 1 from public.supplier_statement_lines x where x.matched_voucher_id = vo.id and x.statement_id = s.id)
    order by abs(vo.voucher_date - coalesce(l.line_date, vo.voucher_date)) limit 1;
    if v is not null then
      update public.supplier_statement_lines set matched_voucher_id = v, match_note = case when l.doc_key = '' then 'Matched by amount only' else null end where id = l.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Our ledger vs their statement at its closing date, with what is unmatched.
create or replace function public.statement_comparison(p_statement uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select * from public.supplier_statements where id = p_statement and public.finance_can('view', firm_id, null)),
  ours as (
    select coalesce(sum(l.credit - l.debit), 0) bal from s
    join public.vouchers v on v.firm_id = s.firm_id and v.party_id = s.party_id and v.voucher_date <= s.period_to
    join public.voucher_lines l on l.voucher_id = v.id and l.account = 'supplier'),
  unmatched_ours as (
    select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'voucher_no', v.voucher_no, 'date', v.voucher_date, 'reference', v.reference_no,
      'amount', v.amount, 'side', v.supplier_side) order by v.voucher_date), '[]'::jsonb) items
    from s join public.vouchers v on v.firm_id = s.firm_id and v.party_id = s.party_id and v.status = 'posted' and v.reverses_voucher_id is null
      and v.voucher_date between s.period_from and s.period_to
    where not exists(select 1 from public.supplier_statement_lines x where x.statement_id = s.id and x.matched_voucher_id = v.id)),
  unmatched_theirs as (
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.line_date, 'doc_no', x.doc_no, 'description', x.description,
      'debit', x.debit, 'credit', x.credit) order by x.line_date), '[]'::jsonb) items
    from s join public.supplier_statement_lines x on x.statement_id = s.id where x.matched_voucher_id is null)
  select jsonb_build_object('our_balance', (select bal from ours), 'their_balance', (select closing_balance from s),
    'difference', (select bal from ours) - (select closing_balance from s),
    'matched', (select count(*) from public.supplier_statement_lines x, s where x.statement_id = s.id and x.matched_voucher_id is not null),
    'unmatched_ours', (select items from unmatched_ours), 'unmatched_theirs', (select items from unmatched_theirs))
  from s
$$;

-- ---------------------------------------------------------------- chain-store summary
-- Purchases, payments and notes by firm, store, supplier and brand for a
-- date range, in SQL numeric. Separate firms' books are never merged:
-- every row carries its firm.
create or replace function public.accounts_summary(p_firm uuid, p_store uuid, p_brand uuid, p_from date, p_to date)
returns table (firm_id uuid, store_id uuid, party_id uuid, brand_id uuid, purchases_taxable numeric, purchases_total numeric,
  payments numeric, credit_notes numeric, debit_notes numeric, purchase_qty numeric)
language sql stable security definer set search_path = '' as $$
  with v as (
    select * from public.vouchers x
    where x.voucher_date between p_from and p_to and x.status = 'posted' and x.reverses_voucher_id is null
      and (p_firm is null or x.firm_id = p_firm) and (p_store is null or x.store_id = p_store)
      and public.finance_can('view', x.firm_id, x.store_id)),
  -- Each purchase line's share of the invoice total (header-only invoices too).
  plines as (
    select v.id voucher_id, v.firm_id, v.store_id, v.party_id, l.brand_id, l.debit taxable,
      v.amount * l.debit / nullif(sum(l.debit) over (partition by v.id), 0) total
    from v join public.voucher_lines l on l.voucher_id = v.id and l.account = 'purchases' where v.voucher_type = 'purchase'),
  purchases as (
    select firm_id, store_id, party_id, brand_id, sum(taxable) taxable, sum(total) total
    from plines where p_brand is null or brand_id = p_brand group by 1, 2, 3, 4),
  totals as (
    select v.firm_id, v.store_id, v.party_id, il.brand_id, sum(il.quantity) qty
    from v join public.purchase_invoices i on i.voucher_id = v.id join public.purchase_invoice_lines il on il.invoice_id = i.id
    where (p_brand is null or il.brand_id = p_brand) group by 1, 2, 3, 4),
  money_moves as (
    select v.firm_id, v.store_id, v.party_id, null::uuid brand_id,
      sum(v.amount) filter (where v.voucher_type = 'payment') payments,
      sum(v.amount) filter (where v.voucher_type = 'credit_note') cns,
      sum(v.amount) filter (where v.voucher_type = 'debit_note') dns
    from v where v.voucher_type in ('payment', 'credit_note', 'debit_note') and p_brand is null group by 1, 2, 3),
  k as (select firm_id, store_id, party_id, brand_id from purchases union select firm_id, store_id, party_id, brand_id from money_moves)
  select k.firm_id, k.store_id, k.party_id, k.brand_id, coalesce(p.taxable, 0), round(coalesce(p.total, 0), 2),
    coalesce(m.payments, 0), coalesce(m.cns, 0), coalesce(m.dns, 0), coalesce(t.qty, 0)
  from k left join purchases p on p.firm_id = k.firm_id and p.store_id is not distinct from k.store_id and p.party_id = k.party_id and p.brand_id is not distinct from k.brand_id
    left join totals t on t.firm_id = k.firm_id and t.store_id is not distinct from k.store_id and t.party_id = k.party_id and t.brand_id is not distinct from k.brand_id
    left join money_moves m on m.firm_id = k.firm_id and m.store_id is not distinct from k.store_id and m.party_id = k.party_id and m.brand_id is not distinct from k.brand_id
$$;

-- ---------------------------------------------------------------- set-based lookups
-- Active batches with what is left, in one query (replaces one lookup per batch).
create or replace function public.batches_with_remaining(p_store uuid, p_party uuid, p_search text, p_unattributed boolean, p_limit integer)
returns table (id uuid, store_id uuid, firm_id uuid, party_id uuid, brand_id uuid, source text, lot_code text, barcode text, article text, size text,
  description text, mrp numeric, unit_cost numeric, cost_basis text, qty_in numeric, received_date date, attribution text, remaining numeric)
language sql stable security definer set search_path = '' as $$
  select b.id, b.store_id, b.firm_id, b.party_id, b.brand_id, b.source, b.lot_code, b.barcode, b.article, b.size, b.description, b.mrp, b.unit_cost,
    b.cost_basis, b.qty_in, b.received_date, b.attribution,
    b.qty_in - coalesce(a.sold, 0) - coalesce(r.returned, 0) - coalesce(m.moved, 0)
  from public.purchase_batches b
  left join lateral (select sum(x.qty) sold from public.stock_allocations x where x.batch_id = b.id and x.status = 'active') a on true
  left join lateral (select sum(l.qty - coalesce(l.rejected_qty, 0)) returned from public.supplier_return_lines l join public.supplier_returns sr on sr.id = l.return_id
    where l.batch_id = b.id and sr.status in ('dispatched', 'acknowledged', 'credited', 'closed')) r on true
  left join lateral (select sum(y.qty) moved from public.batch_movements y where y.batch_id = b.id) m on true
  where b.status = 'active' and public.finance_can('view', b.firm_id, b.store_id)
    and (p_store is null or b.store_id = p_store) and (p_party is null or b.party_id = p_party)
    and (not coalesce(p_unattributed, false) or b.attribution = 'unattributed')
    and (coalesce(btrim(p_search), '') = '' or b.lot_code ilike '%' || btrim(p_search) || '%' or b.barcode ilike '%' || btrim(p_search) || '%'
      or b.article ilike '%' || btrim(p_search) || '%' or b.description ilike '%' || btrim(p_search) || '%')
  order by b.received_date desc, b.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 500)
$$;

create index vouchers_type_date_idx on public.vouchers (firm_id, voucher_type, voucher_date);
create index voucher_allocations_party_idx on public.voucher_allocations (firm_id, party_id) where released_at is null;
create index stock_allocations_batch_all_idx on public.stock_allocations (batch_id, status);

-- ---------------------------------------------------------------- audit, RLS
do $$
declare t text;
begin
  foreach t in array array['accounting_periods', 'supplier_statements', 'supplier_statement_lines']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.finance_audit()', t || '_audit', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())', t || '_active_required', t);
  end loop;
end $$;
grant select on public.accounting_periods, public.supplier_statements, public.supplier_statement_lines to authenticated;
create policy accounting_periods_select on public.accounting_periods for select to authenticated using (public.finance_can('view', firm_id, null));
create policy supplier_statements_select on public.supplier_statements for select to authenticated using (public.finance_can('view', firm_id, null));
create policy supplier_statement_lines_select on public.supplier_statement_lines for select to authenticated
  using (exists(select 1 from public.supplier_statements s where s.id = statement_id and public.finance_can('view', s.firm_id, null)));

revoke all on function public.guard_closed_period(), public.guard_closed_period_working() from public, anon, authenticated;
revoke all on function public.period_is_closed(uuid, date), public.close_period(uuid, date), public.reopen_period(uuid, date, text),
  public.save_supplier_statement(uuid, uuid, date, date, numeric, numeric, uuid, jsonb, text), public.match_statement(uuid),
  public.statement_comparison(uuid), public.accounts_summary(uuid, uuid, uuid, date, date),
  public.batches_with_remaining(uuid, uuid, text, boolean, integer)
  from public, anon;
grant execute on function public.period_is_closed(uuid, date), public.close_period(uuid, date), public.reopen_period(uuid, date, text),
  public.save_supplier_statement(uuid, uuid, date, date, numeric, numeric, uuid, jsonb, text), public.match_statement(uuid),
  public.statement_comparison(uuid), public.accounts_summary(uuid, uuid, uuid, date, date),
  public.batches_with_remaining(uuid, uuid, text, boolean, integer)
  to authenticated;

commit;
