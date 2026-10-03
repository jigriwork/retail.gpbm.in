-- Fix (found in post-deployment verification, 4 Oct 2026): a working left out
-- sales of a store whose billing firm is still "to confirm" (Brand Mark in
-- September 2026) without saying so, and could look complete. Those days now
-- block the working with a visible reason; they are never assigned to either
-- firm until the owner confirms the cutover date.
--
-- Also: a store-scoped accountant with posting permission can record a
-- payment (or credit/debit note) for their store, as long as it is set in
-- full against that store's own bills. Unadjusted, firm-wide payments,
-- refunds and opening balances still need a firm-wide grant.
--
-- And: sales are also attributed through the purchase reference in Logic's
-- LOT NUMBER (supplier invoice no. or Logic purchase no.), so purchases
-- entered from the supplier's PDF/item sheet (which have no Logic lot code)
-- still attribute sales to the right supplier and invoice.
begin;

create or replace function public.prepare_working(p_arrangement uuid, p_from date, p_to date, p_rule_set text, p_rules jsonb, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.supply_arrangements; t public.company_terms; rules jsonb; lines jsonb; result jsonb; blockers jsonb := '[]'::jsonb;
  v_run uuid; s record; cov record; missing integer := 0; summary_days integer := 0; unresolved numeric := 0; other_party numeric := 0;
  unconfirmed_days integer := 0;
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
      -- Any store that bills, billed or may bill under this firm.
      and exists(select 1 from public.store_firm_periods p where p.store_id = st.id and p.firm_id = a.firm_id and p.status in ('confirmed', 'to_confirm'))
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
    -- Days whose billing firm is still "to confirm" for this store (Brand
    -- Mark in September 2026): never assigned to either firm silently.
    select unconfirmed_days + count(*) into unconfirmed_days
    from generate_series(p_from, p_to, interval '1 day') d
    where public.store_firm_on(s.id, d::date) is null
      and exists(select 1 from public.store_firm_periods p where p.store_id = s.id and p.status = 'to_confirm'
        and d::date between coalesce(p.valid_from, '-infinity'::date) and coalesce(p.valid_to, 'infinity'::date));
  end loop;
  if unconfirmed_days > 0 then
    blockers := blockers || jsonb_build_array(jsonb_build_object('code', 'firm_unconfirmed', 'text',
      unconfirmed_days || ' day(s) are at a store whose billing firm is not yet confirmed; their sales are not included. Confirm the date under Firms & stores.'));
  end if;
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
      'unattributed_pieces', unresolved, 'firm_unconfirmed_days', unconfirmed_days, 'other_supplier_pieces', other_party, 'terms_version', t.version, 'terms_status', t.status),
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
  -- Refunds and opening balances are firm-wide entries.
  if p_store is not null and p_type in ('receipt', 'opening') then raise exception 'Refunds and opening balances are firm-wide; leave the store empty.'; end if;
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
  -- A store-level payment must be set in full against that store's own
  -- bills (notes may stay unadjusted, e.g. from a stock return): a store-scoped accountant can pay their store's invoices
  -- without creating firm-wide advances.
  if p_store is not null and exists(
      select 1 from public.voucher_allocations a join public.vouchers t on t.id = a.to_voucher_id
      where a.from_voucher_id = v_id and a.released_at is null and t.store_id is distinct from p_store) then
    raise exception 'A store payment can only be set against bills of the same store.';
  end if;
  if p_store is not null and p_type = 'payment' and amt <> coalesce((select sum(a.amount) from public.voucher_allocations a where a.from_voucher_id = v_id and a.released_at is null), 0) then
    raise exception 'A store payment must be set in full against that store''s bills. Leave the store empty for an advance or a firm-wide payment.';
  end if;
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
  -- Undoing part of a store payment would leave a store-level advance:
  -- that needs firm-wide permission (reversing the whole payment does not).
  if exists(select 1 from public.vouchers v where v.id = a.from_voucher_id and v.store_id is not null)
     and not public.finance_can('post', a.firm_id, null) then
    raise exception 'Only someone with firm-wide permission can undo part of a store payment. Reverse the payment instead.';
  end if;
  update public.voucher_allocations set released_at = now(), released_by = auth.uid(), release_reason = btrim(p_reason) where id = p_id;
end $$;

-- Attribution by purchase reference: Logic's LOT NUMBER on sales lines is the
-- purchase reference (the supplier invoice number, e.g. PJ-26, or Logic's own
-- purchase number, e.g. PP26-193). Purchases can record that Logic number.
alter table public.purchase_invoices add column logic_purchase_ref text check (logic_purchase_ref is null or length(logic_purchase_ref) <= 40);
alter table public.stock_allocations drop constraint stock_allocations_method_check;
alter table public.stock_allocations add constraint stock_allocations_method_check
  check (method in ('lot', 'invoice_ref', 'barcode_fifo', 'manual', 'customer_return', 'unresolved'));

create or replace function public.allocate_store_sales(p_store uuid, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare line record; remaining numeric; take numeric; cand record; v_barcode text; v_ref text; stale integer; allocated numeric := 0; unresolved numeric := 0;
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
    -- LOT NUMBER on a Logic sales line is the purchase reference (verified:
    -- Pepe sales of 2 Oct 2026 carry "PJ-26", the supplier invoice number);
    -- ADDITIONAL ITEM CODE often holds the barcode.
    v_ref := upper(regexp_replace(coalesce(line.lot_number, ''), '[^a-zA-Z0-9]', '', 'g'));
    v_barcode := coalesce(line.barcode, line.article_code, (
      select k.barcode from public.stock_rows k join public.reports kr on kr.id = k.report_id and kr.is_current
      where k.store_id = p_store and k.lot_code = line.lot_code and k.barcode is not null order by kr.period_month desc limit 1));
    if line.quantity > 0 then
      remaining := line.quantity;
      for cand in
        select x.id, x.left_qty, x.how from (
          select b.id, public.batch_remaining(b.id) left_qty, b.received_date, b.created_at,
            case when line.lot_code is not null and b.lot_code = line.lot_code then 'lot'
                 when v_ref <> '' and i.id is not null and (i.invoice_no_key = v_ref
                   or upper(regexp_replace(coalesce(i.logic_purchase_ref, ''), '[^a-zA-Z0-9]', '', 'g')) = v_ref) then 'invoice_ref'
                 else 'barcode_fifo' end how
          from public.purchase_batches b left join public.purchase_invoices i on i.id = b.invoice_id
          where b.store_id = p_store and b.status = 'active' and b.received_date <= line.sale_date
            and ((line.lot_code is not null and b.lot_code = line.lot_code)
              or (v_ref <> '' and i.id is not null and (i.invoice_no_key = v_ref
                    or upper(regexp_replace(coalesce(i.logic_purchase_ref, ''), '[^a-zA-Z0-9]', '', 'g')) = v_ref)
                  -- within the invoice, the same item: barcode/article when known, else the same MRP
                  and (v_barcode is null or b.barcode is null or b.barcode = v_barcode or b.article = v_barcode)
                  and (line.mrp is null or b.mrp is null or b.mrp = line.mrp))
              or (v_barcode is not null and (b.barcode = v_barcode or b.article = v_barcode)))) x
        order by case x.how when 'lot' then 1 when 'invoice_ref' then 2 else 3 end, x.received_date, x.created_at
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
          case when line.lot_code is null and v_barcode is null and v_ref = '' then 'No lot code, purchase reference or barcode on the sales line' else 'No purchase or opening batch with stock for this lot, purchase reference or barcode' end, auth.uid());
        unresolved := unresolved + remaining;
      end if;
    else
      -- Customer return: back to the batch the same lot/barcode was last sold from.
      select a.batch_id into cand from public.stock_allocations a join public.sales_rows s on s.id = a.sales_row_id
      join public.purchase_batches b on b.id = a.batch_id
      where a.status = 'active' and a.qty > 0 and a.store_id = p_store and a.sale_date <= line.sale_date
        and ((line.lot_code is not null and s.lot_code = line.lot_code) or (v_barcode is not null and (b.barcode = v_barcode or b.article = v_barcode)))
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

commit;
