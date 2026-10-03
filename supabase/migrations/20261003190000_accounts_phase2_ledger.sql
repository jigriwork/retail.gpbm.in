-- Company Accounts, phase 2: purchase invoices, balanced vouchers, payments,
-- refunds, credit/debit notes, opening balances, bill allocation, disputes
-- and party ledgers. Each billing firm keeps its own books.
--
-- Supplier balance is never typed in: it is the sum of posted voucher lines on
-- the supplier account (credit = we owe). Posted vouchers are never edited or
-- deleted; corrections are reversals.
begin;

-- ---------------------------------------------------------------- vouchers
create table public.voucher_sequences (
  firm_id uuid not null references public.billing_firms(id),
  financial_year text not null,
  voucher_type text not null,
  last_no integer not null default 0,
  primary key (firm_id, financial_year, voucher_type)
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  store_id uuid references public.stores(id),
  party_id uuid references public.parties(id),
  voucher_type text not null check (voucher_type in ('opening', 'purchase', 'payment', 'receipt', 'credit_note', 'debit_note', 'journal')),
  voucher_no text not null,
  financial_year text not null,
  voucher_date date not null,
  reference_no text check (reference_no is null or length(reference_no) <= 80),
  reference_date date,
  -- Amount on the supplier account; side says whether it increases (credit)
  -- or reduces (debit) what we owe.
  amount numeric(14,2) not null check (amount > 0),
  supplier_side text not null check (supplier_side in ('debit', 'credit')),
  due_date date,
  settlement_basis text check (settlement_basis is null or settlement_basis in ('purchase', 'sales', 'to_confirm')),
  reason text check (reason is null or reason in ('return', 'margin', 'promotion', 'rate_difference', 'shortage', 'transfer', 'other')),
  payment_mode text check (payment_mode is null or payment_mode in ('bank', 'cash', 'upi', 'cheque', 'other')),
  narration text check (narration is null or length(narration) <= 1000),
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  reverses_voucher_id uuid references public.vouchers(id),
  reversed_by_voucher_id uuid references public.vouchers(id),
  reversal_reason text check (reversal_reason is null or length(reversal_reason) <= 500),
  posted_by uuid references public.profiles(id),
  posted_at timestamptz not null default now(),
  check (supplier_side = 'credit' or party_id is not null),
  check (party_id is not null or voucher_type = 'journal')
);
create unique index vouchers_no_key on public.vouchers (firm_id, voucher_no);
create index vouchers_party_idx on public.vouchers (firm_id, party_id, voucher_date, posted_at);
create index vouchers_date_idx on public.vouchers (firm_id, voucher_date desc);

create table public.voucher_lines (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id),
  line_no integer not null,
  account text not null check (account in ('supplier', 'purchases', 'input_cgst', 'input_sgst', 'input_igst', 'freight',
    'other_charges', 'discount_received', 'round_off', 'bank', 'cash', 'purchase_returns', 'claims_income',
    'opening_balance', 'supplier_transfer')),
  party_id uuid references public.parties(id),
  brand_id uuid references public.brands(id),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  description text check (description is null or length(description) <= 300),
  check ((debit = 0) <> (credit = 0)),
  check (account <> 'supplier' or party_id is not null)
);
create unique index voucher_lines_no_key on public.voucher_lines (voucher_id, line_no);
create index voucher_lines_supplier_idx on public.voucher_lines (party_id, voucher_id) where account = 'supplier';

-- Every voucher must balance when the transaction commits.
create or replace function public.check_voucher_balanced() returns trigger
language plpgsql set search_path = '' as $$
declare d numeric; c numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d, c from public.voucher_lines where voucher_id = new.voucher_id;
  if d <> c then raise exception 'Voucher does not balance: debit % vs credit %', d, c; end if;
  return null;
end $$;
create constraint trigger voucher_lines_balanced after insert on public.voucher_lines
  deferrable initially deferred for each row execute function public.check_voucher_balanced();

create or replace function public.guard_posted_voucher() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'voucher_lines' then raise exception 'Posted voucher lines cannot be changed. Reverse the voucher instead.'; end if;
  if tg_op = 'DELETE' then raise exception 'Vouchers cannot be deleted. Reverse them instead.'; end if;
  if old.status = 'posted' and new.status = 'reversed' and new.reversed_by_voucher_id is not null
     and row(new.firm_id, new.party_id, new.voucher_type, new.voucher_no, new.voucher_date, new.amount, new.supplier_side, new.due_date)
       is not distinct from row(old.firm_id, old.party_id, old.voucher_type, old.voucher_no, old.voucher_date, old.amount, old.supplier_side, old.due_date) then
    return new;
  end if;
  raise exception 'Posted vouchers cannot be changed. Reverse the voucher instead.';
end $$;
create trigger vouchers_guard before update or delete on public.vouchers for each row execute function public.guard_posted_voucher();
create trigger voucher_lines_guard before update or delete on public.voucher_lines for each row execute function public.guard_posted_voucher();

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
  return prefix || '/' || fy || '/' || lpad(n::text, 4, '0');
end $$;

-- Writes one posted voucher with its lines (jsonb array of
-- {account, party_id, brand_id, debit, credit, description}). Internal: the
-- public routines below check permission and business rules first.
create or replace function public.write_voucher(p_header jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_date date := (p_header->>'voucher_date')::date; v_firm uuid := (p_header->>'firm_id')::uuid; i integer := 0; line jsonb;
  v_party uuid := nullif(p_header->>'party_id', '')::uuid; supplier_debit numeric := 0; supplier_credit numeric := 0;
begin
  for line in select value from jsonb_array_elements(p_lines) loop
    if line->>'account' = 'supplier' then
      if (line->>'party_id')::uuid is distinct from v_party then raise exception 'Supplier line must be for the voucher supplier.'; end if;
      supplier_debit := supplier_debit + coalesce((line->>'debit')::numeric, 0);
      supplier_credit := supplier_credit + coalesce((line->>'credit')::numeric, 0);
    end if;
  end loop;
  if v_party is not null and (supplier_debit = 0) = (supplier_credit = 0) then raise exception 'A supplier voucher needs one supplier amount.'; end if;
  insert into public.vouchers(firm_id, store_id, party_id, voucher_type, voucher_no, financial_year, voucher_date, reference_no,
    reference_date, amount, supplier_side, due_date, settlement_basis, reason, payment_mode, narration, reverses_voucher_id, posted_by)
  values (v_firm, nullif(p_header->>'store_id', '')::uuid, v_party, p_header->>'voucher_type',
    public.next_voucher_no(v_firm, v_date, p_header->>'voucher_type'), public.financial_year(v_date), v_date,
    nullif(btrim(p_header->>'reference_no'), ''), nullif(p_header->>'reference_date', '')::date,
    coalesce(nullif(supplier_debit + supplier_credit, 0), (select sum(coalesce((l->>'debit')::numeric, 0)) from jsonb_array_elements(p_lines) l)),
    case when supplier_debit > 0 then 'debit' else 'credit' end,
    nullif(p_header->>'due_date', '')::date, nullif(p_header->>'settlement_basis', ''), nullif(p_header->>'reason', ''),
    nullif(p_header->>'payment_mode', ''), nullif(btrim(p_header->>'narration'), ''), nullif(p_header->>'reverses_voucher_id', '')::uuid, auth.uid())
  returning id into v_id;
  for line in select value from jsonb_array_elements(p_lines) loop
    if coalesce((line->>'debit')::numeric, 0) = 0 and coalesce((line->>'credit')::numeric, 0) = 0 then continue; end if;
    i := i + 1;
    insert into public.voucher_lines(voucher_id, line_no, account, party_id, brand_id, debit, credit, description)
    values (v_id, i, line->>'account', nullif(line->>'party_id', '')::uuid, nullif(line->>'brand_id', '')::uuid,
      round(coalesce((line->>'debit')::numeric, 0), 2), round(coalesce((line->>'credit')::numeric, 0), 2), line->>'description');
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------- allocations
-- Links a voucher that reduces what we owe (payment, CN, DN, advance) to one
-- that increases it (purchase, opening bill, refund). Never more than either
-- side has open; released, never deleted.
create table public.voucher_allocations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  party_id uuid not null references public.parties(id),
  from_voucher_id uuid not null references public.vouchers(id),
  to_voucher_id uuid not null references public.vouchers(id),
  amount numeric(14,2) not null check (amount > 0),
  allocated_by uuid references public.profiles(id),
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references public.profiles(id),
  release_reason text check (release_reason is null or length(release_reason) <= 500)
);
create index voucher_allocations_from_idx on public.voucher_allocations (from_voucher_id) where released_at is null;
create index voucher_allocations_to_idx on public.voucher_allocations (to_voucher_id) where released_at is null;

create or replace function public.voucher_open_amount(p_voucher uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select v.amount - coalesce((select sum(a.amount) from public.voucher_allocations a
    where a.released_at is null and (case when v.supplier_side = 'debit' then a.from_voucher_id else a.to_voucher_id end) = v.id), 0)
  from public.vouchers v where v.id = p_voucher and v.status = 'posted'
$$;

create or replace function public.allocate_voucher(p_from uuid, p_to uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f public.vouchers; t public.vouchers; v_id uuid;
begin
  if p_amount is null or round(p_amount, 2) <= 0 then raise exception 'Enter an amount to adjust.'; end if;
  select * into f from public.vouchers where id = p_from for update;
  select * into t from public.vouchers where id = p_to for update;
  if f.id is null or t.id is null or f.status <> 'posted' or t.status <> 'posted' then raise exception 'Both entries must be posted.'; end if;
  if not public.finance_can('post', f.firm_id, f.store_id) or not public.finance_can('post', t.firm_id, t.store_id) then
    raise exception 'You cannot adjust entries for this firm or store.';
  end if;
  if f.firm_id <> t.firm_id or f.party_id is distinct from t.party_id then raise exception 'Entries must be for the same supplier in the same firm.'; end if;
  if f.supplier_side <> 'debit' or t.supplier_side <> 'credit' then raise exception 'Adjust a payment, note or advance against a bill.'; end if;
  if round(p_amount, 2) > public.voucher_open_amount(p_from) then raise exception 'More than the unadjusted amount of %.', f.voucher_no; end if;
  if round(p_amount, 2) > public.voucher_open_amount(p_to) then raise exception 'More than the amount still open on %.', t.voucher_no; end if;
  insert into public.voucher_allocations(firm_id, party_id, from_voucher_id, to_voucher_id, amount, allocated_by)
  values (f.firm_id, f.party_id, f.id, t.id, round(p_amount, 2), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.release_allocation(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.voucher_allocations;
begin
  select * into a from public.voucher_allocations where id = p_id for update;
  if a.id is null or a.released_at is not null then raise exception 'Adjustment not found.'; end if;
  if not public.finance_can('post', a.firm_id, null) and not exists(select 1 from public.vouchers v where v.id = a.from_voucher_id and public.finance_can('post', v.firm_id, v.store_id)) then
    raise exception 'You cannot change adjustments for this firm.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why the adjustment is being undone.'; end if;
  update public.voucher_allocations set released_at = now(), released_by = auth.uid(), release_reason = btrim(p_reason) where id = p_id;
end $$;

create or replace function public.guard_allocation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Adjustments are released, never deleted.'; end if;
  if old.released_at is not null or new.amount <> old.amount or new.from_voucher_id <> old.from_voucher_id or new.to_voucher_id <> old.to_voucher_id then
    raise exception 'Adjustments cannot be edited; release and add a new one.';
  end if;
  return new;
end $$;
create trigger voucher_allocations_guard before update or delete on public.voucher_allocations for each row execute function public.guard_allocation();

-- Allocations given as [{"voucher_id": "...", "amount": 123.45}] against the
-- new voucher (which is on the debit side for payments/notes, credit for refunds).
create or replace function public.apply_allocations(p_voucher uuid, p_allocations jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.vouchers; item jsonb;
begin
  select * into v from public.vouchers where id = p_voucher;
  for item in select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    if coalesce((item->>'amount')::numeric, 0) <= 0 then continue; end if;
    if v.supplier_side = 'debit' then perform public.allocate_voucher(v.id, (item->>'voucher_id')::uuid, (item->>'amount')::numeric);
    else perform public.allocate_voucher((item->>'voucher_id')::uuid, v.id, (item->>'amount')::numeric); end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- purchase invoices
create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  store_id uuid not null references public.stores(id),
  party_id uuid not null references public.parties(id),
  supplier_invoice_no text not null check (length(btrim(supplier_invoice_no)) between 1 and 80),
  invoice_no_key text generated always as (upper(regexp_replace(supplier_invoice_no, '[^a-zA-Z0-9]', '', 'g'))) stored,
  invoice_date date not null,
  financial_year text not null,
  received_date date,
  total_qty numeric(14,3),
  taxable_amount numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  freight_amount numeric(14,2) not null default 0,
  other_charges numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  round_off numeric(14,2) not null default 0,
  invoice_total numeric(14,2) not null default 0,
  due_date date,
  due_date_source text check (due_date_source is null or due_date_source in ('terms', 'manual')),
  settlement_basis text check (settlement_basis is null or settlement_basis in ('purchase', 'sales', 'to_confirm')),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  voucher_id uuid references public.vouchers(id),
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_by uuid references public.profiles(id),
  posted_at timestamptz,
  check (taxable_amount >= 0 and cgst_amount >= 0 and sgst_amount >= 0 and igst_amount >= 0 and freight_amount >= 0
    and other_charges >= 0 and discount_amount >= 0 and invoice_total >= 0)
);
-- One supplier invoice number per supplier per financial year: the PDF, the
-- Logic export and the item sheet all enrich this one purchase.
create unique index purchase_invoices_no_key on public.purchase_invoices (party_id, financial_year, invoice_no_key) where status <> 'cancelled';
create index purchase_invoices_scope_idx on public.purchase_invoices (firm_id, store_id, invoice_date desc);

create table public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices(id),
  line_no integer not null,
  brand_id uuid references public.brands(id),
  article text check (article is null or length(article) <= 120),
  description text check (description is null or length(description) <= 300),
  barcode text check (barcode is null or length(barcode) <= 40),
  size text check (size is null or length(size) <= 40),
  colour text check (colour is null or length(colour) <= 60),
  hsn_code text check (hsn_code is null or length(hsn_code) <= 12),
  quantity numeric(14,3) not null check (quantity > 0),
  mrp numeric(14,2),
  unit_rate numeric(14,4),
  taxable_amount numeric(14,2) not null check (taxable_amount >= 0),
  gst_rate numeric(5,2) check (gst_rate is null or gst_rate between 0 and 40),
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  line_total numeric(14,2),
  source text not null default 'manual' check (source in ('manual', 'item_sheet', 'purchase_export', 'pdf')),
  source_document_id uuid references public.finance_documents(id),
  created_at timestamptz not null default now()
);
create unique index purchase_invoice_lines_no_key on public.purchase_invoice_lines (invoice_id, line_no);
create index purchase_invoice_lines_barcode_idx on public.purchase_invoice_lines (barcode) where barcode is not null;

create or replace function public.guard_purchase_invoice() returns trigger
language plpgsql set search_path = '' as $$
declare inv public.purchase_invoices;
begin
  if tg_table_name = 'purchase_invoice_lines' then
    select * into inv from public.purchase_invoices where id = coalesce(new.invoice_id, old.invoice_id);
    if inv.status <> 'draft' then raise exception 'Lines of a posted invoice cannot change. Reverse it and enter it again.'; end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then raise exception 'Invoices are cancelled, never deleted.'; end if;
  if old.status = 'draft' then
    if new.status = 'posted' and current_setting('accounts.posting', true) is distinct from 'on' then
      raise exception 'Invoices are posted only through Post invoice.';
    end if;
    if new.status = 'draft' and new.voucher_id is not null then raise exception 'Invoices are posted only through Post invoice.'; end if;
    new.financial_year := public.financial_year(new.invoice_date);
    return new;
  end if;
  -- Posted: only the posting routine's cancel-on-reversal may change status.
  if old.status = 'posted' and new.status = 'cancelled' and current_setting('accounts.reversing', true) = 'on' then return new; end if;
  raise exception 'A posted invoice cannot be edited. Reverse it to correct it.';
end $$;
create trigger purchase_invoices_guard before update or delete on public.purchase_invoices for each row execute function public.guard_purchase_invoice();
create trigger purchase_invoice_lines_guard before insert or update or delete on public.purchase_invoice_lines for each row execute function public.guard_purchase_invoice();

create or replace function public.set_purchase_financial_year() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.financial_year := public.financial_year(new.invoice_date);
  if new.status <> 'draft' then raise exception 'New invoices start as drafts.'; end if;
  return new;
end $$;
create trigger purchase_invoices_fy before insert on public.purchase_invoices for each row execute function public.set_purchase_financial_year();

-- Checks an invoice: header arithmetic to the paisa, and lines (when entered)
-- against the header within ₹1 for taxable, tax and quantity.
create or replace function public.purchase_invoice_check(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with inv as (select * from public.purchase_invoices where id = p_id),
  l as (select count(*) n, coalesce(sum(quantity), 0) qty, coalesce(sum(taxable_amount), 0) taxable,
          coalesce(sum(cgst_amount), 0) cgst, coalesce(sum(sgst_amount), 0) sgst, coalesce(sum(igst_amount), 0) igst,
          count(*) filter (where brand_id is null) no_brand
        from public.purchase_invoice_lines where invoice_id = p_id)
  select jsonb_build_object(
    'lines', l.n, 'line_qty', l.qty, 'line_taxable', l.taxable, 'line_tax', l.cgst + l.sgst + l.igst, 'lines_without_brand', l.no_brand,
    'computed_total', inv.taxable_amount + inv.cgst_amount + inv.sgst_amount + inv.igst_amount + inv.freight_amount + inv.other_charges - inv.discount_amount + inv.round_off,
    'total_ok', inv.invoice_total = inv.taxable_amount + inv.cgst_amount + inv.sgst_amount + inv.igst_amount + inv.freight_amount + inv.other_charges - inv.discount_amount + inv.round_off,
    'taxable_ok', l.n = 0 or abs(l.taxable - inv.taxable_amount) <= 1,
    -- Item sheets often carry no numeric GST; then tax is checked on the invoice only.
    'lines_have_tax', (l.cgst + l.sgst + l.igst) <> 0,
    'tax_ok', l.n = 0 or (l.cgst + l.sgst + l.igst) = 0 or abs((l.cgst + l.sgst + l.igst) - (inv.cgst_amount + inv.sgst_amount + inv.igst_amount)) <= 1,
    'qty_ok', l.n = 0 or inv.total_qty is null or l.qty = inv.total_qty,
    'can_post', inv.status = 'draft' and inv.invoice_total > 0
      and inv.invoice_total = inv.taxable_amount + inv.cgst_amount + inv.sgst_amount + inv.igst_amount + inv.freight_amount + inv.other_charges - inv.discount_amount + inv.round_off
      and (l.n = 0 or (abs(l.taxable - inv.taxable_amount) <= 1 and ((l.cgst + l.sgst + l.igst) = 0 or abs((l.cgst + l.sgst + l.igst) - (inv.cgst_amount + inv.sgst_amount + inv.igst_amount)) <= 1)
        and (inv.total_qty is null or l.qty = inv.total_qty))))
  from inv, l
$$;

-- Posts a draft invoice: one balanced purchase voucher. Due date comes from
-- confirmed terms for pay-against-purchase suppliers (or a manual date);
-- invoices of pay-against-sales suppliers get no due date here.
create or replace function public.post_purchase_invoice(p_id uuid, p_brand uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.purchase_invoices; chk jsonb; v_id uuid; lines jsonb := '[]'::jsonb; brand_line record; basis text; terms public.company_terms;
  brands uuid[]; header_brand uuid := p_brand;
begin
  select * into inv from public.purchase_invoices where id = p_id for update;
  if inv.id is null or inv.status <> 'draft' then raise exception 'Only draft invoices can be posted.'; end if;
  if not public.finance_can('post', inv.firm_id, inv.store_id) then raise exception 'You cannot post purchases for this firm or store.'; end if;
  chk := public.purchase_invoice_check(p_id);
  if not (chk->>'can_post')::boolean then raise exception 'The invoice totals do not add up yet. Check the highlighted figures.'; end if;

  select array_agg(distinct brand_id) filter (where brand_id is not null) into brands from public.purchase_invoice_lines where invoice_id = p_id;
  if header_brand is null and coalesce(array_length(brands, 1), 0) = 1 then header_brand := brands[1]; end if;
  -- Pay-against basis of the confirmed arrangements in force for these brands.
  select case when count(distinct a.settlement_basis) = 1 then min(a.settlement_basis) else 'to_confirm' end into basis
  from public.supply_arrangements a
  where a.party_id = inv.party_id and a.firm_id = inv.firm_id and a.status = 'confirmed'
    and (a.store_id is null or a.store_id = inv.store_id)
    and inv.invoice_date between a.valid_from and coalesce(a.valid_to, 'infinity'::date)
    and (a.brand_id = any(coalesce(brands, array[header_brand])));
  basis := coalesce(basis, 'to_confirm');
  if inv.due_date is null and basis = 'purchase' then
    select t.* into terms from public.company_terms t join public.supply_arrangements a on a.id = t.arrangement_id
    where a.party_id = inv.party_id and a.firm_id = inv.firm_id and t.status = 'confirmed' and t.credit_days is not null
      and (a.store_id is null or a.store_id = inv.store_id) and a.brand_id = any(coalesce(brands, array[header_brand]))
      and inv.invoice_date between t.effective_from and coalesce(t.effective_to, 'infinity'::date)
    order by t.credit_days limit 1;
    if terms.id is not null then
      update public.purchase_invoices set due_date = inv.invoice_date + terms.credit_days, due_date_source = 'terms' where id = p_id;
      inv.due_date := inv.invoice_date + terms.credit_days;
    end if;
  end if;

  -- Purchases by brand when lines exist, else one line for the header brand.
  if exists(select 1 from public.purchase_invoice_lines where invoice_id = p_id) then
    for brand_line in
      select brand_id, sum(taxable_amount) taxable from public.purchase_invoice_lines where invoice_id = p_id group by brand_id
    loop
      lines := lines || jsonb_build_object('account', 'purchases', 'brand_id', brand_line.brand_id, 'debit', brand_line.taxable, 'description', 'Purchases');
    end loop;
    -- Header taxable may differ from the line sum by up to ₹1 (rounding).
    if (select sum(taxable_amount) from public.purchase_invoice_lines where invoice_id = p_id) <> inv.taxable_amount then
      lines := lines || jsonb_build_object('account', 'round_off',
        case when inv.taxable_amount > (select sum(taxable_amount) from public.purchase_invoice_lines where invoice_id = p_id) then 'debit' else 'credit' end,
        abs(inv.taxable_amount - (select sum(taxable_amount) from public.purchase_invoice_lines where invoice_id = p_id)), 'description', 'Taxable rounding');
    end if;
  else
    lines := lines || jsonb_build_object('account', 'purchases', 'brand_id', header_brand, 'debit', inv.taxable_amount, 'description', 'Purchases');
  end if;
  lines := lines
    || jsonb_build_object('account', 'input_cgst', 'debit', inv.cgst_amount)
    || jsonb_build_object('account', 'input_sgst', 'debit', inv.sgst_amount)
    || jsonb_build_object('account', 'input_igst', 'debit', inv.igst_amount)
    || jsonb_build_object('account', 'freight', 'debit', inv.freight_amount)
    || jsonb_build_object('account', 'other_charges', 'debit', inv.other_charges)
    || jsonb_build_object('account', 'discount_received', 'credit', inv.discount_amount)
    || jsonb_build_object('account', 'round_off', case when inv.round_off >= 0 then 'debit' else 'credit' end, abs(inv.round_off), 'description', 'Invoice round off')
    || jsonb_build_object('account', 'supplier', 'party_id', inv.party_id, 'credit', inv.invoice_total, 'description', 'Invoice ' || inv.supplier_invoice_no);
  v_id := public.write_voucher(jsonb_build_object('firm_id', inv.firm_id, 'store_id', inv.store_id, 'party_id', inv.party_id,
    'voucher_type', 'purchase', 'voucher_date', inv.invoice_date, 'reference_no', inv.supplier_invoice_no, 'reference_date', inv.invoice_date,
    'due_date', inv.due_date, 'settlement_basis', basis, 'narration', inv.notes), lines);
  perform set_config('accounts.posting', 'on', true);
  update public.purchase_invoices set status = 'posted', voucher_id = v_id, settlement_basis = basis, posted_by = auth.uid(), posted_at = now() where id = p_id;
  perform set_config('accounts.posting', 'off', true);
  return v_id;
end $$;

-- ---------------------------------------------------------------- payments, refunds, notes, opening balances
create or replace function public.record_supplier_voucher(
  p_type text, p_firm uuid, p_store uuid, p_party uuid, p_date date, p_amount numeric, p_mode text, p_reference text,
  p_reference_date date, p_reason text, p_taxable numeric, p_cgst numeric, p_sgst numeric, p_igst numeric, p_narration text,
  p_allocations jsonb, p_due_date date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; lines jsonb; amt numeric := round(coalesce(p_amount, 0), 2); tax numeric := round(coalesce(p_cgst, 0) + coalesce(p_sgst, 0) + coalesce(p_igst, 0), 2);
  other_account text;
begin
  if not public.finance_can('post', p_firm, p_store) then raise exception 'You cannot post entries for this firm or store.'; end if;
  if p_party is null or not exists(select 1 from public.parties where id = p_party) then raise exception 'Choose the supplier.'; end if;
  if p_date is null then raise exception 'Choose the date.'; end if;
  if amt <= 0 then raise exception 'Enter an amount above zero.'; end if;
  if p_type in ('payment', 'receipt') then
    if coalesce(p_mode, '') not in ('bank', 'cash', 'upi', 'cheque', 'other') then raise exception 'Choose how it was paid.'; end if;
    other_account := case when p_mode = 'cash' then 'cash' else 'bank' end;
    lines := case p_type
      when 'payment' then jsonb_build_array(
        jsonb_build_object('account', 'supplier', 'party_id', p_party, 'debit', amt, 'description', 'Payment'),
        jsonb_build_object('account', other_account, 'credit', amt))
      else jsonb_build_array(
        jsonb_build_object('account', other_account, 'debit', amt),
        jsonb_build_object('account', 'supplier', 'party_id', p_party, 'credit', amt, 'description', 'Refund received')) end;
  elsif p_type in ('credit_note', 'debit_note') then
    if coalesce(p_reason, '') not in ('return', 'margin', 'promotion', 'rate_difference', 'shortage', 'other') then raise exception 'Choose the reason.'; end if;
    if p_taxable is not null and round(p_taxable, 2) + tax <> amt then raise exception 'Taxable value plus GST must equal the note amount.'; end if;
    other_account := case when p_reason = 'return' then 'purchase_returns' when p_reason in ('margin', 'promotion') then 'claims_income' else 'discount_received' end;
    lines := jsonb_build_array(
      jsonb_build_object('account', 'supplier', 'party_id', p_party, 'debit', amt, 'description', case p_type when 'credit_note' then 'Credit note' else 'Debit note' end),
      jsonb_build_object('account', other_account, 'credit', amt - tax),
      jsonb_build_object('account', 'input_cgst', 'credit', round(coalesce(p_cgst, 0), 2)),
      jsonb_build_object('account', 'input_sgst', 'credit', round(coalesce(p_sgst, 0), 2)),
      jsonb_build_object('account', 'input_igst', 'credit', round(coalesce(p_igst, 0), 2)));
  elsif p_type = 'opening' then
    if length(btrim(coalesce(p_narration, ''))) < 3 then raise exception 'Say what the opening balance is based on.'; end if;
    -- p_mode: 'payable' = we owed the supplier; 'advance' = supplier owed us.
    if coalesce(p_mode, '') not in ('payable', 'advance') then raise exception 'Choose whether we owed them or they owed us.'; end if;
    lines := case p_mode
      when 'payable' then jsonb_build_array(
        jsonb_build_object('account', 'opening_balance', 'debit', amt),
        jsonb_build_object('account', 'supplier', 'party_id', p_party, 'credit', amt, 'description', 'Opening balance'))
      else jsonb_build_array(
        jsonb_build_object('account', 'supplier', 'party_id', p_party, 'debit', amt, 'description', 'Opening advance'),
        jsonb_build_object('account', 'opening_balance', 'credit', amt)) end;
  else
    raise exception 'Unknown entry type.';
  end if;
  v_id := public.write_voucher(jsonb_build_object('firm_id', p_firm, 'store_id', p_store, 'party_id', p_party, 'voucher_type', p_type,
    'voucher_date', p_date, 'reference_no', p_reference, 'reference_date', p_reference_date, 'reason', p_reason,
    'payment_mode', case when p_type in ('payment', 'receipt') then p_mode end, 'narration', p_narration,
    'due_date', case when p_type = 'opening' and p_mode = 'payable' then p_due_date end), lines);
  perform public.apply_allocations(v_id, p_allocations);
  return v_id;
end $$;

-- Reverses a posted voucher with a mirror entry dated p_date. Its
-- adjustments are released first; a reversed purchase invoice is cancelled
-- so it can be entered again correctly.
create or replace function public.reverse_voucher(p_id uuid, p_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.vouchers; v_new uuid; lines jsonb;
begin
  select * into v from public.vouchers where id = p_id for update;
  if v.id is null or v.status <> 'posted' or v.reverses_voucher_id is not null then raise exception 'Only a posted original entry can be reversed.'; end if;
  if not public.finance_can('post', v.firm_id, v.store_id) then raise exception 'You cannot reverse entries for this firm or store.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why the entry is reversed.'; end if;
  if p_date is null or p_date < v.voucher_date then raise exception 'The reversal date cannot be before the entry.'; end if;
  update public.voucher_allocations set released_at = now(), released_by = auth.uid(), release_reason = 'Entry reversed: ' || btrim(p_reason)
  where released_at is null and (from_voucher_id = v.id or to_voucher_id = v.id);
  select jsonb_agg(jsonb_build_object('account', l.account, 'party_id', l.party_id, 'brand_id', l.brand_id,
    'debit', l.credit, 'credit', l.debit, 'description', 'Reversal: ' || coalesce(l.description, '')) order by l.line_no)
  into lines from public.voucher_lines l where l.voucher_id = v.id;
  v_new := public.write_voucher(jsonb_build_object('firm_id', v.firm_id, 'store_id', v.store_id, 'party_id', v.party_id,
    'voucher_type', v.voucher_type, 'voucher_date', p_date, 'reference_no', v.voucher_no, 'reference_date', v.voucher_date,
    'reason', v.reason, 'payment_mode', v.payment_mode, 'narration', 'Reversal of ' || v.voucher_no || ': ' || btrim(p_reason),
    'reverses_voucher_id', v.id), lines);
  update public.vouchers set status = 'reversed', reversed_by_voucher_id = v_new, reversal_reason = btrim(p_reason) where id = v.id;
  update public.vouchers set status = 'reversed', reversed_by_voucher_id = v.id, reversal_reason = btrim(p_reason) where id = v_new;
  perform set_config('accounts.reversing', 'on', true);
  update public.purchase_invoices set status = 'cancelled' where voucher_id = v.id and status = 'posted';
  perform set_config('accounts.reversing', 'off', true);
  return v_new;
end $$;

-- ---------------------------------------------------------------- documents, disputes
create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.finance_documents(id),
  entity_type text not null check (entity_type in ('purchase_invoice', 'voucher', 'dispute')),
  entity_id uuid not null,
  role text not null default 'supporting' check (role in ('primary', 'supporting')),
  linked_by uuid references public.profiles(id),
  linked_at timestamptz not null default now()
);
create unique index document_links_key on public.document_links (document_id, entity_type, entity_id);
create index document_links_entity_idx on public.document_links (entity_type, entity_id);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  store_id uuid references public.stores(id),
  party_id uuid not null references public.parties(id),
  voucher_id uuid references public.vouchers(id),
  amount numeric(14,2) not null check (amount > 0),
  title text not null check (length(btrim(title)) between 3 and 200),
  details text check (details is null or length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'withdrawn')),
  resolution text check (resolution is null or length(resolution) <= 2000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index disputes_party_idx on public.disputes (firm_id, party_id) where status = 'open';

-- Saved column mappings for supplier item sheets and Logic purchase exports.
create table public.purchase_import_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  party_id uuid references public.parties(id),
  kind text not null check (kind in ('item_sheet', 'purchase_export')),
  header_row integer not null default 1 check (header_row between 1 and 50),
  column_map jsonb not null check (jsonb_typeof(column_map) = 'object'),
  verified boolean not null default false,
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- balances and ledger
-- Per firm and supplier: ledger balance (credit = we owe), what is due under
-- the terms, overdue, open bills without a due date, unadjusted payments
-- (advance), unadjusted notes, credit notes received, and open disputes.
create or replace function public.party_balances(p_firm uuid, p_party uuid default null, p_as_of date default null)
returns table (firm_id uuid, party_id uuid, ledger_balance numeric, open_bills numeric, due_now numeric, overdue numeric,
  due_unknown numeric, sales_basis_open numeric, advance numeric, unadjusted_notes numeric, cn_received numeric, disputed numeric)
language sql stable security definer set search_path = '' as $$
  with today as (select coalesce(p_as_of, (now() at time zone 'Asia/Kolkata')::date) d),
  scoped as (
    select v.* from public.vouchers v
    where (p_firm is null or v.firm_id = p_firm) and (p_party is null or v.party_id = p_party) and v.party_id is not null
      and v.voucher_date <= (select d from today)
      and public.finance_can('view', v.firm_id, v.store_id)),
  bal as (
    select s.firm_id, s.party_id, sum(l.credit - l.debit) ledger_balance
    from scoped s join public.voucher_lines l on l.voucher_id = s.id and l.account = 'supplier' group by 1, 2),
  open_v as (
    select s.*, public.voucher_open_amount(s.id) open_amount from scoped s where s.status = 'posted'),
  agg as (
    select o.firm_id, o.party_id,
      sum(o.open_amount) filter (where o.supplier_side = 'credit') open_bills,
      sum(o.open_amount) filter (where o.supplier_side = 'credit' and o.due_date is not null and o.due_date <= (select d from today)) due_now,
      sum(o.open_amount) filter (where o.supplier_side = 'credit' and o.due_date is not null and o.due_date < (select d from today)) overdue,
      sum(o.open_amount) filter (where o.supplier_side = 'credit' and o.due_date is null and coalesce(o.settlement_basis, 'to_confirm') <> 'sales') due_unknown,
      sum(o.open_amount) filter (where o.supplier_side = 'credit' and o.settlement_basis = 'sales') sales_basis_open,
      sum(o.open_amount) filter (where o.supplier_side = 'debit' and o.voucher_type in ('payment', 'opening')) advance,
      sum(o.open_amount) filter (where o.supplier_side = 'debit' and o.voucher_type in ('credit_note', 'debit_note')) unadjusted_notes
    from open_v o group by 1, 2),
  cn as (
    select s.firm_id, s.party_id, sum(s.amount) cn_received from scoped s
    where s.voucher_type = 'credit_note' and s.status = 'posted' group by 1, 2),
  dis as (
    select d.firm_id, d.party_id, sum(d.amount) disputed from public.disputes d
    where d.status = 'open' and (p_firm is null or d.firm_id = p_firm) and (p_party is null or d.party_id = p_party)
      and public.finance_can('view', d.firm_id, d.store_id) group by 1, 2),
  keys as (select firm_id, party_id from bal union select firm_id, party_id from dis)
  select k.firm_id, k.party_id, coalesce(b.ledger_balance, 0), coalesce(a.open_bills, 0), coalesce(a.due_now, 0), coalesce(a.overdue, 0),
    coalesce(a.due_unknown, 0), coalesce(a.sales_basis_open, 0), coalesce(a.advance, 0), coalesce(a.unadjusted_notes, 0),
    coalesce(c.cn_received, 0), coalesce(d.disputed, 0)
  from keys k left join bal b using (firm_id, party_id) left join agg a using (firm_id, party_id)
    left join cn c using (firm_id, party_id) left join dis d using (firm_id, party_id)
$$;

-- Open bills (side credit) or unadjusted payments/notes (side debit) of one
-- supplier in one firm, oldest due first, in one query.
create or replace function public.open_vouchers(p_firm uuid, p_party uuid, p_side text)
returns table (id uuid, voucher_no text, voucher_type text, voucher_date date, reference_no text, due_date date,
  amount numeric, settlement_basis text, store_id uuid, open_amount numeric)
language sql stable security definer set search_path = '' as $$
  select v.id, v.voucher_no, v.voucher_type, v.voucher_date, v.reference_no, v.due_date, v.amount, v.settlement_basis, v.store_id,
    v.amount - coalesce(a.allocated, 0)
  from public.vouchers v
  left join lateral (
    select sum(x.amount) allocated from public.voucher_allocations x
    where x.released_at is null and (case when v.supplier_side = 'debit' then x.from_voucher_id else x.to_voucher_id end) = v.id) a on true
  where v.firm_id = p_firm and v.party_id = p_party and v.status = 'posted' and v.supplier_side = p_side
    and v.amount > coalesce(a.allocated, 0) and public.finance_can('view', v.firm_id, v.store_id)
  order by v.due_date nulls last, v.voucher_date, v.posted_at
  limit 500
$$;

-- One supplier's ledger in one firm, with running balance, a page at a time.
create or replace function public.party_ledger(p_firm uuid, p_party uuid, p_from date, p_to date, p_offset integer, p_limit integer)
returns table (voucher_id uuid, voucher_no text, voucher_type text, voucher_date date, reference_no text, narration text,
  status text, debit numeric, credit numeric, running_balance numeric, opening_balance numeric, total_rows bigint)
language sql stable security definer set search_path = '' as $$
  with base as (
    select v.id, v.voucher_no, v.voucher_type, v.voucher_date, v.reference_no, v.narration, v.status, v.posted_at,
      sum(l.debit) debit, sum(l.credit) credit
    from public.vouchers v join public.voucher_lines l on l.voucher_id = v.id and l.account = 'supplier'
    where v.firm_id = p_firm and v.party_id = p_party and public.finance_can('view', v.firm_id, v.store_id)
    group by v.id),
  opening as (select coalesce(sum(credit - debit), 0) amount from base where voucher_date < p_from),
  ranged as (
    select b.*, (select amount from opening) + sum(b.credit - b.debit) over (order by b.voucher_date, b.posted_at, b.id) running,
      count(*) over () total
    from base b where b.voucher_date between p_from and p_to)
  select r.id, r.voucher_no, r.voucher_type, r.voucher_date, r.reference_no, r.narration, r.status, r.debit, r.credit, r.running,
    (select amount from opening), r.total
  from ranged r order by r.voucher_date, r.posted_at, r.id
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)
$$;

-- ---------------------------------------------------------------- audit, RLS, grants
do $$
declare t text;
begin
  foreach t in array array['purchase_invoices', 'purchase_invoice_lines', 'voucher_allocations', 'document_links', 'disputes', 'purchase_import_profiles', 'vouchers']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.finance_audit()', t || '_audit', t);
  end loop;
  foreach t in array array['purchase_invoices', 'disputes', 'purchase_import_profiles']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_' || t || '_updated_at', t);
  end loop;
  foreach t in array array['voucher_sequences', 'vouchers', 'voucher_lines', 'voucher_allocations', 'purchase_invoices', 'purchase_invoice_lines',
    'document_links', 'disputes', 'purchase_import_profiles']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())', t || '_active_required', t);
  end loop;
end $$;

-- Vouchers, lines and allocations are written only by the routines above.
grant select on public.vouchers, public.voucher_lines, public.voucher_allocations to authenticated;
create policy vouchers_select on public.vouchers for select to authenticated using (public.finance_can('view', firm_id, store_id));
create policy voucher_lines_select on public.voucher_lines for select to authenticated
  using (exists(select 1 from public.vouchers v where v.id = voucher_id and public.finance_can('view', v.firm_id, v.store_id)));
create policy voucher_allocations_select on public.voucher_allocations for select to authenticated
  using (exists(select 1 from public.vouchers v where v.id = from_voucher_id and public.finance_can('view', v.firm_id, v.store_id)));

grant select, insert, update on public.purchase_invoices to authenticated;
create policy purchase_invoices_select on public.purchase_invoices for select to authenticated using (public.finance_can('view', firm_id, store_id));
create policy purchase_invoices_insert on public.purchase_invoices for insert to authenticated
  with check (public.finance_can('post', firm_id, store_id) and created_by = auth.uid());
create policy purchase_invoices_update on public.purchase_invoices for update to authenticated
  using (public.finance_can('post', firm_id, store_id)) with check (public.finance_can('post', firm_id, store_id));

grant select, insert, update, delete on public.purchase_invoice_lines to authenticated;
create policy purchase_invoice_lines_select on public.purchase_invoice_lines for select to authenticated
  using (exists(select 1 from public.purchase_invoices i where i.id = invoice_id and public.finance_can('view', i.firm_id, i.store_id)));
create policy purchase_invoice_lines_write on public.purchase_invoice_lines for all to authenticated
  using (exists(select 1 from public.purchase_invoices i where i.id = invoice_id and i.status = 'draft' and public.finance_can('post', i.firm_id, i.store_id)))
  with check (exists(select 1 from public.purchase_invoices i where i.id = invoice_id and i.status = 'draft' and public.finance_can('post', i.firm_id, i.store_id)));

grant select, insert on public.document_links to authenticated;
create policy document_links_select on public.document_links for select to authenticated
  using (exists(select 1 from public.finance_documents d where d.id = document_id and (d.submitted_by = auth.uid() or public.finance_can('view', d.firm_id, d.store_id))));
create policy document_links_insert on public.document_links for insert to authenticated
  with check (linked_by = auth.uid() and exists(select 1 from public.finance_documents d where d.id = document_id
    and d.status in ('stored', 'reviewed') and public.finance_can('post', d.firm_id, d.store_id)));

grant select, insert, update on public.disputes to authenticated;
create policy disputes_select on public.disputes for select to authenticated using (public.finance_can('view', firm_id, store_id));
create policy disputes_insert on public.disputes for insert to authenticated with check (public.finance_can('post', firm_id, store_id) and created_by = auth.uid());
create policy disputes_update on public.disputes for update to authenticated
  using (public.finance_can('post', firm_id, store_id)) with check (public.finance_can('post', firm_id, store_id));

grant select, insert, update on public.purchase_import_profiles to authenticated;
create policy purchase_import_profiles_select on public.purchase_import_profiles for select to authenticated using (public.finance_any('view'));
create policy purchase_import_profiles_write on public.purchase_import_profiles for insert to authenticated with check (public.finance_any('post'));
create policy purchase_import_profiles_update on public.purchase_import_profiles for update to authenticated
  using (public.finance_any('post')) with check (public.finance_any('post'));

revoke all on function public.check_voucher_balanced(), public.guard_posted_voucher(), public.guard_allocation(),
  public.guard_purchase_invoice(), public.set_purchase_financial_year(), public.next_voucher_no(uuid, date, text),
  public.write_voucher(jsonb, jsonb), public.apply_allocations(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.voucher_open_amount(uuid), public.allocate_voucher(uuid, uuid, numeric), public.release_allocation(uuid, text),
  public.purchase_invoice_check(uuid), public.post_purchase_invoice(uuid, uuid),
  public.record_supplier_voucher(text, uuid, uuid, uuid, date, numeric, text, text, date, text, numeric, numeric, numeric, numeric, text, jsonb, date),
  public.reverse_voucher(uuid, date, text), public.party_balances(uuid, uuid, date), public.party_ledger(uuid, uuid, date, date, integer, integer),
  public.open_vouchers(uuid, uuid, text)
  from public, anon;
grant execute on function public.voucher_open_amount(uuid), public.allocate_voucher(uuid, uuid, numeric), public.release_allocation(uuid, text),
  public.purchase_invoice_check(uuid), public.post_purchase_invoice(uuid, uuid),
  public.record_supplier_voucher(text, uuid, uuid, uuid, date, numeric, text, text, date, text, numeric, numeric, numeric, numeric, text, jsonb, date),
  public.reverse_voucher(uuid, date, text), public.party_balances(uuid, uuid, date), public.party_ledger(uuid, uuid, date, date, integer, integer),
  public.open_vouchers(uuid, uuid, text)
  to authenticated;

commit;
