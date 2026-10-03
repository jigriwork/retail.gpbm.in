-- Company Accounts, phase 4: company calculation engine, workings from the
-- daily sales uploads, expected credit notes and sales-based settlements.
--
-- Rules are company-specific and dated (company_terms.rules). The engine is
-- one pure function (compute_working) covering the three formula families
-- found in the supplied workbooks:
--   sale_against_payment (Mufti-type): payment = NSV - margin - (sales tax -
--     purchase tax); CN = purchase value incl. tax - payment.
--   sales_margin (Turtle-type): sales = MRP value - accepted discount;
--     payment = sales - margin; CN = purchase taxable - (payment - output tax).
--   promo_share (Pepe-type): CN = (accepted discount - (tax on MRP - tax on
--     accepted NSV)) x share %.
-- Thresholds carry their own value, comparison operator and line/piece
-- basis; tax can use exact fractions (rate/(100+rate)) or the published
-- approximations. Nothing is rounded unless the rules say so.
--
-- Approving a working creates an expected CN (claim) and, for pay-against-
-- sold-stock suppliers, a settlement payable. Neither touches the ledger:
-- only a posted credit note or payment does.
begin;

-- ---------------------------------------------------------------- engine helpers
create or replace function public.working_slab(p_value numeric, p_threshold numeric, p_operator text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select case when p_threshold is null then false when coalesce(p_operator, '>') = '>=' then p_value >= p_threshold else p_value > p_threshold end
$$;

-- Tax contained in a tax-inclusive amount.
create or replace function public.working_inclusive_tax(p_amount numeric, p_high boolean, p_cfg jsonb) returns numeric
language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_cfg is null or p_amount is null then 0
    when p_cfg->>'mode' = 'approx' then p_amount * (case when p_high then (p_cfg->>'approx_high')::numeric else (p_cfg->>'approx_low')::numeric end) / 100
    else p_amount * (case when p_high then (p_cfg->>'high_rate')::numeric else (p_cfg->>'low_rate')::numeric end)
                   / (100 + case when p_high then (p_cfg->>'high_rate')::numeric else (p_cfg->>'low_rate')::numeric end) end
$$;

-- Fresh / EOSS / other for a sale date, from the rules' date windows. An
-- explicit class on the line wins. Never inferred from discount %.
create or replace function public.working_class(p_rules jsonb, p_date date) returns text
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(
    (select 'eoss' from jsonb_array_elements(coalesce(p_rules->'class'->'eoss', '[]'::jsonb)) w
     where p_date between (w->>'from')::date and coalesce((w->>'to')::date, 'infinity'::date) limit 1),
    (select 'other' from jsonb_array_elements(coalesce(p_rules->'class'->'other', '[]'::jsonb)) w
     where p_date between (w->>'from')::date and coalesce((w->>'to')::date, 'infinity'::date) limit 1),
    coalesce(p_rules->'class'->>'default', 'fresh'))
$$;

-- The engine. p_lines: [{qty, mrp (per piece), nsv (line, tax-inclusive),
-- bill_no, sale_date, class?, accepted_discount?, purchase_cost? (line, for
-- batch-cost rules), sales_row_id?}]. Returns {lines: [...], totals: {...}}.
create or replace function public.compute_working(p_rules jsonb, p_lines jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with cfg as (
    select coalesce(p_rules->>'formula', 'sale_against_payment') formula,
      coalesce(p_rules->>'threshold_basis', 'piece') basis,
      coalesce(p_rules->'discount'->>'accept', 'all') accept,
      coalesce(p_rules->'discount'->>'allocation', 'value') allocation,
      (p_rules->'discount'->>'cap')::numeric cap,
      coalesce((p_rules->>'share_pct')::numeric, 0) share,
      (p_rules->'rounding'->>'line')::integer line_round),
  l as (
    select t.ord, (t.x->>'qty')::numeric q, (t.x->>'mrp')::numeric mrp, (t.x->>'nsv')::numeric nsv,
      coalesce(t.x->>'bill_no', 'line-' || t.ord) bill, (t.x->>'sale_date')::date d,
      coalesce(t.x->>'class', public.working_class(p_rules, (t.x->>'sale_date')::date)) cls,
      (t.x->>'accepted_discount')::numeric acc_in, (t.x->>'purchase_cost')::numeric pc_in, t.x->>'sales_row_id' sales_row_id,
      t.x->>'lot_code' lot_code
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality t(x, ord)),
  l2 as (select l.*, l.mrp * l.q mrpv, l.mrp * l.q - l.nsv cust from l),
  bills as (
    select bill, d, sum(mrpv) b_mrpv, sum(cust) b_cust, sum(q) b_q from l2 group by bill, d),
  bacc as (
    select b.*, case c.accept
      when 'none' then 0
      when 'all' then b.b_cust
      when 'cap' then sign(b.b_cust) * least(abs(b.b_cust), coalesce(c.cap, 0))
      when 'tiers' then sign(b.b_cust) * least(abs(b.b_cust), coalesce((
        select max((tier->>'amount')::numeric) from jsonb_array_elements(coalesce(p_rules->'discount'->'tiers', '[]'::jsonb)) tier
        where abs(b.b_mrpv) >= (tier->>'min_bill_mrp')::numeric), 0))
      else null end acc_bill
    from bills b, cfg c),
  l3 as (
    select l2.*, c.*,
      case
        when c.accept = 'input' then coalesce(l2.acc_in, 0)
        when c.accept in ('none') then 0
        when c.accept = 'all' then l2.cust
        when c.allocation = 'qty' and ba.b_q <> 0 then ba.acc_bill * l2.q / ba.b_q
        when ba.b_cust <> 0 then ba.acc_bill * l2.cust / ba.b_cust
        else 0 end accepted,
      (c.accept not in ('input', 'none', 'all') and ((c.allocation = 'qty' and ba.b_q = 0) or (c.allocation <> 'qty' and ba.b_cust = 0 and ba.acc_bill <> 0))) exchange_flag
    from l2 join bacc ba on ba.bill = l2.bill and ba.d is not distinct from l2.d, cfg c),
  -- Value used for each slab test: per piece (|value| / |qty|) or the whole line.
  l4 as (
    select l3.*, l3.mrpv - l3.accepted sales_value,
      case when l3.basis = 'line' or l3.q = 0 then 1 else abs(l3.q) end div
    from l3),
  l5 as (
    select l4.*,
      public.working_slab(abs(case when l4.formula = 'sale_against_payment' then l4.nsv else l4.sales_value end) / l4.div,
        (p_rules->'sales_tax'->>'threshold')::numeric, p_rules->'sales_tax'->>'operator') sales_high,
      public.working_slab(abs(case when coalesce(p_rules->'purchase_cost'->>'on', 'mrp_value') = 'mrp' then l4.mrp * l4.div else l4.mrpv end) / l4.div,
        (p_rules->'purchase_cost'->>'threshold')::numeric, p_rules->'purchase_cost'->>'operator') cost_high,
      public.working_slab(abs(l4.mrpv) / l4.div, (p_rules->'md'->>'threshold')::numeric, p_rules->'md'->>'operator') md_high,
      public.working_slab(abs(l4.mrpv) / l4.div, (coalesce(p_rules->'mrp_tax', p_rules->'sales_tax')->>'threshold')::numeric,
        coalesce(p_rules->'mrp_tax', p_rules->'sales_tax')->>'operator') mrp_high
    from l4),
  l6 as (
    select l5.*,
      case l5.formula when 'sale_against_payment' then public.working_inclusive_tax(l5.nsv, l5.sales_high, p_rules->'sales_tax')
        else public.working_inclusive_tax(l5.sales_value, l5.sales_high, p_rules->'sales_tax') end sales_tax,
      (case l5.formula when 'sale_against_payment' then l5.nsv else l5.sales_value end)
        * coalesce((p_rules->'margin'->>l5.cls)::numeric, 0) / 100 margin,
      case
        when l5.pc_in is not null and coalesce(p_rules->'purchase_cost'->>'basis', 'formula') = 'batch' then l5.pc_in
        when l5.formula = 'sale_against_payment' then l5.mrpv * (case when l5.cost_high then (p_rules->'purchase_cost'->>'high_factor')::numeric else (p_rules->'purchase_cost'->>'low_factor')::numeric end) / 100
        when l5.formula = 'sales_margin' then l5.mrpv * (100 - case when l5.md_high then (p_rules->'md'->>'high_pct')::numeric else (p_rules->'md'->>'low_pct')::numeric end) / 100
        else null end purchase_cost
    from l5),
  l7 as (
    select l6.*,
      case when l6.formula = 'sale_against_payment' and l6.purchase_cost is not null then
        l6.purchase_cost * (case when public.working_slab(abs(l6.purchase_cost) / l6.div, (p_rules->'purchase_tax'->>'threshold')::numeric, p_rules->'purchase_tax'->>'operator')
          then (p_rules->'purchase_tax'->>'high_rate')::numeric else (p_rules->'purchase_tax'->>'low_rate')::numeric end) / 100
        else 0 end purchase_tax,
      case when l6.formula = 'promo_share' then public.working_inclusive_tax(l6.mrpv, l6.mrp_high, coalesce(p_rules->'mrp_tax', p_rules->'sales_tax')) end mrp_tax
    from l6),
  l8 as (
    select l7.*,
      case l7.formula when 'sale_against_payment' then l7.sales_tax - l7.purchase_tax when 'promo_share' then l7.mrp_tax - l7.sales_tax else 0 end tax_diff
    from l7),
  l9 as (
    select l8.*,
      case l8.formula when 'sale_against_payment' then l8.nsv - l8.margin - l8.tax_diff when 'sales_margin' then l8.sales_value - l8.margin else 0 end payment
    from l8),
  out as (
    select l9.*,
      case l9.formula
        when 'sale_against_payment' then l9.purchase_cost + l9.purchase_tax - l9.payment
        when 'sales_margin' then l9.purchase_cost - (l9.payment - l9.sales_tax)
        else (l9.accepted - l9.tax_diff) * l9.share / 100 end cn
    from l9),
  r as (
    select o.*, case when o.line_round is null then 1 else 0 end raw from out o),
  fin as (
    select ord, sales_row_id, lot_code, bill, d, cls, q, mrp, mrpv, nsv, cust, accepted, exchange_flag,
      case when line_round is null then sales_value else round(sales_value, line_round) end sales_value,
      case when line_round is null then sales_tax else round(sales_tax, line_round) end sales_tax,
      case when line_round is null then margin else round(margin, line_round) end margin,
      case when line_round is null then purchase_cost else round(purchase_cost, line_round) end purchase_cost,
      case when line_round is null then purchase_tax else round(purchase_tax, line_round) end purchase_tax,
      case when line_round is null then tax_diff else round(tax_diff, line_round) end tax_diff,
      case when line_round is null then payment else round(payment, line_round) end payment,
      case when line_round is null then cn else round(cn, line_round) end cn
    from r)
  select jsonb_build_object(
    'lines', coalesce(jsonb_agg(jsonb_build_object('ord', ord, 'sales_row_id', sales_row_id, 'lot_code', lot_code, 'bill_no', bill, 'sale_date', d,
      'class', cls, 'qty', q, 'mrp', mrp, 'mrp_value', mrpv, 'nsv', nsv, 'customer_discount', cust, 'accepted_discount', accepted,
      'sales_value', sales_value, 'sales_tax', sales_tax, 'margin', margin, 'purchase_cost', purchase_cost, 'purchase_tax', purchase_tax,
      'purchase_value', coalesce(purchase_cost, 0) + purchase_tax, 'tax_diff', tax_diff, 'payment', payment, 'cn', cn,
      'flags', case when exchange_flag then jsonb_build_array('exchange_discount_unallocated') else '[]'::jsonb end) order by ord), '[]'::jsonb),
    'totals', jsonb_build_object('lines', count(*), 'qty', coalesce(sum(q), 0), 'mrp_value', coalesce(sum(mrpv), 0), 'nsv', coalesce(sum(nsv), 0),
      'customer_discount', coalesce(sum(cust), 0), 'accepted_discount', coalesce(sum(accepted), 0), 'sales_value', coalesce(sum(sales_value), 0),
      'sales_tax', coalesce(sum(sales_tax), 0), 'margin', coalesce(sum(margin), 0), 'purchase_cost', coalesce(sum(purchase_cost), 0),
      'purchase_tax', coalesce(sum(purchase_tax), 0), 'purchase_value', coalesce(sum(coalesce(purchase_cost, 0) + purchase_tax), 0),
      'tax_diff', coalesce(sum(tax_diff), 0), 'payment', coalesce(sum(payment), 0), 'cn', coalesce(sum(cn), 0),
      'exchange_flags', count(*) filter (where exchange_flag)))
  from fin
$$;

-- ---------------------------------------------------------------- runs
create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.supply_arrangements(id),
  terms_id uuid references public.company_terms(id),
  firm_id uuid not null references public.billing_firms(id),
  party_id uuid not null references public.parties(id),
  brand_id uuid not null references public.brands(id),
  store_id uuid references public.stores(id),
  period_from date not null,
  period_to date not null,
  rule_set text not null check (rule_set in ('agreed_terms', 'company_working')),
  rules jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'approved', 'closed', 'superseded')),
  complete boolean not null,
  blockers jsonb not null default '[]'::jsonb,
  inputs jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  company_figures jsonb,
  source_changed boolean not null default false,
  source_changed_at timestamptz,
  supersedes_run_id uuid references public.calculation_runs(id),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  check (period_to >= period_from)
);
create index calculation_runs_arrangement_idx on public.calculation_runs (arrangement_id, period_from desc);

create table public.calculation_lines (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.calculation_runs(id),
  ord integer not null,
  sales_row_id uuid references public.sales_rows(id),
  sale_date date,
  bill_no text,
  lot_code text,
  class text,
  qty numeric,
  mrp numeric,
  mrp_value numeric,
  nsv numeric,
  customer_discount numeric,
  accepted_discount numeric,
  sales_value numeric,
  sales_tax numeric,
  margin numeric,
  purchase_cost numeric,
  purchase_tax numeric,
  purchase_value numeric,
  tax_diff numeric,
  payment numeric,
  cn numeric,
  flags jsonb not null default '[]'::jsonb
);
create index calculation_lines_run_idx on public.calculation_lines (run_id, ord);

-- Bill-level discount decisions entered by the owner/accountant (e.g. the
-- company accepted ₹500 of a ₹700 discount, or none at all).
create table public.bill_discount_approvals (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.supply_arrangements(id),
  store_id uuid not null references public.stores(id),
  sale_date date not null,
  bill_no text not null,
  approved_amount numeric(14,2) not null check (approved_amount >= 0),
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index bill_discount_approvals_key on public.bill_discount_approvals (arrangement_id, store_id, sale_date, bill_no);

-- Expected credit (from an approved working) until the real CN is matched.
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  party_id uuid not null references public.parties(id),
  arrangement_id uuid references public.supply_arrangements(id),
  run_id uuid references public.calculation_runs(id),
  kind text not null check (kind in ('sales_settlement', 'promotion', 'margin', 'other')),
  period_from date,
  period_to date,
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  status text not null default 'expected' check (status in ('expected', 'received', 'disputed', 'written_off', 'cancelled')),
  matched_voucher_id uuid references public.vouchers(id),
  received_amount numeric(14,2),
  note text check (note is null or length(note) <= 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index claims_party_idx on public.claims (firm_id, party_id, status);

-- What is payable for stock sold, for pay-against-sold-stock suppliers.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.calculation_runs(id),
  firm_id uuid not null references public.billing_firms(id),
  party_id uuid not null references public.parties(id),
  payable numeric(14,2) not null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);
create table public.settlement_payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id),
  voucher_id uuid not null references public.vouchers(id),
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

-- ---------------------------------------------------------------- preparing a working
-- Gathers the arrangement's sales for the period from the uploaded daily
-- reports, keeps only pieces attributed to this supplier's batches, and runs
-- the engine. Missing days, summary-only days, unattributed or unresolved
-- pieces and unconfirmed terms are recorded as blockers ("Working
-- incomplete"); the figures are still shown but cannot be approved.
create or replace function public.prepare_working(p_arrangement uuid, p_from date, p_to date, p_rule_set text, p_rules jsonb, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.supply_arrangements; t public.company_terms; rules jsonb; lines jsonb; result jsonb; blockers jsonb := '[]'::jsonb;
  v_run uuid; s record; cov record; missing integer := 0; summary_days integer := 0; unresolved numeric := 0; other_party numeric := 0;
  brand_keys text[]; report_ids uuid[];
begin
  select * into a from public.supply_arrangements where id = p_arrangement;
  if a.id is null then raise exception 'Choose a supply arrangement.'; end if;
  if not public.finance_can('post', a.firm_id, a.store_id) then raise exception 'You cannot prepare workings for this firm.'; end if;
  if p_to < p_from or p_to - p_from > 370 then raise exception 'Choose a period of up to a year.'; end if;
  if p_rule_set not in ('agreed_terms', 'company_working') then raise exception 'Choose agreed terms or the company''s working.'; end if;
  select * into t from public.company_terms where arrangement_id = a.id and status in ('confirmed', 'draft')
    and p_from >= effective_from and p_to <= coalesce(effective_to, 'infinity'::date)
  order by (status = 'confirmed') desc, version desc limit 1;
  rules := coalesce(p_rules, case when p_rule_set = 'company_working' then t.rules->'company_working' else t.rules - 'company_working' end);
  if rules is null or rules = '{}'::jsonb or rules->>'formula' is null then raise exception 'These terms have no calculation rules yet. Add them under Company terms.'; end if;
  if p_rule_set = 'agreed_terms' and (t.id is null or t.status <> 'confirmed') then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'terms_not_confirmed', 'text', 'The agreed terms for this period are not confirmed.'));
  end if;
  if p_from < a.valid_from or p_to > coalesce(a.valid_to, 'infinity'::date) then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'outside_arrangement', 'text', 'The period is outside this supplier''s dates for the brand.'));
  end if;

  select array_agg(distinct k) into brand_keys from (
    select normalized k from public.brands where id = a.brand_id union select normalized from public.brand_aliases where brand_id = a.brand_id) x;

  -- Input coverage for every store of the firm (or the arrangement's store).
  for s in select st.id from public.stores st where st.is_active and (a.store_id is null or st.id = a.store_id)
      and exists(select 1 from public.store_firm_periods p where p.store_id = st.id and p.firm_id = a.firm_id and p.status = 'confirmed'
        and daterange(coalesce(p.valid_from, '-infinity'::date), coalesce(p.valid_to, 'infinity'::date), '[]') && daterange(p_from, p_to, '[]'))
  loop
    for cov in
      select d::date as cov_day, r.id report_id,
        exists(select 1 from public.sales_rows x where x.report_id = r.id and x.line_kind = 'item') has_items,
        exists(select 1 from public.sales_rows x where x.report_id = r.id and x.line_kind = 'summary') has_summary,
        exists(select 1 from public.sales_day_confirmations z where z.store_id = s.id and z.sale_date = d::date and z.status = 'zero_sales') zero
      from generate_series(p_from, p_to, interval '1 day') d
      left join public.reports r on r.store_id = s.id and r.report_type = 'sales' and r.is_current and r.report_date = d::date
      where public.store_firm_on(s.id, d::date) = a.firm_id
    loop
      if cov.report_id is null and not cov.zero then missing := missing + 1;
      elsif cov.report_id is not null and cov.has_summary then summary_days := summary_days + 1; end if;
    end loop;
  end loop;
  if missing > 0 then blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'missing_days', 'text', missing || ' day(s) have no sales report.')); end if;
  if summary_days > 0 then blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'summary_only', 'text', summary_days || ' day(s) have only a summary report without bills.')); end if;

  -- Sales lines of the brand, with the share of each line attributed to this supplier.
  with lines_in as (
    select x.id, x.store_id, x.sale_date, x.bill_no, x.lot_code, x.quantity, x.mrp, x.net_sale, x.report_id
    from public.sales_rows x join public.reports r on r.id = x.report_id and r.is_current and r.report_type = 'sales'
    where x.sale_date between p_from and p_to and x.line_kind = 'item' and coalesce(x.quantity, 0) <> 0
      and public.finance_norm(x.brand) = any(brand_keys)
      and (a.store_id is null or x.store_id = a.store_id)
      and public.store_firm_on(x.store_id, x.sale_date) = a.firm_id),
  attributed as (
    select li.*, coalesce(sum(al.qty) filter (where b.party_id = a.party_id and b.attribution = 'attributed'), 0) mine,
      coalesce(sum(al.qty) filter (where b.party_id is distinct from a.party_id and b.attribution = 'attributed'), 0) others,
      coalesce(sum(al.qty) filter (where al.batch_id is null or b.attribution = 'unattributed'), 0) open_qty,
      coalesce(sum(al.qty), 0) allocated,
      sum(b.unit_cost * al.qty) filter (where b.party_id = a.party_id and b.attribution = 'attributed') cost
    from lines_in li
    left join public.stock_allocations al on al.sales_row_id = li.id and al.status = 'active'
    left join public.purchase_batches b on b.id = al.batch_id
    group by li.id, li.store_id, li.sale_date, li.bill_no, li.lot_code, li.quantity, li.mrp, li.net_sale, li.report_id)
  select
    coalesce(jsonb_agg(jsonb_build_object('sales_row_id', id, 'sale_date', sale_date, 'bill_no', store_id::text || ':' || coalesce(bill_no, id::text),
      'lot_code', lot_code, 'qty', mine, 'mrp', mrp, 'nsv', net_sale * mine / quantity, 'purchase_cost', cost,
      'accepted_discount', (select ap.approved_amount from public.bill_discount_approvals ap where ap.arrangement_id = a.id and ap.store_id = attributed.store_id
        and ap.sale_date = attributed.sale_date and ap.bill_no = attributed.bill_no))
      order by sale_date, bill_no) filter (where mine <> 0), '[]'::jsonb),
    coalesce(sum(abs(open_qty) + abs(quantity - allocated)), 0), coalesce(sum(abs(others)), 0), array_agg(distinct report_id)
  into lines, unresolved, other_party, report_ids
  from attributed;
  if unresolved > 0 then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'attribution', 'text', unresolved || ' piece(s) of this brand are not yet attributed to a supplier.'));
  end if;
  -- Bill approvals apply only when the rules ask for them.
  if coalesce(rules->'discount'->>'accept', 'all') <> 'manual' then
    lines := (select coalesce(jsonb_agg(x - 'accepted_discount'), '[]'::jsonb) from jsonb_array_elements(lines) x);
  else
    rules := jsonb_set(rules, '{discount,accept}', '"input"');
  end if;
  result := public.compute_working(rules, lines);
  insert into public.calculation_runs(arrangement_id, terms_id, firm_id, party_id, brand_id, store_id, period_from, period_to, rule_set, rules,
    complete, blockers, inputs, totals, notes, created_by)
  values (a.id, t.id, a.firm_id, a.party_id, a.brand_id, a.store_id, p_from, p_to, p_rule_set, rules, jsonb_array_length(blockers) = 0, blockers,
    jsonb_build_object('report_ids', to_jsonb(coalesce(report_ids, array[]::uuid[])), 'missing_days', missing, 'summary_days', summary_days,
      'unattributed_pieces', unresolved, 'other_supplier_pieces', other_party, 'terms_version', t.version, 'terms_status', t.status),
    result->'totals', nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_run;
  insert into public.calculation_lines(run_id, ord, sales_row_id, sale_date, bill_no, lot_code, class, qty, mrp, mrp_value, nsv, customer_discount,
    accepted_discount, sales_value, sales_tax, margin, purchase_cost, purchase_tax, purchase_value, tax_diff, payment, cn, flags)
  select v_run, (x->>'ord')::integer, nullif(x->>'sales_row_id', '')::uuid, (x->>'sale_date')::date, split_part(x->>'bill_no', ':', 2), x->>'lot_code', x->>'class',
    (x->>'qty')::numeric, (x->>'mrp')::numeric, (x->>'mrp_value')::numeric, (x->>'nsv')::numeric, (x->>'customer_discount')::numeric,
    (x->>'accepted_discount')::numeric, (x->>'sales_value')::numeric, (x->>'sales_tax')::numeric, (x->>'margin')::numeric,
    (x->>'purchase_cost')::numeric, (x->>'purchase_tax')::numeric, (x->>'purchase_value')::numeric, (x->>'tax_diff')::numeric,
    (x->>'payment')::numeric, (x->>'cn')::numeric, x->'flags'
  from jsonb_array_elements(result->'lines') x;
  return v_run;
end $$;

-- Draft -> reviewed -> approved -> closed. Approval needs a complete working
-- on confirmed terms with unchanged sources; it records the expected CN and,
-- for pay-against-sold-stock suppliers, the settlement payable.
create or replace function public.set_working_status(p_run uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.calculation_runs; basis text; credit_days integer;
begin
  select * into r from public.calculation_runs where id = p_run for update;
  if r.id is null then raise exception 'Working not found.'; end if;
  if p_status = 'reviewed' and r.status = 'draft' then
    if not public.finance_can('post', r.firm_id, r.store_id) then raise exception 'You cannot review this working.'; end if;
    update public.calculation_runs set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now() where id = p_run;
  elsif p_status = 'approved' and r.status in ('draft', 'reviewed') then
    if not public.finance_can('approve', r.firm_id, r.store_id) then raise exception 'Only the owner or an approver can approve workings.'; end if;
    if r.rule_set <> 'agreed_terms' then raise exception 'Only a working on the agreed terms can be approved; the company''s working is for comparison.'; end if;
    if not r.complete then raise exception 'Working incomplete: resolve the listed inputs and prepare it again.'; end if;
    if r.source_changed then raise exception 'Source changed after this working was prepared. Prepare it again.'; end if;
    update public.calculation_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_run;
    select settlement_basis into basis from public.supply_arrangements where id = r.arrangement_id;
    if round((r.totals->>'cn')::numeric, 2) > 0 then
      insert into public.claims(firm_id, party_id, arrangement_id, run_id, kind, period_from, period_to, expected_amount, created_by)
      values (r.firm_id, r.party_id, r.arrangement_id, r.id,
        case (r.rules->>'formula') when 'promo_share' then 'promotion' when 'sales_margin' then 'sales_settlement' else 'sales_settlement' end,
        r.period_from, r.period_to, round((r.totals->>'cn')::numeric, 2), auth.uid());
    end if;
    if basis = 'sales' and (r.rules->>'formula') <> 'promo_share' and round((r.totals->>'payment')::numeric, 2) <> 0 then
      select t.credit_days into credit_days from public.company_terms t where t.id = r.terms_id;
      insert into public.settlements(run_id, firm_id, party_id, payable, due_date)
      values (r.id, r.firm_id, r.party_id, round((r.totals->>'payment')::numeric, 2), r.period_to + coalesce(credit_days, 0));
    end if;
  elsif p_status = 'closed' and r.status = 'approved' then
    if not public.finance_can('close', r.firm_id, r.store_id) then raise exception 'Only the owner or an accountant allowed to close can close workings.'; end if;
    update public.calculation_runs set status = 'closed', closed_by = auth.uid(), closed_at = now() where id = p_run;
  elsif p_status = 'superseded' and r.status in ('draft', 'reviewed') then
    if not public.finance_can('post', r.firm_id, r.store_id) then raise exception 'You cannot change this working.'; end if;
    update public.calculation_runs set status = 'superseded', notes = coalesce(notes || ' ', '') || coalesce('Set aside: ' || btrim(p_note), '') where id = p_run;
  else
    raise exception 'A % working cannot become %.', r.status, p_status;
  end if;
end $$;

-- The company's own figures from its supplied sheet, kept beside our run for
-- comparison. Never replaces our figures.
create or replace function public.record_company_figures(p_run uuid, p_payment numeric, p_cn numeric, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.calculation_runs;
begin
  select * into r from public.calculation_runs where id = p_run for update;
  if r.id is null or not public.finance_can('post', r.firm_id, r.store_id) then raise exception 'You cannot change this working.'; end if;
  update public.calculation_runs set company_figures = jsonb_build_object('payment', p_payment, 'cn', p_cn, 'note', nullif(btrim(p_note), ''),
    'entered_by', auth.uid(), 'entered_at', now()) where id = p_run;
end $$;

-- Matches a posted credit note to an expected CN. A difference is raised as
-- a dispute; the expected amount never reduces the ledger by itself.
create or replace function public.match_claim(p_claim uuid, p_voucher uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims; v public.vouchers; diff numeric;
begin
  select * into c from public.claims where id = p_claim for update;
  select * into v from public.vouchers where id = p_voucher;
  if c.id is null or c.status <> 'expected' then raise exception 'Choose an expected credit.'; end if;
  if not public.finance_can('post', c.firm_id, null) then raise exception 'You cannot match credits for this firm.'; end if;
  if v.id is null or v.voucher_type <> 'credit_note' or v.status <> 'posted' or v.party_id <> c.party_id or v.firm_id <> c.firm_id then
    raise exception 'Choose a posted credit note from the same supplier and firm.';
  end if;
  if exists(select 1 from public.claims x where x.matched_voucher_id = v.id and x.id <> c.id) then raise exception 'That credit note is already matched.'; end if;
  diff := v.amount - c.expected_amount;
  update public.claims set status = case when diff = 0 then 'received' else 'disputed' end, matched_voucher_id = v.id, received_amount = v.amount where id = c.id;
  if diff <> 0 then
    insert into public.disputes(firm_id, party_id, voucher_id, amount, title, details, created_by)
    values (c.firm_id, c.party_id, v.id, abs(diff), 'Credit note differs from the expected credit',
      'Expected ' || c.expected_amount || ', received ' || v.amount || ' (' || v.voucher_no || ')', auth.uid());
  end if;
end $$;

-- Links a posted payment to a settlement payable (sales-based suppliers).
create or replace function public.pay_settlement(p_settlement uuid, p_voucher uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.settlements; v public.vouchers; paid numeric; used numeric;
begin
  select * into s from public.settlements where id = p_settlement for update;
  select * into v from public.vouchers where id = p_voucher;
  if s.id is null or s.status <> 'open' then raise exception 'Choose an open settlement.'; end if;
  if not public.finance_can('post', s.firm_id, null) then raise exception 'You cannot record settlement payments for this firm.'; end if;
  if v.id is null or v.voucher_type <> 'payment' or v.status <> 'posted' or v.party_id <> s.party_id or v.firm_id <> s.firm_id then
    raise exception 'Choose a posted payment to the same supplier in the same firm.';
  end if;
  select coalesce(sum(amount), 0) into paid from public.settlement_payments where settlement_id = s.id and released_at is null;
  select coalesce(sum(amount), 0) into used from public.settlement_payments where voucher_id = v.id and released_at is null;
  if round(p_amount, 2) <= 0 or round(p_amount, 2) > s.payable - paid or round(p_amount, 2) > v.amount - used then
    raise exception 'The amount is more than what is left on the settlement or the payment.';
  end if;
  insert into public.settlement_payments(settlement_id, voucher_id, amount, created_by) values (s.id, v.id, round(p_amount, 2), auth.uid());
  if paid + round(p_amount, 2) = s.payable then update public.settlements set status = 'paid' where id = s.id; end if;
end $$;

-- Per firm and supplier: settlement payable still unpaid (and the part due),
-- expected CN, CN still pending.
create or replace function public.settlement_balances(p_firm uuid, p_as_of date default null)
returns table (firm_id uuid, party_id uuid, settlement_open numeric, settlement_due numeric, cn_expected numeric, cn_pending numeric)
language sql stable security definer set search_path = '' as $$
  with today as (select coalesce(p_as_of, (now() at time zone 'Asia/Kolkata')::date) d),
  st as (
    select s.firm_id, s.party_id,
      sum(s.payable - coalesce((select sum(p.amount) from public.settlement_payments p where p.settlement_id = s.id and p.released_at is null), 0)) open_amt,
      sum(s.payable - coalesce((select sum(p.amount) from public.settlement_payments p where p.settlement_id = s.id and p.released_at is null), 0))
        filter (where s.due_date <= (select d from today)) due_amt
    from public.settlements s where s.status = 'open' and (p_firm is null or s.firm_id = p_firm) and public.finance_can('view', s.firm_id, null)
    group by 1, 2),
  cl as (
    select c.firm_id, c.party_id, sum(c.expected_amount) filter (where c.status in ('expected', 'received', 'disputed')) expected,
      sum(c.expected_amount) filter (where c.status = 'expected') pending
    from public.claims c where (p_firm is null or c.firm_id = p_firm) and public.finance_can('view', c.firm_id, null) group by 1, 2),
  k as (select firm_id, party_id from st union select firm_id, party_id from cl)
  select k.firm_id, k.party_id, coalesce(st.open_amt, 0), coalesce(st.due_amt, 0), coalesce(cl.expected, 0), coalesce(cl.pending, 0)
  from k left join st using (firm_id, party_id) left join cl using (firm_id, party_id)
$$;

-- A sales report replaced or archived after a working was prepared marks the
-- working "Source changed - review required". Its figures are never rewritten.
create or replace function public.flag_workings_source_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.report_type = 'sales' and new.is_current is distinct from old.is_current then
    update public.calculation_runs c set source_changed = true, source_changed_at = now()
    where not c.source_changed and c.status <> 'superseded'
      and new.report_date between c.period_from and c.period_to
      and (c.store_id is null or c.store_id = new.store_id)
      and public.store_firm_on(new.store_id, new.report_date) = c.firm_id;
  end if;
  return new;
end $$;
create trigger reports_flag_workings after update of is_current on public.reports
  for each row execute function public.flag_workings_source_changed();

create or replace function public.guard_working() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Workings are kept; set them aside instead.'; end if;
  if tg_table_name = 'calculation_lines' then raise exception 'Working lines cannot be changed. Prepare a new working.'; end if;
  if row(new.rules, new.totals, new.inputs, new.blockers, new.period_from, new.period_to, new.arrangement_id)
     is distinct from row(old.rules, old.totals, old.inputs, old.blockers, old.period_from, old.period_to, old.arrangement_id) then
    raise exception 'Working figures cannot be changed. Prepare a new working.';
  end if;
  return new;
end $$;
create trigger calculation_runs_guard before update or delete on public.calculation_runs for each row execute function public.guard_working();
create trigger calculation_lines_guard before update or delete on public.calculation_lines for each row execute function public.guard_working();

-- ---------------------------------------------------------------- audit, RLS
do $$
declare t text;
begin
  foreach t in array array['calculation_runs', 'bill_discount_approvals', 'claims', 'settlements', 'settlement_payments']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.finance_audit()', t || '_audit', t);
  end loop;
  execute 'create trigger set_claims_updated_at before update on public.claims for each row execute function public.set_updated_at()';
  foreach t in array array['calculation_runs', 'calculation_lines', 'bill_discount_approvals', 'claims', 'settlements', 'settlement_payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())', t || '_active_required', t);
  end loop;
end $$;

grant select on public.calculation_runs, public.calculation_lines, public.claims, public.settlements, public.settlement_payments to authenticated;
grant select, insert, update on public.bill_discount_approvals to authenticated;
create policy calculation_runs_select on public.calculation_runs for select to authenticated using (public.finance_can('view', firm_id, store_id));
create policy calculation_lines_select on public.calculation_lines for select to authenticated
  using (exists(select 1 from public.calculation_runs r where r.id = run_id and public.finance_can('view', r.firm_id, r.store_id)));
create policy claims_select on public.claims for select to authenticated using (public.finance_can('view', firm_id, null));
create policy settlements_select on public.settlements for select to authenticated using (public.finance_can('view', firm_id, null));
create policy settlement_payments_select on public.settlement_payments for select to authenticated
  using (exists(select 1 from public.settlements s where s.id = settlement_id and public.finance_can('view', s.firm_id, null)));
create policy bill_discount_approvals_select on public.bill_discount_approvals for select to authenticated
  using (exists(select 1 from public.supply_arrangements a where a.id = arrangement_id and public.finance_can('view', a.firm_id, store_id)));
create policy bill_discount_approvals_write on public.bill_discount_approvals for insert to authenticated
  with check (created_by = auth.uid() and exists(select 1 from public.supply_arrangements a where a.id = arrangement_id and public.finance_can('post', a.firm_id, store_id)));
create policy bill_discount_approvals_update on public.bill_discount_approvals for update to authenticated
  using (exists(select 1 from public.supply_arrangements a where a.id = arrangement_id and public.finance_can('post', a.firm_id, store_id)))
  with check (exists(select 1 from public.supply_arrangements a where a.id = arrangement_id and public.finance_can('post', a.firm_id, store_id)));

revoke all on function public.flag_workings_source_changed(), public.guard_working() from public, anon, authenticated;
revoke all on function public.working_slab(numeric, numeric, text), public.working_inclusive_tax(numeric, boolean, jsonb), public.working_class(jsonb, date),
  public.compute_working(jsonb, jsonb), public.prepare_working(uuid, date, date, text, jsonb, text), public.set_working_status(uuid, text, text),
  public.record_company_figures(uuid, numeric, numeric, text), public.match_claim(uuid, uuid), public.pay_settlement(uuid, uuid, numeric),
  public.settlement_balances(uuid, date)
  from public, anon;
grant execute on function public.working_slab(numeric, numeric, text), public.working_inclusive_tax(numeric, boolean, jsonb), public.working_class(jsonb, date),
  public.compute_working(jsonb, jsonb), public.prepare_working(uuid, date, date, text, jsonb, text), public.set_working_status(uuid, text, text),
  public.record_company_figures(uuid, numeric, numeric, text), public.match_claim(uuid, uuid), public.pay_settlement(uuid, uuid, numeric),
  public.settlement_balances(uuid, date)
  to authenticated;

commit;
