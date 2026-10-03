-- Company Accounts, phase 3: purchase batches and sales attribution, stock
-- returns to suppliers, and documented distributor/store transfers.
--
-- Attribution method (verified 3 Oct 2026): Logic's LOT CODE identifies one
-- inward lot. 91% of Go Planet and 99% of Brand Mark sales lines in late
-- September found their lot in the September stock report, all with the same
-- item name; one lot never has two barcodes, while 4,135 barcodes span
-- several lots (repeat purchases). Sales are therefore matched to batches by
-- exact lot first, then by barcode oldest-first, and otherwise left visibly
-- unresolved. Nothing is assigned to "the current distributor" by default.
begin;

alter table public.purchase_invoice_lines add column lot_code text check (lot_code is null or length(lot_code) <= 40);

-- ---------------------------------------------------------------- batches
create table public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  store_id uuid not null references public.stores(id),
  party_id uuid references public.parties(id),
  brand_id uuid references public.brands(id),
  source text not null check (source in ('purchase', 'opening', 'transfer_in')),
  invoice_id uuid references public.purchase_invoices(id),
  invoice_line_id uuid references public.purchase_invoice_lines(id),
  opening_report_id uuid references public.reports(id),
  parent_batch_id uuid references public.purchase_batches(id),
  lot_code text,
  barcode text,
  article text,
  size text,
  description text,
  mrp numeric(14,2),
  unit_cost numeric(14,4),
  cost_basis text not null check (cost_basis in ('invoice_taxable', 'logic_purchase_rate', 'unknown', 'transferred')),
  qty_in numeric(14,3) not null check (qty_in > 0),
  received_date date not null,
  attribution text not null check (attribution in ('attributed', 'unattributed')),
  attribution_note text check (attribution_note is null or length(attribution_note) <= 500),
  attributed_by uuid references public.profiles(id),
  attributed_at timestamptz,
  status text not null default 'active' check (status in ('active', 'void')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (attribution = 'unattributed' or party_id is not null)
);
create unique index purchase_batches_line_key on public.purchase_batches (invoice_line_id) where source = 'purchase' and status = 'active';
create index purchase_batches_lot_idx on public.purchase_batches (store_id, lot_code) where status = 'active';
create index purchase_batches_barcode_idx on public.purchase_batches (store_id, barcode) where status = 'active';
create index purchase_batches_party_idx on public.purchase_batches (firm_id, party_id);

-- Quantity moved out of a batch other than by sale or supplier return
-- (store transfers, distributor takeovers).
create table public.batch_movements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.purchase_batches(id),
  kind text not null check (kind in ('store_transfer', 'distributor_transfer')),
  qty numeric(14,3) not null check (qty > 0),
  to_batch_id uuid references public.purchase_batches(id),
  movement_date date not null,
  transfer_id uuid,
  document_id uuid references public.finance_documents(id),
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index batch_movements_batch_idx on public.batch_movements (batch_id);

-- Which batch each sold piece came from. Unresolved pieces have no batch.
create table public.stock_allocations (
  id uuid primary key default gen_random_uuid(),
  sales_row_id uuid not null references public.sales_rows(id),
  store_id uuid not null references public.stores(id),
  sale_date date not null,
  batch_id uuid references public.purchase_batches(id),
  qty numeric(14,3) not null check (qty <> 0),
  method text not null check (method in ('lot', 'barcode_fifo', 'manual', 'customer_return', 'unresolved')),
  status text not null default 'active' check (status in ('active', 'reversed')),
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_reason text,
  check ((method = 'unresolved') = (batch_id is null))
);
create index stock_allocations_row_idx on public.stock_allocations (sales_row_id) where status = 'active';
create index stock_allocations_batch_idx on public.stock_allocations (batch_id) where status = 'active';
create index stock_allocations_store_idx on public.stock_allocations (store_id, sale_date) where status = 'active';

-- ---------------------------------------------------------------- supplier returns
create table public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  store_id uuid not null references public.stores(id),
  party_id uuid not null references public.parties(id),
  return_no text not null,
  status text not null default 'requested' check (status in ('requested', 'authorised', 'dispatched', 'acknowledged', 'credited', 'closed', 'cancelled')),
  request_date date not null,
  authorisation_ref text check (authorisation_ref is null or length(authorisation_ref) <= 120),
  authorised_date date,
  dispatch_date date,
  dispatch_ref text check (dispatch_ref is null or length(dispatch_ref) <= 120),
  acknowledged_date date,
  expected_credit numeric(14,2) not null default 0 check (expected_credit >= 0),
  accepted_value numeric(14,2) check (accepted_value is null or accepted_value >= 0),
  debit_note_voucher_id uuid references public.vouchers(id),
  credit_note_voucher_id uuid references public.vouchers(id),
  supplier_credit_ref text check (supplier_credit_ref is null or length(supplier_credit_ref) <= 80),
  supplier_credit_amount numeric(14,2),
  deduct_on text not null default 'acknowledgement' check (deduct_on in ('acknowledgement', 'credit_note')),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index supplier_returns_no_key on public.supplier_returns (firm_id, return_no);
create index supplier_returns_party_idx on public.supplier_returns (firm_id, party_id, status);

create table public.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.supplier_returns(id),
  batch_id uuid references public.purchase_batches(id),
  lot_code text,
  barcode text,
  article text,
  size text,
  qty numeric(14,3) not null check (qty > 0),
  unit_value numeric(14,2) not null check (unit_value >= 0),
  accepted_qty numeric(14,3) check (accepted_qty is null or accepted_qty >= 0),
  rejected_qty numeric(14,3) check (rejected_qty is null or rejected_qty >= 0),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  check (accepted_qty is null or rejected_qty is null or accepted_qty + rejected_qty = qty)
);
create index supplier_return_lines_return_idx on public.supplier_return_lines (return_id);
create index supplier_return_lines_batch_idx on public.supplier_return_lines (batch_id);

-- ---------------------------------------------------------------- transfers
create table public.distributor_transfers (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  from_party_id uuid not null references public.parties(id),
  to_party_id uuid not null references public.parties(id),
  transfer_date date not null,
  liability_amount numeric(14,2) not null default 0 check (liability_amount >= 0),
  from_voucher_id uuid references public.vouchers(id),
  to_voucher_id uuid references public.vouchers(id),
  document_id uuid not null references public.finance_documents(id),
  narration text not null check (length(btrim(narration)) between 3 and 1000),
  batches_moved integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (from_party_id <> to_party_id)
);

-- ---------------------------------------------------------------- batch quantities
create or replace function public.batch_remaining(p_batch uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select b.qty_in
    - coalesce((select sum(a.qty) from public.stock_allocations a where a.batch_id = b.id and a.status = 'active'), 0)
    - coalesce((select sum(l.qty - coalesce(l.rejected_qty, 0)) from public.supplier_return_lines l
        join public.supplier_returns r on r.id = l.return_id
        where l.batch_id = b.id and r.status in ('dispatched', 'acknowledged', 'credited', 'closed')), 0)
    - coalesce((select sum(m.qty) from public.batch_movements m where m.batch_id = b.id), 0)
  from public.purchase_batches b where b.id = p_batch and b.status = 'active'
$$;

-- Batches from a posted purchase: one per line, cost = line taxable / qty.
create or replace function public.purchase_batches_on_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'posted' and old.status = 'draft' then
    insert into public.purchase_batches(firm_id, store_id, party_id, brand_id, source, invoice_id, invoice_line_id, lot_code, barcode,
      article, size, description, mrp, unit_cost, cost_basis, qty_in, received_date, attribution, created_by)
    select new.firm_id, new.store_id, new.party_id, l.brand_id, 'purchase', new.id, l.id, nullif(btrim(l.lot_code), ''), nullif(btrim(l.barcode), ''),
      l.article, l.size, l.description, l.mrp, round(l.taxable_amount / l.quantity, 4), 'invoice_taxable', l.quantity,
      coalesce(new.received_date, new.invoice_date), 'attributed', new.posted_by
    from public.purchase_invoice_lines l where l.invoice_id = new.id;
  elsif new.status = 'cancelled' and old.status = 'posted' then
    -- A reversed purchase: its batches stop counting and the pieces already
    -- attributed to them become unresolved again (never silently re-pointed).
    update public.stock_allocations set status = 'reversed', reversed_at = now(), reversed_reason = 'Purchase reversed'
    where status = 'active' and batch_id in (select id from public.purchase_batches where invoice_id = new.id);
    update public.purchase_batches set status = 'void' where invoice_id = new.id;
  end if;
  return new;
end $$;
create trigger purchase_invoices_batches after update of status on public.purchase_invoices
  for each row execute function public.purchase_batches_on_post();

-- Opening batches from a stock report: one per lot with its closing
-- quantity. Supplier unknown until attributed by brand (or one by one).
create or replace function public.create_opening_batches(p_report uuid, p_as_of date) returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.reports; firm uuid; n integer;
begin
  select * into r from public.reports where id = p_report and report_type = 'stock' and is_current;
  if r.id is null then raise exception 'Choose a current stock report.'; end if;
  firm := public.store_firm_on(r.store_id, p_as_of);
  if firm is null then raise exception 'The store''s billing firm is not confirmed for that date.'; end if;
  if not public.finance_can('post', firm, r.store_id) then raise exception 'You cannot create stock batches for this store.'; end if;
  if exists(select 1 from public.purchase_batches where opening_report_id = p_report and status = 'active') then
    raise exception 'Opening stock from this report already exists.';
  end if;
  insert into public.purchase_batches(firm_id, store_id, brand_id, source, opening_report_id, lot_code, barcode, article, size, description,
    mrp, unit_cost, cost_basis, qty_in, received_date, attribution, attribution_note, created_by)
  select firm, r.store_id,
    (select ba.brand_id from public.brand_aliases ba where ba.normalized = public.finance_norm(s.brand) union all
     select b.id from public.brands b where b.normalized = public.finance_norm(s.brand) limit 1),
    'opening', r.id, s.lot_code, s.barcode, s.article_code, s.size, s.item_name, s.mrp, s.purchase_rate,
    case when s.purchase_rate is null then 'unknown' else 'logic_purchase_rate' end, s.quantity, p_as_of, 'unattributed',
    'Opening stock from ' || coalesce(r.file_name, 'stock report'), auth.uid()
  from public.stock_rows s where s.report_id = r.id and s.quantity > 0;
  get diagnostics n = row_count;
  return n;
end $$;

-- Gives unattributed batches of one brand (in one store) to a supplier,
-- with the reason. Used for opening stock bought before records began.
create or replace function public.attribute_batches(p_store uuid, p_brand uuid, p_party uuid, p_note text, p_batch uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer; firm uuid;
begin
  if p_batch is not null then select store_id, firm_id into p_store, firm from public.purchase_batches where id = p_batch;
  else firm := (select firm_id from public.purchase_batches where store_id = p_store and status = 'active' limit 1); end if;
  if not public.finance_can('post', firm, p_store) then raise exception 'You cannot attribute stock for this store.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say what the attribution is based on.'; end if;
  if not exists(select 1 from public.parties where id = p_party) then raise exception 'Choose the supplier.'; end if;
  update public.purchase_batches set party_id = p_party, attribution = 'attributed', attribution_note = btrim(p_note),
    attributed_by = auth.uid(), attributed_at = now()
  where status = 'active' and attribution = 'unattributed'
    and (p_batch is not null and id = p_batch or p_batch is null and store_id = p_store and brand_id is not distinct from p_brand);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- sales attribution
-- Attributes the current sales lines of one store and date range to batches.
-- Allocations of lines from replaced reports are reversed first, so a
-- corrected report is re-attributed rather than counted twice.
create or replace function public.allocate_store_sales(p_store uuid, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare line record; remaining numeric; take numeric; cand record; v_barcode text; stale integer; allocated numeric := 0; unresolved numeric := 0;
  returns_done numeric := 0; firm uuid := public.store_firm_on(p_store, p_to);
begin
  if not (public.is_owner() or public.finance_can('post', firm, p_store)
          or exists(select 1 from public.billing_firms f where public.finance_can('post', f.id, p_store))) then
    raise exception 'You cannot attribute sales for this store.';
  end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'Attribute at most three months at a time.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('allocate:' || p_store::text, 0));
  update public.stock_allocations a set status = 'reversed', reversed_at = now(), reversed_reason = 'Sales report replaced'
  from public.sales_rows s join public.reports r on r.id = s.report_id
  where a.sales_row_id = s.id and a.status = 'active' and a.store_id = p_store and not r.is_current;
  get diagnostics stale = row_count;
  -- Unresolved rows are retried on every run.
  update public.stock_allocations set status = 'reversed', reversed_at = now(), reversed_reason = 'Retried'
  where status = 'active' and method = 'unresolved' and store_id = p_store and sale_date between p_from and p_to;

  for line in
    select s.* from public.sales_rows s join public.reports r on r.id = s.report_id and r.is_current and r.report_type = 'sales'
    where s.store_id = p_store and s.sale_date between p_from and p_to and s.line_kind = 'item' and coalesce(s.quantity, 0) <> 0
      and not exists(select 1 from public.stock_allocations a where a.sales_row_id = s.id and a.status = 'active')
    order by s.sale_date, s.quantity desc, s.bill_no, s.source_line_no
  loop
    v_barcode := coalesce(line.barcode, (
      select k.barcode from public.stock_rows k join public.reports kr on kr.id = k.report_id and kr.is_current
      where k.store_id = p_store and k.lot_code = line.lot_code and k.barcode is not null order by kr.period_month desc limit 1));
    if line.quantity > 0 then
      remaining := line.quantity;
      for cand in
        select b.id, public.batch_remaining(b.id) left_qty, case when b.lot_code = line.lot_code then 'lot' else 'barcode_fifo' end how
        from public.purchase_batches b
        where b.store_id = p_store and b.status = 'active' and b.received_date <= line.sale_date
          and ((line.lot_code is not null and b.lot_code = line.lot_code) or (v_barcode is not null and b.barcode = v_barcode))
        order by (b.lot_code is not distinct from line.lot_code) desc, b.received_date, b.created_at
      loop
        exit when remaining <= 0;
        take := least(remaining, cand.left_qty);
        if take > 0 then
          insert into public.stock_allocations(sales_row_id, store_id, sale_date, batch_id, qty, method, created_by)
          values (line.id, p_store, line.sale_date, cand.id, take, cand.how, auth.uid());
          remaining := remaining - take; allocated := allocated + take;
        end if;
      end loop;
      if remaining > 0 then
        insert into public.stock_allocations(sales_row_id, store_id, sale_date, qty, method, note, created_by)
        values (line.id, p_store, line.sale_date, remaining, 'unresolved',
          case when line.lot_code is null and v_barcode is null then 'No lot code or barcode on the sales line' else 'No purchase or opening batch with stock for this lot/barcode' end, auth.uid());
        unresolved := unresolved + remaining;
      end if;
    else
      -- Customer return: back to the batch the same lot/barcode was last sold from.
      select a.batch_id into cand from public.stock_allocations a join public.sales_rows s on s.id = a.sales_row_id
      join public.purchase_batches b on b.id = a.batch_id
      where a.status = 'active' and a.qty > 0 and a.store_id = p_store and a.sale_date <= line.sale_date
        and ((line.lot_code is not null and s.lot_code = line.lot_code) or (v_barcode is not null and b.barcode = v_barcode))
      order by (s.bill_no is not distinct from line.bill_no) desc, a.sale_date desc, a.created_at desc limit 1;
      if cand.batch_id is not null then
        insert into public.stock_allocations(sales_row_id, store_id, sale_date, batch_id, qty, method, created_by)
        values (line.id, p_store, line.sale_date, cand.batch_id, line.quantity, 'customer_return', auth.uid());
        returns_done := returns_done - line.quantity;
      else
        insert into public.stock_allocations(sales_row_id, store_id, sale_date, qty, method, note, created_by)
        values (line.id, p_store, line.sale_date, line.quantity, 'unresolved', 'Customer return with no earlier attributed sale of this lot/barcode', auth.uid());
        unresolved := unresolved - line.quantity;
      end if;
    end if;
  end loop;
  return jsonb_build_object('allocated', allocated, 'unresolved', unresolved, 'customer_returns', returns_done, 'stale_reversed', stale);
end $$;

-- Owner/accountant picks the batch for an unresolved line by hand.
create or replace function public.allocate_sales_line_manually(p_allocation uuid, p_batch uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.stock_allocations; b public.purchase_batches;
begin
  select * into a from public.stock_allocations where id = p_allocation and status = 'active' and method = 'unresolved' for update;
  select * into b from public.purchase_batches where id = p_batch and status = 'active';
  if a.id is null or b.id is null then raise exception 'Choose an unresolved line and an active batch.'; end if;
  if not public.finance_can('post', b.firm_id, b.store_id) then raise exception 'You cannot attribute sales for this store.'; end if;
  if b.store_id <> a.store_id then raise exception 'The batch must be in the same store.'; end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say why this batch is right.'; end if;
  if a.qty > 0 and a.qty > public.batch_remaining(b.id) then raise exception 'That batch does not have enough stock left.'; end if;
  update public.stock_allocations set status = 'reversed', reversed_at = now(), reversed_reason = 'Attributed by hand' where id = a.id;
  insert into public.stock_allocations(sales_row_id, store_id, sale_date, batch_id, qty, method, note, created_by)
  values (a.sales_row_id, a.store_id, a.sale_date, b.id, a.qty, 'manual', btrim(p_note), auth.uid());
end $$;

-- Per store and range: how many pieces are attributed to each supplier, and
-- how many are unresolved or unattributed (blocks final settlements).
create or replace function public.attribution_summary(p_store uuid, p_from date, p_to date)
returns table (party_id uuid, brand_id uuid, method text, qty numeric, lines bigint)
language sql stable security definer set search_path = '' as $$
  select b.party_id, b.brand_id, case when a.batch_id is null then 'unresolved' when b.attribution = 'unattributed' then 'unattributed' else 'attributed' end,
    sum(a.qty), count(*)
  from public.stock_allocations a left join public.purchase_batches b on b.id = a.batch_id
  where a.store_id = p_store and a.status = 'active' and a.sale_date between p_from and p_to
    and (public.finance_store_visible(p_store) and exists(select 1 from public.finance_grants g where g.user_id = auth.uid() and g.revoked_at is null) or public.is_owner())
  group by 1, 2, 3
$$;

-- ---------------------------------------------------------------- returns workflow
create or replace function public.next_return_no(p_firm uuid, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare fy text := public.financial_year(p_date); n integer;
begin
  insert into public.voucher_sequences(firm_id, financial_year, voucher_type) values (p_firm, fy, 'return') on conflict do nothing;
  update public.voucher_sequences set last_no = last_no + 1 where firm_id = p_firm and financial_year = fy and voucher_type = 'return' returning last_no into n;
  return 'RET/' || fy || '/' || lpad(n::text, 4, '0');
end $$;

create or replace function public.create_supplier_return(p_firm uuid, p_store uuid, p_party uuid, p_date date, p_lines jsonb, p_notes text, p_deduct_on text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; line jsonb; b public.purchase_batches; total numeric := 0; qty numeric; unit numeric;
begin
  if not public.finance_can('post', p_firm, p_store) then raise exception 'You cannot create returns for this firm or store.'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Add the items being returned.'; end if;
  insert into public.supplier_returns(firm_id, store_id, party_id, return_no, request_date, notes, deduct_on, created_by)
  values (p_firm, p_store, p_party, public.next_return_no(p_firm, p_date), p_date, nullif(btrim(p_notes), ''),
    coalesce(nullif(p_deduct_on, ''), 'acknowledgement'), auth.uid()) returning id into v_id;
  for line in select value from jsonb_array_elements(p_lines) loop
    qty := (line->>'qty')::numeric;
    if qty is null or qty <= 0 then raise exception 'Each item needs a quantity.'; end if;
    b := null;
    if line->>'batch_id' is not null then
      select * into b from public.purchase_batches where id = (line->>'batch_id')::uuid and status = 'active';
      if b.id is null or b.store_id <> p_store or b.party_id is distinct from p_party then raise exception 'A batch is not from this supplier and store.'; end if;
      if qty > public.batch_remaining(b.id) then raise exception 'Not enough stock left in batch %.', coalesce(b.lot_code, b.barcode, b.id::text); end if;
    end if;
    unit := coalesce((line->>'unit_value')::numeric, b.unit_cost);
    if unit is null then raise exception 'Enter the value per piece for items without a known cost.'; end if;
    insert into public.supplier_return_lines(return_id, batch_id, lot_code, barcode, article, size, qty, unit_value, note)
    values (v_id, b.id, coalesce(line->>'lot_code', b.lot_code), coalesce(line->>'barcode', b.barcode), coalesce(line->>'article', b.article),
      coalesce(line->>'size', b.size), qty, round(unit, 2), line->>'note');
    total := total + round(qty * unit, 2);
  end loop;
  update public.supplier_returns set expected_credit = total where id = v_id;
  return v_id;
end $$;

-- Moves a return through its steps. Dispatch takes stock out of its batches
-- but never touches the ledger. Acknowledgement records accepted/rejected
-- pieces (rejected go back to stock) and, if the terms say returns are
-- booked on acknowledgement, posts a debit note for the accepted value.
-- The supplier's credit note is then matched to that debit note, not
-- deducted again; without a debit note it is posted as the credit note.
create or replace function public.advance_supplier_return(p_id uuid, p_action text, p_date date, p_ref text, p_amount numeric,
  p_lines jsonb, p_cgst numeric, p_sgst numeric, p_igst numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.supplier_returns; line jsonb; v uuid; accepted numeric; diff numeric;
begin
  select * into r from public.supplier_returns where id = p_id for update;
  if r.id is null then raise exception 'Return not found.'; end if;
  if not public.finance_can('post', r.firm_id, r.store_id) then raise exception 'You cannot change returns for this firm or store.'; end if;
  if p_date is null then raise exception 'Choose the date.'; end if;
  if p_action = 'authorise' and r.status = 'requested' then
    update public.supplier_returns set status = 'authorised', authorised_date = p_date, authorisation_ref = nullif(btrim(p_ref), '') where id = p_id;
  elsif p_action = 'dispatch' and r.status in ('requested', 'authorised') then
    update public.supplier_returns set status = 'dispatched', dispatch_date = p_date, dispatch_ref = nullif(btrim(p_ref), '') where id = p_id;
  elsif p_action = 'acknowledge' and r.status = 'dispatched' then
    for line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
      update public.supplier_return_lines set accepted_qty = (line->>'accepted_qty')::numeric, rejected_qty = qty - (line->>'accepted_qty')::numeric
      where id = (line->>'id')::uuid and return_id = p_id and (line->>'accepted_qty')::numeric between 0 and qty;
    end loop;
    if exists(select 1 from public.supplier_return_lines where return_id = p_id and accepted_qty is null) then
      raise exception 'Enter the accepted quantity for every item.';
    end if;
    select coalesce(sum(round(accepted_qty * unit_value, 2)), 0) into accepted from public.supplier_return_lines where return_id = p_id;
    accepted := coalesce(round(p_amount, 2), accepted);
    update public.supplier_returns set status = 'acknowledged', acknowledged_date = p_date, accepted_value = accepted where id = p_id;
    if r.deduct_on = 'acknowledgement' and accepted > 0 then
      v := public.record_supplier_voucher('debit_note', r.firm_id, r.store_id, r.party_id, p_date, accepted, null, r.return_no, p_date, 'return',
        case when coalesce(p_cgst, 0) + coalesce(p_sgst, 0) + coalesce(p_igst, 0) > 0 then accepted - coalesce(p_cgst, 0) - coalesce(p_sgst, 0) - coalesce(p_igst, 0) end,
        p_cgst, p_sgst, p_igst, 'Stock return ' || r.return_no || ' accepted', null, null);
      update public.supplier_returns set debit_note_voucher_id = v where id = p_id;
    end if;
  elsif p_action = 'credit' and r.status in ('acknowledged', 'dispatched') then
    if p_amount is null or p_amount <= 0 then raise exception 'Enter the credit note amount.'; end if;
    if r.debit_note_voucher_id is not null then
      -- Already deducted through our debit note: record the supplier's note
      -- against it; any difference becomes a dispute, never a second deduction.
      select amount into accepted from public.vouchers where id = r.debit_note_voucher_id;
      diff := round(p_amount, 2) - accepted;
      update public.supplier_returns set status = 'credited', supplier_credit_ref = nullif(btrim(p_ref), ''), supplier_credit_amount = round(p_amount, 2) where id = p_id;
      if diff <> 0 then
        insert into public.disputes(firm_id, store_id, party_id, voucher_id, amount, title, details, created_by)
        values (r.firm_id, r.store_id, r.party_id, r.debit_note_voucher_id, abs(diff), 'Return ' || r.return_no || ': supplier credit differs from our debit note',
          'Supplier credit ' || round(p_amount, 2) || ' vs debit note ' || accepted, auth.uid());
      end if;
    else
      v := public.record_supplier_voucher('credit_note', r.firm_id, r.store_id, r.party_id, p_date, p_amount, null, p_ref, p_date, 'return',
        case when coalesce(p_cgst, 0) + coalesce(p_sgst, 0) + coalesce(p_igst, 0) > 0 then p_amount - coalesce(p_cgst, 0) - coalesce(p_sgst, 0) - coalesce(p_igst, 0) end,
        p_cgst, p_sgst, p_igst, 'Credit for stock return ' || r.return_no, null, null);
      update public.supplier_returns set status = 'credited', credit_note_voucher_id = v, supplier_credit_ref = nullif(btrim(p_ref), ''), supplier_credit_amount = round(p_amount, 2) where id = p_id;
    end if;
  elsif p_action = 'close' and r.status = 'credited' then
    update public.supplier_returns set status = 'closed' where id = p_id;
  elsif p_action = 'cancel' and r.status in ('requested', 'authorised') then
    update public.supplier_returns set status = 'cancelled', notes = coalesce(notes || ' ', '') || 'Cancelled: ' || coalesce(btrim(p_ref), '') where id = p_id;
  else
    raise exception 'That step is not possible for a % return.', r.status;
  end if;
  return jsonb_build_object('ok', true, 'voucher_id', v);
end $$;

-- Return credit still to come: dispatched or acknowledged returns that have
-- no posted debit note or credit note yet.
create or replace function public.return_credit_pending(p_firm uuid)
returns table (firm_id uuid, party_id uuid, pending numeric, returns bigint)
language sql stable security definer set search_path = '' as $$
  select r.firm_id, r.party_id, sum(coalesce(r.accepted_value, r.expected_credit)), count(*)
  from public.supplier_returns r
  where (p_firm is null or r.firm_id = p_firm) and r.status in ('dispatched', 'acknowledged')
    and r.debit_note_voucher_id is null and r.credit_note_voucher_id is null
    and public.finance_can('view', r.firm_id, r.store_id)
  group by 1, 2
$$;

-- ---------------------------------------------------------------- transfers
-- A new distributor takes over old stock and/or the amount owed, only with a
-- signed document. The old supplier's ledger is cleared by the amount and the
-- new supplier's is charged; chosen batches (remaining pieces) move to the
-- new supplier from the transfer date. Earlier sales stay with the old one.
create or replace function public.record_distributor_transfer(p_firm uuid, p_from uuid, p_to uuid, p_date date, p_amount numeric,
  p_document uuid, p_batches uuid[], p_narration text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t uuid; v_from uuid; v_to uuid; b public.purchase_batches; left_qty numeric; batch_ref uuid; moved_batch uuid; moved integer := 0; amt numeric := round(coalesce(p_amount, 0), 2);
begin
  if not public.finance_can('approve', p_firm, null) then raise exception 'Only the owner or an approver can record a distributor takeover.'; end if;
  if p_from = p_to then raise exception 'Choose two different suppliers.'; end if;
  if not exists(select 1 from public.finance_documents d where d.id = p_document and d.status in ('stored', 'reviewed')) then
    raise exception 'Attach the signed takeover document first.';
  end if;
  if amt < 0 then raise exception 'The amount cannot be negative.'; end if;
  if amt = 0 and coalesce(array_length(p_batches, 1), 0) = 0 then raise exception 'Choose stock to move or an amount to transfer.'; end if;
  insert into public.distributor_transfers(firm_id, from_party_id, to_party_id, transfer_date, liability_amount, document_id, narration, created_by)
  values (p_firm, p_from, p_to, p_date, amt, p_document, btrim(p_narration), auth.uid()) returning id into t;
  if amt > 0 then
    v_from := public.write_voucher(jsonb_build_object('firm_id', p_firm, 'party_id', p_from, 'voucher_type', 'journal', 'voucher_date', p_date, 'reason', 'transfer',
      'narration', 'Taken over by another distributor: ' || btrim(p_narration)),
      jsonb_build_array(jsonb_build_object('account', 'supplier', 'party_id', p_from, 'debit', amt, 'description', 'Liability transferred out'),
                        jsonb_build_object('account', 'supplier_transfer', 'credit', amt)));
    v_to := public.write_voucher(jsonb_build_object('firm_id', p_firm, 'party_id', p_to, 'voucher_type', 'journal', 'voucher_date', p_date, 'reason', 'transfer',
      'narration', 'Took over from another distributor: ' || btrim(p_narration)),
      jsonb_build_array(jsonb_build_object('account', 'supplier_transfer', 'debit', amt),
                        jsonb_build_object('account', 'supplier', 'party_id', p_to, 'credit', amt, 'description', 'Liability transferred in')));
    update public.distributor_transfers set from_voucher_id = v_from, to_voucher_id = v_to where id = t;
    insert into public.document_links(document_id, entity_type, entity_id, role, linked_by) values (p_document, 'voucher', v_from, 'primary', auth.uid()), (p_document, 'voucher', v_to, 'primary', auth.uid());
  end if;
  foreach batch_ref in array coalesce(p_batches, array[]::uuid[]) loop
    select * into b from public.purchase_batches where id = batch_ref and status = 'active' for update;
    if b.id is null or b.firm_id <> p_firm or b.party_id is distinct from p_from then raise exception 'A chosen batch is not the old supplier''s stock in this firm.'; end if;
    left_qty := public.batch_remaining(b.id);
    if left_qty <= 0 then continue; end if;
    insert into public.purchase_batches(firm_id, store_id, party_id, brand_id, source, parent_batch_id, lot_code, barcode, article, size, description, mrp,
      unit_cost, cost_basis, qty_in, received_date, attribution, attribution_note, attributed_by, attributed_at, created_by)
    values (b.firm_id, b.store_id, p_to, b.brand_id, 'transfer_in', b.id, b.lot_code, b.barcode, b.article, b.size, b.description, b.mrp,
      b.unit_cost, 'transferred', left_qty, p_date, 'attributed', 'Distributor takeover', auth.uid(), now(), auth.uid()) returning id into moved_batch;
    insert into public.batch_movements(batch_id, kind, qty, to_batch_id, movement_date, transfer_id, document_id, created_by)
    values (b.id, 'distributor_transfer', left_qty, moved_batch, p_date, t, p_document, auth.uid());
    moved := moved + 1;
  end loop;
  update public.distributor_transfers set batches_moved = moved where id = t;
  return t;
end $$;

-- Moves pieces of batches to another store (same supplier and cost). When the
-- stores bill under different firms, the movement is recorded here only;
-- the inter-firm sale itself belongs in the statutory books.
create or replace function public.transfer_stock_between_stores(p_to_store uuid, p_date date, p_items jsonb, p_document uuid, p_note text)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; b public.purchase_batches; qty numeric; to_firm uuid := public.store_firm_on(p_to_store, p_date); n integer := 0; nb uuid;
begin
  if to_firm is null then raise exception 'The receiving store''s billing firm is not confirmed for that date.'; end if;
  if not public.finance_can('post', to_firm, p_to_store) then raise exception 'You cannot receive stock into this store.'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into b from public.purchase_batches where id = (item->>'batch_id')::uuid and status = 'active' for update;
    qty := (item->>'qty')::numeric;
    if b.id is null or qty is null or qty <= 0 then raise exception 'Choose batches and quantities.'; end if;
    if b.store_id = p_to_store then raise exception 'Stock is already in that store.'; end if;
    if not public.finance_can('post', b.firm_id, b.store_id) then raise exception 'You cannot move stock out of the sending store.'; end if;
    if qty > public.batch_remaining(b.id) then raise exception 'Not enough stock left in batch %.', coalesce(b.lot_code, b.barcode, b.id::text); end if;
    insert into public.purchase_batches(firm_id, store_id, party_id, brand_id, source, parent_batch_id, lot_code, barcode, article, size, description, mrp,
      unit_cost, cost_basis, qty_in, received_date, attribution, attribution_note, attributed_by, attributed_at, created_by)
    values (to_firm, p_to_store, b.party_id, b.brand_id, 'transfer_in', b.id, b.lot_code, b.barcode, b.article, b.size, b.description, b.mrp,
      b.unit_cost, 'transferred', qty, p_date, b.attribution,
      case when to_firm <> b.firm_id then 'Moved between firms: record the inter-firm transfer in the statutory books' else 'Store transfer' end,
      b.attributed_by, b.attributed_at, auth.uid()) returning id into nb;
    insert into public.batch_movements(batch_id, kind, qty, to_batch_id, movement_date, document_id, note, created_by)
    values (b.id, 'store_transfer', qty, nb, p_date, p_document, nullif(btrim(p_note), ''), auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- guards, audit, RLS
create or replace function public.guard_batches() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Stock records are never deleted.'; end if;
  if tg_table_name = 'stock_allocations' and (old.status = 'reversed' or new.qty <> old.qty or new.batch_id is distinct from old.batch_id or new.sales_row_id <> old.sales_row_id) then
    raise exception 'Attributions are reversed, never edited.';
  end if;
  if tg_table_name = 'batch_movements' then raise exception 'Stock movements cannot be edited.'; end if;
  return new;
end $$;
create trigger stock_allocations_guard before update or delete on public.stock_allocations for each row execute function public.guard_batches();
create trigger batch_movements_guard before update or delete on public.batch_movements for each row execute function public.guard_batches();
create trigger purchase_batches_no_delete before delete on public.purchase_batches for each row execute function public.guard_batches();

do $$
declare t text;
begin
  foreach t in array array['purchase_batches', 'supplier_returns', 'supplier_return_lines', 'distributor_transfers', 'batch_movements']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.finance_audit()', t || '_audit', t);
  end loop;
  execute 'create trigger set_supplier_returns_updated_at before update on public.supplier_returns for each row execute function public.set_updated_at()';
  foreach t in array array['purchase_batches', 'batch_movements', 'stock_allocations', 'supplier_returns', 'supplier_return_lines', 'distributor_transfers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())', t || '_active_required', t);
  end loop;
end $$;

-- All writes go through the routines above.
grant select on public.purchase_batches, public.batch_movements, public.stock_allocations, public.supplier_returns,
  public.supplier_return_lines, public.distributor_transfers to authenticated;
create policy purchase_batches_select on public.purchase_batches for select to authenticated using (public.finance_can('view', firm_id, store_id));
create policy batch_movements_select on public.batch_movements for select to authenticated
  using (exists(select 1 from public.purchase_batches b where b.id = batch_id and public.finance_can('view', b.firm_id, b.store_id)));
create policy stock_allocations_select on public.stock_allocations for select to authenticated
  using (public.is_owner() or exists(select 1 from public.billing_firms f where public.finance_can('view', f.id, store_id)));
create policy supplier_returns_select on public.supplier_returns for select to authenticated using (public.finance_can('view', firm_id, store_id));
create policy supplier_return_lines_select on public.supplier_return_lines for select to authenticated
  using (exists(select 1 from public.supplier_returns r where r.id = return_id and public.finance_can('view', r.firm_id, r.store_id)));
create policy distributor_transfers_select on public.distributor_transfers for select to authenticated using (public.finance_can('view', firm_id, null));

-- Managers attach return dispatch papers through Documents (phase 1); the
-- return itself is entered by the owner or an accountant.
revoke all on function public.purchase_batches_on_post(), public.guard_batches(), public.next_return_no(uuid, date) from public, anon, authenticated;
revoke all on function public.batch_remaining(uuid), public.create_opening_batches(uuid, date), public.attribute_batches(uuid, uuid, uuid, text, uuid),
  public.allocate_store_sales(uuid, date, date), public.allocate_sales_line_manually(uuid, uuid, text), public.attribution_summary(uuid, date, date),
  public.create_supplier_return(uuid, uuid, uuid, date, jsonb, text, text),
  public.advance_supplier_return(uuid, text, date, text, numeric, jsonb, numeric, numeric, numeric), public.return_credit_pending(uuid),
  public.record_distributor_transfer(uuid, uuid, uuid, date, numeric, uuid, uuid[], text), public.transfer_stock_between_stores(uuid, date, jsonb, uuid, text)
  from public, anon;
grant execute on function public.batch_remaining(uuid), public.create_opening_batches(uuid, date), public.attribute_batches(uuid, uuid, uuid, text, uuid),
  public.allocate_store_sales(uuid, date, date), public.allocate_sales_line_manually(uuid, uuid, text), public.attribution_summary(uuid, date, date),
  public.create_supplier_return(uuid, uuid, uuid, date, jsonb, text, text),
  public.advance_supplier_return(uuid, text, date, text, numeric, jsonb, numeric, numeric, numeric), public.return_credit_pending(uuid),
  public.record_distributor_transfer(uuid, uuid, uuid, date, numeric, uuid, uuid[], text), public.transfer_stock_between_stores(uuid, date, jsonb, uuid, text)
  to authenticated;

commit;
