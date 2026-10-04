-- Accounts follow-through:
--  * GSTR-2B: the JSON downloaded from the GST portal is stored as a finance
--    document (new kind "gst_return", JSON allowed), its supplier invoices are
--    imported per firm and return period, and matched with the purchases
--    posted in Accounts: matched, amounts differ, not yet in 2B (supplier has
--    not filed: input tax credit at risk), in a later 2B, not entered in books.
--  * Supplier dues: bills due by a date or overdue, across the firms the
--    viewer may see.
begin;

alter table public.finance_documents drop constraint finance_documents_kind_check;
alter table public.finance_documents add constraint finance_documents_kind_check check (kind in (
  'purchase_invoice', 'purchase_export', 'item_sheet', 'credit_note', 'debit_note', 'payment_proof', 'supplier_statement',
  'return_dispatch', 'return_acknowledgement', 'terms_agreement', 'opening_balance_evidence', 'gst_return', 'other'));

update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'application/json']
where id = 'finance-docs';

create or replace function public.reserve_finance_document(p_kind text, p_store uuid, p_firm uuid, p_party uuid, p_file_name text, p_mime text, p_size bigint, p_sha256 text, p_title text, p_doc_no text, p_doc_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare firm uuid := p_firm; existing public.finance_documents; path text; doc_id uuid; v_role text;
begin
  if p_firm is null and p_store is not null then
    firm := public.store_firm_on(p_store, coalesce(p_doc_date, (now() at time zone 'Asia/Kolkata')::date));
  end if;
  if not public.can_submit_finance_document(p_kind, firm, p_store) then
    raise exception 'You cannot submit this document for this store.';
  end if;
  if p_file_name is null or length(p_file_name) not between 1 and 180 or p_file_name ~ '[[:cntrl:]/\\]' then
    raise exception 'Invalid file name';
  end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'application/json') then
    raise exception 'Upload a PDF, photo, Excel, CSV or GST portal JSON file.';
  end if;
  if p_mime = 'application/json' and p_kind not in ('gst_return', 'other') then
    raise exception 'JSON files are for GST returns downloaded from the GST portal.';
  end if;
  if p_size is null or p_size not between 1 and 20971520 then raise exception 'Files must be 20 MB or smaller.'; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid file fingerprint'; end if;
  select * into existing from public.finance_documents d where d.sha256 = p_sha256 and d.status in ('stored', 'reviewed') limit 1;
  if existing.id is not null then
    return jsonb_build_object('duplicate', true, 'id', existing.id, 'title', coalesce(existing.title, existing.file_name));
  end if;
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  path := 'docs/' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY/MM') || '/' || gen_random_uuid()::text || '-'
    || left(regexp_replace(p_file_name, '[^a-zA-Z0-9._-]', '-', 'g'), 120);
  insert into public.finance_documents(kind, firm_id, store_id, party_id, title, doc_no, doc_date, file_path, file_name,
    mime_type, byte_size, sha256, submitted_by, submitted_role)
  values (p_kind, firm, p_store, p_party, nullif(btrim(p_title), ''), nullif(btrim(p_doc_no), ''), p_doc_date, path,
    p_file_name, p_mime, p_size, p_sha256, auth.uid(), coalesce(v_role, 'unknown'))
  returning id into doc_id;
  return jsonb_build_object('duplicate', false, 'id', doc_id, 'path', path);
end $function$;

-- ---------------------------------------------------------------- GSTR-2B
create table public.gstr2b_lines (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.billing_firms(id),
  return_period text not null check (return_period ~ '^(0[1-9]|1[0-2])[0-9]{4}$'),
  document_id uuid references public.finance_documents(id),
  supplier_gstin text not null check (supplier_gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  supplier_name text check (supplier_name is null or length(supplier_name) <= 200),
  doc_type text not null check (doc_type in ('invoice', 'credit_note', 'debit_note')),
  doc_no text not null check (length(btrim(doc_no)) between 1 and 40),
  doc_no_key text generated always as (upper(regexp_replace(doc_no, '[^a-zA-Z0-9]', '', 'g'))) stored,
  doc_date date,
  doc_value numeric(14,2),
  taxable numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  cess numeric(14,2) not null default 0,
  itc_available boolean,
  reason text check (reason is null or length(reason) <= 200),
  imported_by uuid default auth.uid() references public.profiles(id),
  imported_at timestamptz not null default now()
);
create index gstr2b_lines_match on public.gstr2b_lines (firm_id, supplier_gstin, doc_no_key);
create index gstr2b_lines_period on public.gstr2b_lines (firm_id, return_period);
alter table public.gstr2b_lines enable row level security;
revoke all on public.gstr2b_lines from anon, authenticated;
grant select on public.gstr2b_lines to authenticated;
create policy gstr2b_read on public.gstr2b_lines for select to authenticated using (public.finance_can('view', firm_id, null));

-- Replaces one firm's lines for one period (re-importing the same month is safe).
create function public.import_gstr2b(p_document uuid, p_firm uuid, p_period text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.finance_can('post', p_firm, null) then raise exception 'You cannot import GST data for this firm.'; end if;
  if p_period !~ '^(0[1-9]|1[0-2])[0-9]{4}$' then raise exception 'Invalid return period.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then raise exception 'Invalid GSTR-2B data.'; end if;
  if not exists (select 1 from public.finance_documents where id = p_document and kind = 'gst_return' and status in ('stored', 'reviewed')) then
    raise exception 'Store the GSTR-2B file under Documents first.';
  end if;
  delete from public.gstr2b_lines where firm_id = p_firm and return_period = p_period;
  insert into public.gstr2b_lines(firm_id, return_period, document_id, supplier_gstin, supplier_name, doc_type, doc_no, doc_date,
    doc_value, taxable, igst, cgst, sgst, cess, itc_available, reason)
  select p_firm, p_period, p_document, upper(r->>'supplier_gstin'), nullif(left(r->>'supplier_name', 200), ''), r->>'doc_type', left(btrim(r->>'doc_no'), 40),
    (r->>'doc_date')::date, (r->>'doc_value')::numeric, coalesce((r->>'taxable')::numeric, 0), coalesce((r->>'igst')::numeric, 0),
    coalesce((r->>'cgst')::numeric, 0), coalesce((r->>'sgst')::numeric, 0), coalesce((r->>'cess')::numeric, 0),
    (r->>'itc_available')::boolean, nullif(left(r->>'reason', 200), '')
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_count = row_count;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'gstr2b_imported', 'finance_document', p_document,
    jsonb_build_object('firm_id', p_firm, 'period', p_period, 'lines', v_count));
  return v_count;
end $$;

-- Purchases posted for the period's month against the 2B invoices of that period.
create function public.gstr2b_reconcile(p_firm uuid, p_period text)
returns table (status text, supplier_gstin text, supplier_name text, doc_no text, doc_date date, invoice_id uuid,
  books_taxable numeric, books_tax numeric, portal_taxable numeric, portal_tax numeric, itc_available boolean, other_period text)
language sql stable security definer set search_path = '' as $$
  with m as (select make_date(right(p_period, 4)::int, left(p_period, 2)::int, 1) as month_start),
  books as (
    select i.id, p.gstin, p.legal_name, i.supplier_invoice_no, i.invoice_no_key, i.invoice_date, i.taxable_amount,
      i.cgst_amount + i.sgst_amount + i.igst_amount as tax
    from public.purchase_invoices i join public.parties p on p.id = i.party_id, m
    where i.firm_id = p_firm and i.status = 'posted' and i.invoice_date >= m.month_start and i.invoice_date < m.month_start + interval '1 month'
  ), portal as (
    select g.supplier_gstin, g.supplier_name, g.doc_no, g.doc_no_key, g.doc_date, g.taxable, g.igst + g.cgst + g.sgst as tax, g.itc_available
    from public.gstr2b_lines g where g.firm_id = p_firm and g.return_period = p_period and g.doc_type = 'invoice'
  )
  select
    case
      when b.id is null then 'not_in_books'
      when po.doc_no_key is null and o.return_period is not null then 'in_other_2b'
      when po.doc_no_key is null then 'not_in_2b'
      when abs(b.taxable_amount - po.taxable) > 1 or abs(b.tax - po.tax) > 1 then 'amount_differs'
      else 'matched' end,
    coalesce(b.gstin, po.supplier_gstin), coalesce(b.legal_name, po.supplier_name), coalesce(b.supplier_invoice_no, po.doc_no),
    coalesce(b.invoice_date, po.doc_date), b.id, b.taxable_amount, b.tax, po.taxable, po.tax, po.itc_available, o.return_period
  from books b
  full join portal po on po.supplier_gstin = b.gstin and po.doc_no_key = b.invoice_no_key
  left join lateral (
    select g.return_period from public.gstr2b_lines g
    where b.id is not null and po.doc_no_key is null and g.firm_id = p_firm and g.supplier_gstin = b.gstin and g.doc_no_key = b.invoice_no_key
    order by g.return_period limit 1) o on true
  where public.finance_can('view', p_firm, null)
  order by 1 desc, 3, 4
$$;

-- ---------------------------------------------------------------- supplier dues
create function public.supplier_dues(p_until date)
returns table (voucher_id uuid, firm_name text, party_id uuid, party_name text, voucher_no text, reference_no text, voucher_date date,
  due_date date, open_amount numeric, days_overdue integer)
language sql stable security definer set search_path = '' as $$
  select v.id, f.name, v.party_id, p.legal_name, v.voucher_no, v.reference_no, v.voucher_date, v.due_date,
    v.amount - coalesce(a.allocated, 0), greatest(public.india_today() - v.due_date, 0)
  from public.vouchers v
  join public.billing_firms f on f.id = v.firm_id
  join public.parties p on p.id = v.party_id
  left join lateral (
    select sum(x.amount) as allocated from public.voucher_allocations x
    where x.released_at is null and x.to_voucher_id = v.id) a on true
  where v.status = 'posted' and v.supplier_side = 'credit' and v.due_date is not null and v.due_date <= p_until
    and v.amount > coalesce(a.allocated, 0) and public.finance_can('view', v.firm_id, v.store_id)
  order by v.due_date, p.legal_name
  limit 500
$$;

revoke all on function public.import_gstr2b(uuid, uuid, text, jsonb), public.gstr2b_reconcile(uuid, text), public.supplier_dues(date) from public, anon;
grant execute on function public.import_gstr2b(uuid, uuid, text, jsonb), public.gstr2b_reconcile(uuid, text), public.supplier_dues(date) to authenticated;

commit;
