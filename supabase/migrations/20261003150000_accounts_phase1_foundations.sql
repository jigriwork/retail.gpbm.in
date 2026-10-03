-- Company Accounts, phase 1: billing firms and the dated store-to-firm
-- mapping, supplier masters, accountant access, finance documents, and the
-- structured financial fields of the existing sales and stock uploads.
--
-- Supplier accounting only. Nothing here replaces statutory books or GST
-- filing. Masters are never deleted (deactivate instead) and every change is
-- recorded in finance_events.
begin;

-- ---------------------------------------------------------------- roles
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'manager', 'staff', 'accountant'));

-- ---------------------------------------------------------------- helpers
create or replace function public.finance_norm(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;

-- Parses a Logic export amount ("1,234.50", "-13.10"). Anything else is null,
-- never zero: a missing amount must stay visibly missing.
create or replace function public.finance_num(p text) returns numeric
language sql immutable parallel safe set search_path = '' as $$
  select case when v ~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then v::numeric end
  from (select regexp_replace(coalesce(p, ''), '[,[:space:]₹]', '', 'g') as v) x
$$;

-- Indian financial year label, e.g. 2026-10-03 -> '2026-27'.
create or replace function public.financial_year(p date) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when extract(month from p) >= 4
    then extract(year from p)::int || '-' || lpad(((extract(year from p)::int + 1) % 100)::text, 2, '0')
    else (extract(year from p)::int - 1) || '-' || lpad((extract(year from p)::int % 100)::text, 2, '0') end
$$;

-- ---------------------------------------------------------------- audit trail
create table public.finance_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_id uuid,
  actor_role text,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index finance_events_entity_idx on public.finance_events (entity_type, entity_id, created_at desc);

create or replace function public.finance_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  insert into public.finance_events(entity_type, entity_id, action, actor_id, actor_role, before, after)
  values (tg_table_name,
          case when tg_op = 'DELETE' then old.id else new.id end,
          lower(tg_op), auth.uid(), v_role,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------------------------------------------------------------- billing firms
create table public.billing_firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  legal_name text check (legal_name is null or length(legal_name) <= 200),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  state_code text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  address text check (address is null or length(address) <= 500),
  notes text check (notes is null or length(notes) <= 1000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index billing_firms_name_key on public.billing_firms (public.finance_norm(name));
create unique index billing_firms_gstin_key on public.billing_firms (gstin) where gstin is not null;

-- Which firm a store bills under, by date. Only 'confirmed' rows are used to
-- pick a firm automatically; 'to_confirm' rows mark a known but unverified
-- change, and dates they cover need the firm chosen from the document.
create table public.store_firm_periods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  firm_id uuid not null references public.billing_firms(id),
  valid_from date,
  valid_to date,
  status text not null check (status in ('confirmed', 'to_confirm', 'withdrawn')),
  evidence text not null check (length(btrim(evidence)) between 3 and 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index store_firm_periods_store_idx on public.store_firm_periods (store_id, valid_from);

-- Bill numbering used for sales lines. Prefix alone never decides the firm:
-- a series must be confirmed, dated and (when two series share a prefix)
-- bounded by bill numbers.
create table public.billing_series (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  firm_id uuid not null references public.billing_firms(id),
  prefix text not null check (length(prefix) between 1 and 20),
  number_from bigint,
  number_to bigint,
  valid_from date,
  valid_to date,
  status text not null check (status in ('confirmed', 'to_confirm', 'withdrawn')),
  evidence text not null check (length(btrim(evidence)) between 3 and 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (number_to is null or number_from is null or number_to >= number_from),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index billing_series_store_idx on public.billing_series (store_id, prefix);

create or replace function public.guard_firm_mapping() returns trigger
language plpgsql security definer set search_path = '' as $$
declare clash int;
begin
  perform 1 from public.stores where id = new.store_id for update;
  if new.status <> 'confirmed' then return new; end if;
  if tg_table_name = 'store_firm_periods' then
    select count(*) into clash from public.store_firm_periods p
    where p.store_id = new.store_id and p.id <> new.id and p.status = 'confirmed'
      and daterange(coalesce(p.valid_from, '-infinity'::date), coalesce(p.valid_to, 'infinity'::date), '[]')
       && daterange(coalesce(new.valid_from, '-infinity'::date), coalesce(new.valid_to, 'infinity'::date), '[]');
    if clash > 0 then raise exception 'This store already has a confirmed firm for part of these dates. End that period first.'; end if;
  else
    select count(*) into clash from public.billing_series s
    where s.store_id = new.store_id and s.id <> new.id and s.status = 'confirmed' and s.prefix = new.prefix
      and daterange(coalesce(s.valid_from, '-infinity'::date), coalesce(s.valid_to, 'infinity'::date), '[]')
       && daterange(coalesce(new.valid_from, '-infinity'::date), coalesce(new.valid_to, 'infinity'::date), '[]')
      and int8range(coalesce(s.number_from, 0), coalesce(s.number_to, 9223372036854775806), '[]')
       && int8range(coalesce(new.number_from, 0), coalesce(new.number_to, 9223372036854775806), '[]');
    if clash > 0 then raise exception 'A confirmed series with this prefix already covers these dates and bill numbers. Set number ranges or end it first.'; end if;
  end if;
  return new;
end $$;

create trigger store_firm_periods_guard before insert or update on public.store_firm_periods
  for each row execute function public.guard_firm_mapping();
create trigger billing_series_guard before insert or update on public.billing_series
  for each row execute function public.guard_firm_mapping();

-- The firm a store bills under on a date, or null when no single confirmed
-- period covers it (then the firm must come from the document).
create or replace function public.store_firm_on(p_store uuid, p_date date) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(firm_id))[1] end
  from public.store_firm_periods
  where store_id = p_store and status = 'confirmed'
    and p_date between coalesce(valid_from, '-infinity'::date) and coalesce(valid_to, 'infinity'::date)
$$;

-- The firm of a sales bill, only through a confirmed series.
create or replace function public.sales_bill_firm(p_store uuid, p_date date, p_bill_no text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(s.firm_id))[1] end
  from public.billing_series s
  where s.store_id = p_store and s.status = 'confirmed'
    and p_bill_no is not null and left(p_bill_no, length(s.prefix)) = s.prefix
    and p_date between coalesce(s.valid_from, '-infinity'::date) and coalesce(s.valid_to, 'infinity'::date)
    and (s.number_from is null and s.number_to is null
      or (substr(p_bill_no, length(s.prefix) + 1) ~ '^[0-9]{1,18}$'
          and substr(p_bill_no, length(s.prefix) + 1)::bigint between coalesce(s.number_from, 0) and coalesce(s.number_to, 9223372036854775806)))
$$;

-- ---------------------------------------------------------------- access
create table public.finance_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  firm_id uuid references public.billing_firms(id),
  store_id uuid references public.stores(id),
  can_view boolean not null default true,
  can_post boolean not null default false,
  can_manage_masters boolean not null default false,
  can_approve boolean not null default false,
  can_close_period boolean not null default false,
  valid_from date not null default ((now() at time zone 'Asia/Kolkata')::date),
  valid_to date,
  note text check (note is null or length(note) <= 500),
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  check (valid_to is null or valid_to >= valid_from)
);
create index finance_grants_user_idx on public.finance_grants (user_id) where revoked_at is null;

create or replace function public.guard_finance_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles p where p.id = new.user_id and p.role in ('accountant', 'manager')) then
    raise exception 'Financial access can be granted to accountant or manager accounts only.';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.firm_id is distinct from old.firm_id or new.store_id is distinct from old.store_id) then
    raise exception 'Revoke this access and add a new one to change whose or which scope it covers.';
  end if;
  return new;
end $$;
create trigger finance_grants_guard before insert or update on public.finance_grants
  for each row execute function public.guard_finance_grant();

-- Owner: everything. Accountant/manager: only through a current grant whose
-- scope covers the firm and store. A firm-wide record (store null) needs a
-- firm-wide grant. Owner status is never implied for an accountant.
create or replace function public.finance_can(p_action text, p_firm uuid, p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists(
    select 1 from public.finance_grants g join public.profiles p on p.id = g.user_id
    where g.user_id = auth.uid() and p.is_active and p.role in ('accountant', 'manager')
      and g.revoked_at is null
      and (now() at time zone 'Asia/Kolkata')::date between g.valid_from and coalesce(g.valid_to, 'infinity'::date)
      and (g.firm_id is null or g.firm_id = p_firm)
      and (g.store_id is null or g.store_id = p_store)
      and case p_action
        when 'view' then g.can_view or g.can_post or g.can_manage_masters or g.can_approve or g.can_close_period
        when 'post' then g.can_post
        when 'masters' then g.can_manage_masters
        when 'approve' then g.can_approve
        when 'close' then g.can_close_period
        else false end)
$$;

-- Any current grant for the action, regardless of scope (shared masters such
-- as parties and brands are not tied to one firm).
create or replace function public.finance_any(p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner() or exists(
    select 1 from public.finance_grants g join public.profiles p on p.id = g.user_id
    where g.user_id = auth.uid() and p.is_active and p.role in ('accountant', 'manager')
      and g.revoked_at is null
      and (now() at time zone 'Asia/Kolkata')::date between g.valid_from and coalesce(g.valid_to, 'infinity'::date)
      and case p_action
        when 'view' then true
        when 'post' then g.can_post
        when 'masters' then g.can_manage_masters
        when 'approve' then g.can_approve
        when 'close' then g.can_close_period
        else false end)
$$;

-- Store-level visibility for input coverage: owner, the store's manager, or
-- a finance grant that covers the store.
create or replace function public.finance_store_visible(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_owner()
    or p_store in (select public.user_store_ids())
    or exists(
      select 1 from public.finance_grants g join public.profiles p on p.id = g.user_id
      where g.user_id = auth.uid() and p.is_active and p.role in ('accountant', 'manager')
        and g.revoked_at is null
        and (now() at time zone 'Asia/Kolkata')::date between g.valid_from and coalesce(g.valid_to, 'infinity'::date)
        and (g.store_id is null or g.store_id = p_store))
$$;

-- ---------------------------------------------------------------- parties, agents, brands
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(btrim(legal_name)) between 2 and 200),
  display_name text check (display_name is null or length(display_name) <= 120),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  gstin_exception text check (gstin_exception is null or length(gstin_exception) <= 300),
  state_code text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  address text check (address is null or length(address) <= 500),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 160),
  notes text check (notes is null or length(notes) <= 1000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index parties_gstin_key on public.parties (gstin) where gstin is not null;
create index parties_name_idx on public.parties (public.finance_norm(legal_name));

create table public.party_aliases (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id),
  alias text not null check (length(btrim(alias)) between 2 and 200),
  normalized text generated always as (public.finance_norm(alias)) stored,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index party_aliases_key on public.party_aliases (party_id, normalized);
create index party_aliases_norm_idx on public.party_aliases (normalized);

-- Supplier agents/contacts. Not the salesperson in the sales report
-- (Logic's AGENT NAME), which stays in sales_rows.staff_name.
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 160),
  notes text check (notes is null or length(notes) <= 1000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_parties (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id),
  party_id uuid not null references public.parties(id),
  role text check (role is null or length(role) <= 80),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index agent_parties_key on public.agent_parties (agent_id, party_id);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  normalized text generated always as (public.finance_norm(name)) stored,
  is_merchandise boolean not null default true,
  notes text check (notes is null or length(notes) <= 1000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index brands_norm_key on public.brands (normalized);

-- Spellings seen in sales/stock COMPANY NAME, invoices etc. One spelling maps
-- to one brand only; it never identifies a supplier.
create table public.brand_aliases (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  alias text not null check (length(btrim(alias)) between 1 and 120),
  normalized text generated always as (public.finance_norm(alias)) stored,
  source text not null default 'other' check (source in ('sales', 'stock', 'invoice', 'other')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index brand_aliases_norm_key on public.brand_aliases (normalized);

-- Which supplier supplies which brand to which firm (and optionally one
-- store), over which dates, and on what basis payment is due.
create table public.supply_arrangements (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id),
  brand_id uuid not null references public.brands(id),
  firm_id uuid not null references public.billing_firms(id),
  store_id uuid references public.stores(id),
  valid_from date not null,
  valid_to date,
  settlement_basis text not null default 'to_confirm' check (settlement_basis in ('purchase', 'sales', 'to_confirm')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'ended')),
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index supply_arrangements_party_idx on public.supply_arrangements (party_id);
create index supply_arrangements_brand_idx on public.supply_arrangements (brand_id, firm_id);

-- Commercial terms, versioned. A confirmed version is never edited: a change
-- is a new version. Draft versions are never used for final figures.
create table public.company_terms (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references public.supply_arrangements(id),
  version integer not null check (version >= 1),
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'retired')),
  payment_cycle text not null default 'to_confirm' check (payment_cycle in ('per_invoice', 'monthly', 'season', 'other', 'to_confirm')),
  credit_days integer check (credit_days is null or credit_days between 0 and 730),
  early_payment_discount_pct numeric(6,3) check (early_payment_discount_pct is null or early_payment_discount_pct between 0 and 100),
  early_payment_days integer check (early_payment_days is null or early_payment_days between 0 and 365),
  early_payment_base text check (early_payment_base is null or early_payment_base in ('invoice_total', 'taxable_value', 'to_confirm')),
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  source_document_id uuid,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  check (effective_to is null or effective_to >= effective_from)
);
create unique index company_terms_version_key on public.company_terms (arrangement_id, version);

create or replace function public.guard_company_terms() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a public.supply_arrangements;
begin
  select * into a from public.supply_arrangements where id = new.arrangement_id;
  if tg_op = 'UPDATE' and old.status in ('confirmed', 'retired') then
    if new.status = 'retired' and old.status = 'confirmed'
       and (new.effective_to is not distinct from old.effective_to or old.effective_to is null)
       and row(new.arrangement_id, new.version, new.effective_from, new.payment_cycle, new.credit_days,
               new.early_payment_discount_pct, new.early_payment_days, new.early_payment_base, new.rules)
           is not distinct from
           row(old.arrangement_id, old.version, old.effective_from, old.payment_cycle, old.credit_days,
               old.early_payment_discount_pct, old.early_payment_days, old.early_payment_base, old.rules) then
      return new;
    end if;
    raise exception 'Confirmed terms cannot be changed. Add a new version instead.';
  end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    if not public.finance_can('approve', a.firm_id, a.store_id) then
      raise exception 'Only the owner or an accountant allowed to approve can confirm terms.';
    end if;
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  end if;
  return new;
end $$;
create trigger company_terms_guard before insert or update on public.company_terms
  for each row execute function public.guard_company_terms();

-- ---------------------------------------------------------------- finance documents
create table public.finance_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('purchase_invoice', 'purchase_export', 'item_sheet', 'credit_note', 'debit_note',
    'payment_proof', 'supplier_statement', 'return_dispatch', 'return_acknowledgement', 'terms_agreement',
    'opening_balance_evidence', 'other')),
  firm_id uuid references public.billing_firms(id),
  store_id uuid references public.stores(id),
  party_id uuid references public.parties(id),
  title text check (title is null or length(title) <= 200),
  doc_no text check (doc_no is null or length(doc_no) <= 80),
  doc_date date,
  amount numeric(14,2),
  bucket text not null default 'finance-docs' check (bucket = 'finance-docs'),
  file_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 180),
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'reserved' check (status in ('reserved', 'stored', 'reviewed', 'rejected')),
  submitted_by uuid not null references public.profiles(id),
  submitted_role text not null,
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  stored_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz
);
create unique index finance_documents_sha_key on public.finance_documents (sha256) where status in ('stored', 'reviewed');
create index finance_documents_scope_idx on public.finance_documents (firm_id, store_id, created_at desc);

alter table public.company_terms add constraint company_terms_source_document_fkey
  foreign key (source_document_id) references public.finance_documents(id);

create or replace function public.can_submit_finance_document(p_kind text, p_firm uuid, p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and (
    public.finance_can('post', p_firm, p_store)
    or (p_kind in ('purchase_invoice', 'purchase_export', 'item_sheet', 'return_dispatch')
        and p_store is not null and p_store in (select public.user_store_ids())))
$$;

-- Reserves a path for one document. The browser then uploads the file to that
-- exact path, and finalize_finance_document marks it stored. The same file
-- (by SHA-256) is never stored twice.
create or replace function public.reserve_finance_document(
  p_kind text, p_store uuid, p_firm uuid, p_party uuid, p_file_name text, p_mime text, p_size bigint,
  p_sha256 text, p_title text, p_doc_no text, p_doc_date date
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv') then
    raise exception 'Upload a PDF, photo, Excel or CSV file.';
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
end $$;

create or replace function public.finalize_finance_document(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.finance_documents;
begin
  select * into d from public.finance_documents where id = p_id for update;
  if d.id is null or d.submitted_by <> auth.uid() or not public.is_active_user() then raise exception 'Document not found.'; end if;
  if d.status <> 'reserved' then return jsonb_build_object('ok', true, 'id', d.id); end if;
  if not exists(select 1 from storage.objects o where o.bucket_id = 'finance-docs' and o.name = d.file_path) then
    raise exception 'The file has not finished uploading.';
  end if;
  if exists(select 1 from public.finance_documents x where x.sha256 = d.sha256 and x.status in ('stored', 'reviewed')) then
    update public.finance_documents set status = 'rejected', notes = 'Same file was already stored.' where id = d.id;
    return jsonb_build_object('ok', false, 'duplicate', true);
  end if;
  update public.finance_documents set status = 'stored', stored_at = now() where id = d.id;
  return jsonb_build_object('ok', true, 'id', d.id);
end $$;

create or replace function public.can_upload_finance_document(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists(
    select 1 from public.finance_documents d
    where d.file_path = p_path and d.status = 'reserved' and d.submitted_by = auth.uid())
$$;

create or replace function public.can_read_finance_document(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_user() and exists(
    select 1 from public.finance_documents d
    where d.file_path = p_path
      and (d.submitted_by = auth.uid() or public.finance_can('view', d.firm_id, d.store_id)))
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-docs', 'finance-docs', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'])
on conflict (id) do nothing;

-- Restrictive storage guards learn the new bucket; finance documents are
-- evidence and can never be replaced or deleted, even by the owner.
alter policy source_insert_guard on storage.objects with check (case
  when bucket_id in ('reports', 'review-photos') then public.can_upload_source(bucket_id, name)
  when bucket_id = 'finance-docs' then public.can_upload_finance_document(name)
  else public.is_owner() end);
alter policy source_read_guard on storage.objects using (case
  when bucket_id in ('reports', 'review-photos') then public.can_read_source(bucket_id, name)
  when bucket_id = 'finance-docs' then public.can_read_finance_document(name)
  else public.is_owner() end);
alter policy source_update_guard on storage.objects
  using (bucket_id not in ('reports', 'review-photos', 'finance-docs') and public.is_owner())
  with check (bucket_id not in ('reports', 'review-photos', 'finance-docs') and public.is_owner());
alter policy source_delete_guard on storage.objects
  using (bucket_id not in ('reports', 'review-photos', 'finance-docs') and public.is_owner());
create policy finance_docs_reserved_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-docs' and public.can_upload_finance_document(name));
create policy finance_docs_scoped_select on storage.objects for select to authenticated
  using (bucket_id = 'finance-docs' and public.can_read_finance_document(name));

-- ---------------------------------------------------------------- sales and stock fields
-- Logic "Bill Wise Sales Report" columns, verified on live data (3 Oct 2026):
--   GROSS AMOUNT = SALE QTY x RATE; RATE is the selling rate before discounts
--     (usually equal to M.R.P., lower for marked-down items);
--   NET AMOUNT = GROSS + CD VALUE + SCH.(Unit) + SCH.(RS.) for 99.3% of lines
--     (the discounts are separate, negative parts: never add MRP - net on top);
--   NET AMOUNT = TAXABLE AMOUNT + TOTAL TAX; TOTAL TAX = CGST (RS) + SGST (RS).
-- Lines where the parts do not add up are flagged amounts_reconciled = false.
alter table public.sales_rows
  add column unit_rate numeric,
  add column gross_amount numeric,
  add column cd_percent numeric,
  add column cd_amount numeric,
  add column scheme_unit_amount numeric,
  add column scheme_amount numeric,
  add column taxable_amount numeric,
  add column cgst_rate numeric,
  add column cgst_amount numeric,
  add column sgst_rate numeric,
  add column sgst_amount numeric,
  add column tax_amount numeric,
  add column hsn_code text,
  add column lot_code text,
  add column lot_number text,
  add column article_code text,
  add column source_line_no integer,
  add column line_kind text,
  add column amounts_reconciled boolean;

-- Logic stock export: PURCHASE RATE and BASIC RATE differ (BASIC is usually
-- PURCHASE + 5%, but not always) and are often blank. Kept as given, never
-- interpreted as a purchase batch cost.
alter table public.stock_rows
  add column purchase_rate numeric,
  add column basic_rate numeric,
  add column hsn_code text,
  add column lot_code text,
  add column lot_number text,
  add column article_code text;

create or replace function public.sales_rows_derive_fields() returns trigger
language plpgsql set search_path = '' as $$
declare r jsonb := coalesce(new.raw_data, '{}'::jsonb);
begin
  new.unit_rate := public.finance_num(r->>'RATE');
  new.gross_amount := public.finance_num(r->>'GROSS AMOUNT');
  new.cd_percent := public.finance_num(r->>'CD(%)');
  new.cd_amount := public.finance_num(r->>'CD VALUE');
  new.scheme_unit_amount := public.finance_num(r->>'SCH.(Unit)');
  new.scheme_amount := public.finance_num(r->>'SCH.(RS.)');
  new.taxable_amount := public.finance_num(r->>'TAXABLE AMOUNT');
  new.cgst_rate := public.finance_num(r->>'CGST %');
  new.cgst_amount := public.finance_num(r->>'CGST (RS)');
  new.sgst_rate := public.finance_num(r->>'SGST %');
  new.sgst_amount := public.finance_num(r->>'SGST (RS)');
  new.tax_amount := public.finance_num(r->>'TOTAL TAX');
  new.hsn_code := nullif(btrim(r->>'HSN CODE'), '');
  new.lot_code := nullif(btrim(r->>'LOT CODE'), '');
  new.lot_number := nullif(btrim(r->>'LOT NUMBER'), '');
  new.article_code := nullif(btrim(r->>'ADDITIONAL ITEM CODE'), '');
  new.source_line_no := case when btrim(r->>'SNO.') ~ '^[0-9]{1,9}$' then btrim(r->>'SNO.')::integer end;
  new.line_kind := case
    when new.bill_no is null and new.item_name is null then 'summary'
    when new.quantity is null and new.net_sale is null then 'no_amount'
    else 'item' end;
  new.amounts_reconciled := case
    when new.gross_amount is null or new.net_sale is null then null
    else abs(new.net_sale - (new.gross_amount + coalesce(new.cd_amount, 0) + coalesce(new.scheme_unit_amount, 0) + coalesce(new.scheme_amount, 0))) <= 1
      and (new.taxable_amount is null or new.tax_amount is null or abs(new.net_sale - (new.taxable_amount + new.tax_amount)) <= 0.05)
    end;
  return new;
end $$;

create or replace function public.stock_rows_derive_fields() returns trigger
language plpgsql set search_path = '' as $$
declare r jsonb := coalesce(new.raw_data, '{}'::jsonb);
begin
  new.purchase_rate := public.finance_num(r->>'PURCHASE RATE');
  new.basic_rate := public.finance_num(r->>'BASIC RATE');
  new.hsn_code := nullif(btrim(r->>'HSN CODE'), '');
  new.lot_code := nullif(btrim(r->>'LOT CODE'), '');
  new.lot_number := nullif(btrim(r->>'LOT NUMBER'), '');
  new.article_code := nullif(btrim(r->>'ADDITIONAL ITEM CODE'), '');
  return new;
end $$;

create trigger sales_rows_derive_fields before insert or update of raw_data, bill_no, item_name, quantity, net_sale
  on public.sales_rows for each row execute function public.sales_rows_derive_fields();
create trigger stock_rows_derive_fields before insert or update of raw_data
  on public.stock_rows for each row execute function public.stock_rows_derive_fields();

-- Backfill existing uploads (all versions, current and replaced).
update public.sales_rows set raw_data = raw_data;
update public.stock_rows set raw_data = raw_data;

-- Per-report lookups (repair, archive, restore, totals) scanned whole tables:
-- 1.8 s for one sales report, 6.4 s for one stock report on 3 Oct 2026.
create index sales_rows_report_id_idx on public.sales_rows (report_id);
create index stock_rows_report_id_idx on public.stock_rows (report_id);

-- One current report per store and day (sales) or month (stock, salary).
-- Verified: no duplicates exist; every writer clears the old version first.
create unique index reports_one_current_sales on public.reports (store_id, report_date)
  where is_current and report_type = 'sales';
create unique index reports_one_current_period on public.reports (store_id, report_type, period_month)
  where is_current and report_type <> 'sales';

-- Accountants and finance grantees see the stores in their scope (names for
-- the accounts screens); existing owner/manager store policies are unchanged.
create policy stores_finance_select on public.stores for select to authenticated
  using (public.finance_store_visible(id));

-- "Billed under" for anyone who can see the store, including managers who
-- cannot read the firm masters.
create or replace function public.store_billing_firm_label(p_store uuid, p_date date) returns text
language sql stable security definer set search_path = '' as $$
  select f.name from public.billing_firms f
  where public.finance_store_visible(p_store) and f.id = public.store_firm_on(p_store, p_date)
$$;

-- Review of a submitted document: kind, firm, store, party, number, date and
-- amount can be corrected by someone allowed to post for both the old and the
-- new scope. The file itself never changes.
create or replace function public.review_finance_document(
  p_id uuid, p_kind text, p_firm uuid, p_store uuid, p_party uuid, p_title text, p_doc_no text,
  p_doc_date date, p_amount numeric, p_status text, p_notes text
) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.finance_documents;
begin
  select * into d from public.finance_documents where id = p_id for update;
  if d.id is null or d.status = 'reserved' then raise exception 'Document not found.'; end if;
  if not (public.finance_can('post', d.firm_id, d.store_id) and public.finance_can('post', p_firm, p_store)) then
    raise exception 'You cannot review documents for this firm or store.';
  end if;
  if p_status not in ('stored', 'reviewed', 'rejected') then raise exception 'Invalid status'; end if;
  update public.finance_documents set kind = p_kind, firm_id = p_firm, store_id = p_store, party_id = p_party,
    title = nullif(btrim(p_title), ''), doc_no = nullif(btrim(p_doc_no), ''), doc_date = p_doc_date,
    amount = round(p_amount, 2), status = p_status, notes = nullif(btrim(p_notes), ''),
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;
end $$;

-- Owner, or an accountant managing masters for the firm, adds a physical
-- store together with the firm it bills under from its first day.
create or replace function public.finance_create_store(p_name text, p_code text, p_firm uuid, p_from date, p_location text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_store uuid; v_firm public.billing_firms;
begin
  if not public.finance_can('masters', p_firm, null) then raise exception 'You cannot add stores for this firm.'; end if;
  select * into v_firm from public.billing_firms where id = p_firm and is_active;
  if v_firm.id is null then raise exception 'Choose an active billing firm.'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Enter the store name.'; end if;
  if coalesce(p_code, '') !~ '^[A-Z0-9]{2,10}$' then raise exception 'Store code must be 2-10 capital letters or numbers.'; end if;
  if exists(select 1 from public.stores where code = p_code) then raise exception 'A store with code % already exists.', p_code; end if;
  if p_from is null then raise exception 'Choose the date the store starts billing.'; end if;
  insert into public.stores(name, code, firm_name, location, is_active)
  values (btrim(p_name), p_code, v_firm.name, nullif(btrim(coalesce(p_location, '')), ''), true)
  returning id into v_store;
  insert into public.store_firm_periods(store_id, firm_id, valid_from, status, evidence, created_by)
  values (v_store, p_firm, p_from, 'confirmed', 'Store added in Accounts with its billing firm.', auth.uid());
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(), (select role from public.profiles where id = auth.uid()), 'create_store', 'store', v_store,
    jsonb_build_object('code', p_code, 'firm_id', p_firm, 'source', 'accounts'));
  return v_store;
end $$;

-- ---------------------------------------------------------------- input coverage
create table public.sales_day_confirmations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  sale_date date not null,
  status text not null default 'zero_sales' check (status in ('zero_sales', 'withdrawn')),
  note text check (note is null or length(note) <= 500),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz not null default now()
);
create unique index sales_day_confirmations_key on public.sales_day_confirmations (store_id, sale_date);

-- Per day: is there a bill-level sales report, only a summary, nothing, or a
-- confirmed zero-sales day? Workings must not treat partial inputs as final.
create or replace function public.sales_input_coverage(p_store uuid, p_from date, p_to date)
returns table (day date, status text, report_id uuid, item_lines integer, summary_lines integer,
  no_amount_lines integer, unreconciled_lines integer, net_sale numeric)
language sql stable security definer set search_path = '' as $$
  select d::date,
    case
      when r.id is null and z.id is not null then 'zero_confirmed'
      when r.id is null then 'missing'
      when c.item_lines > 0 and c.summary_lines = 0 then 'bill_level'
      when c.item_lines = 0 and c.summary_lines > 0 then 'summary_only'
      when c.item_lines > 0 then 'mixed'
      else 'empty' end,
    r.id, coalesce(c.item_lines, 0), coalesce(c.summary_lines, 0), coalesce(c.no_amount_lines, 0),
    coalesce(c.unreconciled_lines, 0), c.net_sale
  from generate_series(p_from, p_to, interval '1 day') d
  left join public.reports r on r.store_id = p_store and r.report_type = 'sales' and r.is_current and r.report_date = d::date
  left join lateral (
    select count(*) filter (where s.line_kind = 'item')::int as item_lines,
           count(*) filter (where s.line_kind = 'summary')::int as summary_lines,
           count(*) filter (where s.line_kind = 'no_amount')::int as no_amount_lines,
           count(*) filter (where s.line_kind = 'item' and s.amounts_reconciled = false)::int as unreconciled_lines,
           sum(s.net_sale) as net_sale
    from public.sales_rows s where s.report_id = r.id) c on r.id is not null
  left join public.sales_day_confirmations z on z.store_id = p_store and z.sale_date = d::date and z.status = 'zero_sales'
  where public.finance_store_visible(p_store) and p_from <= p_to and p_to - p_from <= 400
  order by 1
$$;

-- ---------------------------------------------------------------- seed: confirmed business structure only
insert into public.billing_firms (name, notes) values
  ('Go Planet', 'Billing firm of the Go Planet store, and of the Brand Mark store before September 2026.'),
  ('GP Fashion', 'Billing firm of the Brand Mark store from September 2026.');

insert into public.store_firm_periods (store_id, firm_id, valid_from, valid_to, status, evidence)
select s.id, f.id, null, null, 'confirmed', 'Owner instruction, 3 Oct 2026: the Go Planet store bills under the Go Planet firm.'
from public.stores s, public.billing_firms f where s.code = 'GP' and f.name = 'Go Planet';

insert into public.store_firm_periods (store_id, firm_id, valid_from, valid_to, status, evidence)
select s.id, f.id, null, date '2026-08-31', 'confirmed', 'Owner instruction, 3 Oct 2026: before September 2026 the Brand Mark store billed under the Go Planet firm.'
from public.stores s, public.billing_firms f where s.code = 'BM' and f.name = 'Go Planet';

-- September 2026 stays to be confirmed: records show two BM- bill series at
-- Brand Mark on the same days (BM-36xx continuing, and a new series from
-- BM-1 reaching BM-243 by 25 Sep), so the exact cutover is not yet known.
insert into public.store_firm_periods (store_id, firm_id, valid_from, valid_to, status, evidence)
select s.id, f.id, date '2026-09-01', date '2026-09-30', 'to_confirm',
  'Owner instruction: Brand Mark bills under GP Fashion from September 2026. Exact cutover date not yet confirmed from records; two BM- bill series ran at Brand Mark in late September.'
from public.stores s, public.billing_firms f where s.code = 'BM' and f.name = 'GP Fashion';

insert into public.store_firm_periods (store_id, firm_id, valid_from, valid_to, status, evidence)
select s.id, f.id, date '2026-10-01', null, 'confirmed', 'Owner instruction, 3 Oct 2026: from September 2026 the Brand Mark store bills under GP Fashion.'
from public.stores s, public.billing_firms f where s.code = 'BM' and f.name = 'GP Fashion';

insert into public.billing_series (store_id, firm_id, prefix, valid_from, valid_to, status, evidence)
select s.id, f.id, 'GP-', null, null, 'confirmed', 'Go Planet store bills are numbered GP-; the store always bills under the Go Planet firm.'
from public.stores s, public.billing_firms f where s.code = 'GP' and f.name = 'Go Planet';

insert into public.billing_series (store_id, firm_id, prefix, valid_from, valid_to, status, evidence)
select s.id, f.id, 'BM-', null, date '2026-08-31', 'confirmed', 'Brand Mark bills before September 2026 were under the Go Planet firm.'
from public.stores s, public.billing_firms f where s.code = 'BM' and f.name = 'Go Planet';

-- ---------------------------------------------------------------- audit triggers
do $$
declare t text;
begin
  foreach t in array array['billing_firms', 'store_firm_periods', 'billing_series', 'finance_grants', 'parties',
    'party_aliases', 'agents', 'agent_parties', 'brands', 'brand_aliases', 'supply_arrangements', 'company_terms',
    'finance_documents', 'sales_day_confirmations']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.finance_audit()', t || '_audit', t);
  end loop;
  foreach t in array array['billing_firms', 'store_firm_periods', 'billing_series', 'parties', 'agents', 'brands', 'supply_arrangements']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'set_' || t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['finance_events', 'billing_firms', 'store_firm_periods', 'billing_series', 'finance_grants',
    'parties', 'party_aliases', 'agents', 'agent_parties', 'brands', 'brand_aliases', 'supply_arrangements',
    'company_terms', 'finance_documents', 'sales_day_confirmations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())', t || '_active_required', t);
  end loop;
end $$;

grant select on public.finance_events to authenticated;
create policy finance_events_select on public.finance_events for select to authenticated using (public.finance_any('view'));

grant select, insert, update on public.billing_firms, public.store_firm_periods, public.billing_series to authenticated;
create policy billing_firms_select on public.billing_firms for select to authenticated using (public.finance_any('view'));
create policy billing_firms_insert on public.billing_firms for insert to authenticated with check (public.finance_can('masters', null, null));
create policy billing_firms_update on public.billing_firms for update to authenticated
  using (public.finance_can('masters', id, null)) with check (public.finance_can('masters', id, null));
create policy store_firm_periods_select on public.store_firm_periods for select to authenticated using (public.finance_any('view'));
create policy store_firm_periods_write on public.store_firm_periods for insert to authenticated with check (public.finance_can('masters', firm_id, null));
create policy store_firm_periods_update on public.store_firm_periods for update to authenticated
  using (public.finance_can('masters', firm_id, null)) with check (public.finance_can('masters', firm_id, null));
create policy billing_series_select on public.billing_series for select to authenticated using (public.finance_any('view'));
create policy billing_series_write on public.billing_series for insert to authenticated with check (public.finance_can('masters', firm_id, store_id));
create policy billing_series_update on public.billing_series for update to authenticated
  using (public.finance_can('masters', firm_id, store_id)) with check (public.finance_can('masters', firm_id, store_id));

grant select, insert, update on public.finance_grants to authenticated;
create policy finance_grants_select on public.finance_grants for select to authenticated using (public.is_owner() or user_id = auth.uid());
create policy finance_grants_insert on public.finance_grants for insert to authenticated with check (public.is_owner());
create policy finance_grants_update on public.finance_grants for update to authenticated using (public.is_owner()) with check (public.is_owner());

grant select, insert, update on public.parties, public.party_aliases, public.agents, public.agent_parties,
  public.brands, public.brand_aliases to authenticated;
do $$
declare t text;
begin
  foreach t in array array['parties', 'party_aliases', 'agents', 'agent_parties', 'brands', 'brand_aliases']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.finance_any(''view''))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.finance_any(''masters''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.finance_any(''masters'')) with check (public.finance_any(''masters''))', t || '_update', t);
  end loop;
end $$;

grant select, insert, update on public.supply_arrangements, public.company_terms to authenticated;
create policy supply_arrangements_select on public.supply_arrangements for select to authenticated
  using (public.finance_can('view', firm_id, store_id) or (store_id is not null and public.finance_can('view', firm_id, null)));
create policy supply_arrangements_insert on public.supply_arrangements for insert to authenticated
  with check (public.finance_can('masters', firm_id, store_id));
create policy supply_arrangements_update on public.supply_arrangements for update to authenticated
  using (public.finance_can('masters', firm_id, store_id)) with check (public.finance_can('masters', firm_id, store_id));
create policy company_terms_select on public.company_terms for select to authenticated
  using (exists(select 1 from public.supply_arrangements a where a.id = arrangement_id
    and (public.finance_can('view', a.firm_id, a.store_id) or (a.store_id is not null and public.finance_can('view', a.firm_id, null)))));
create policy company_terms_insert on public.company_terms for insert to authenticated
  with check (exists(select 1 from public.supply_arrangements a where a.id = arrangement_id and public.finance_can('masters', a.firm_id, a.store_id)));
create policy company_terms_update on public.company_terms for update to authenticated
  using (exists(select 1 from public.supply_arrangements a where a.id = arrangement_id and public.finance_can('masters', a.firm_id, a.store_id)))
  with check (exists(select 1 from public.supply_arrangements a where a.id = arrangement_id and public.finance_can('masters', a.firm_id, a.store_id)));

-- Documents are written only through the reserve/finalize routines.
grant select on public.finance_documents to authenticated;
create policy finance_documents_select on public.finance_documents for select to authenticated
  using (submitted_by = auth.uid() or public.finance_can('view', firm_id, store_id));

grant select, insert, update on public.sales_day_confirmations to authenticated;
create policy sales_day_confirmations_select on public.sales_day_confirmations for select to authenticated
  using (public.finance_store_visible(store_id));
create policy sales_day_confirmations_insert on public.sales_day_confirmations for insert to authenticated
  with check (confirmed_by = auth.uid() and (public.is_owner() or store_id in (select public.user_store_ids())
    or public.finance_can('post', public.store_firm_on(store_id, sale_date), store_id)));
create policy sales_day_confirmations_update on public.sales_day_confirmations for update to authenticated
  using (public.is_owner() or store_id in (select public.user_store_ids()) or public.finance_can('post', public.store_firm_on(store_id, sale_date), store_id))
  with check (public.is_owner() or store_id in (select public.user_store_ids()) or public.finance_can('post', public.store_firm_on(store_id, sale_date), store_id));

-- ---------------------------------------------------------------- function privileges
revoke all on function public.finance_audit(), public.guard_firm_mapping(), public.guard_finance_grant(),
  public.guard_company_terms(), public.sales_rows_derive_fields(), public.stock_rows_derive_fields()
  from public, anon, authenticated;
revoke all on function public.finance_can(text, uuid, uuid), public.finance_any(text), public.finance_store_visible(uuid),
  public.store_firm_on(uuid, date), public.sales_bill_firm(uuid, date, text), public.can_submit_finance_document(text, uuid, uuid),
  public.reserve_finance_document(text, uuid, uuid, uuid, text, text, bigint, text, text, text, date),
  public.finalize_finance_document(uuid), public.can_upload_finance_document(text), public.can_read_finance_document(text),
  public.sales_input_coverage(uuid, date, date), public.store_billing_firm_label(uuid, date),
  public.review_finance_document(uuid, text, uuid, uuid, uuid, text, text, date, numeric, text, text),
  public.finance_create_store(text, text, uuid, date, text)
  from public, anon;
grant execute on function public.finance_can(text, uuid, uuid), public.finance_any(text), public.finance_store_visible(uuid),
  public.store_firm_on(uuid, date), public.sales_bill_firm(uuid, date, text), public.can_submit_finance_document(text, uuid, uuid),
  public.reserve_finance_document(text, uuid, uuid, uuid, text, text, bigint, text, text, text, date),
  public.finalize_finance_document(uuid), public.can_upload_finance_document(text), public.can_read_finance_document(text),
  public.sales_input_coverage(uuid, date, date), public.store_billing_firm_label(uuid, date),
  public.review_finance_document(uuid, text, uuid, uuid, uuid, text, text, date, numeric, text, text),
  public.finance_create_store(text, text, uuid, date, text)
  to authenticated;

commit;
