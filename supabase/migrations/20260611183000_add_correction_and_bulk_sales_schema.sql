-- Add safe schema support for Data Correction Center and bulk sales upload tracking.
-- This migration is additive only: it creates new owner-only tables and adds a nullable reports link.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  store_id uuid references public.stores(id),
  report_date date,
  period_month date,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.sales_upload_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references public.profiles(id),
  store_id uuid references public.stores(id) not null,
  upload_mode text default 'bulk' check (upload_mode in ('daily', 'bulk', 'replacement')),
  original_file_name text,
  file_path text,
  detected_start_date date,
  detected_end_date date,
  total_dates integer default 0,
  imported_dates integer default 0,
  skipped_dates integer default 0,
  replaced_dates integer default 0,
  failed_dates integer default 0,
  total_rows integer default 0,
  total_net_sale numeric default 0,
  total_quantity numeric default 0,
  total_bills integer default 0,
  unmatched_staff_count integer default 0,
  status text default 'uploaded' check (status in ('uploaded', 'processed', 'partial', 'failed', 'cancelled')),
  summary jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.reports
  add column if not exists sales_upload_batch_id uuid references public.sales_upload_batches(id) on delete set null;

drop trigger if exists set_sales_upload_batches_updated_at on public.sales_upload_batches;
create trigger set_sales_upload_batches_updated_at
  before update on public.sales_upload_batches
  for each row execute function public.set_updated_at();

create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_entity_type_entity_id_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_store_id_idx on public.audit_logs(store_id);
create index if not exists audit_logs_report_date_idx on public.audit_logs(report_date);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at);

create index if not exists sales_upload_batches_store_id_idx on public.sales_upload_batches(store_id);
create index if not exists sales_upload_batches_uploaded_by_idx on public.sales_upload_batches(uploaded_by);
create index if not exists sales_upload_batches_detected_dates_idx on public.sales_upload_batches(detected_start_date, detected_end_date);
create index if not exists sales_upload_batches_status_idx on public.sales_upload_batches(status);
create index if not exists sales_upload_batches_created_at_idx on public.sales_upload_batches(created_at);

create index if not exists reports_sales_upload_batch_id_idx on public.reports(sales_upload_batch_id);

alter table public.audit_logs enable row level security;
alter table public.sales_upload_batches enable row level security;

drop policy if exists "audit_logs_owner_select" on public.audit_logs;
create policy "audit_logs_owner_select"
on public.audit_logs
for select
using (public.is_owner());

drop policy if exists "audit_logs_owner_insert" on public.audit_logs;
create policy "audit_logs_owner_insert"
on public.audit_logs
for insert
with check (public.is_owner());

drop policy if exists "sales_upload_batches_owner_all" on public.sales_upload_batches;
create policy "sales_upload_batches_owner_all"
on public.sales_upload_batches
for all
using (public.is_owner())
with check (public.is_owner());