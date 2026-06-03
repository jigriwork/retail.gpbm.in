-- Add owner-only payslip generation schema and storage support.
-- Sample payslip PDFs are format references only; persisted values come from uploaded salary sheets.

alter table public.stores
  add column if not exists firm_name text;

update public.stores
set firm_name = 'Go Planet', updated_at = now()
where code in ('GP', 'BM');

-- Keep MITTY inactive; do not set a default firm for inactive stores here.
update public.stores
set is_active = false, updated_at = now()
where code = 'MITTY';

create table if not exists public.payslip_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references public.profiles(id),
  salary_month date not null,
  source_file_name text,
  source_file_path text,
  status text default 'review' check (status in ('review','generated','partial','failed')),
  total_rows int default 0,
  valid_rows int default 0,
  warning_count int default 0,
  generated_count int default 0,
  summary jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.payslip_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.payslip_batches(id) on delete cascade,
  store_id uuid references public.stores(id),
  firm_name text not null,
  store_name text not null,
  salary_month date not null,
  staff_name text,
  salary_amount numeric,
  divided_by_days numeric,
  abs_days numeric default 0,
  abs_amount numeric default 0,
  sunday_pay numeric default 0,
  sunday_present numeric default 0,
  sunday_pay_amount numeric default 0,
  advance numeric default 0,
  commission numeric default 0,
  uploaded_total_amount numeric,
  calculated_total_amount numeric,
  net_payable numeric,
  warning_message text,
  status text default 'ready' check (status in ('ready','generated','missing_staff_name','missing_salary_amount','total_mismatch','failed')),
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.generated_payslips (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.payslip_batches(id) on delete cascade,
  payslip_row_id uuid references public.payslip_rows(id) on delete cascade,
  store_id uuid references public.stores(id),
  staff_name text not null,
  firm_name text not null,
  store_name text not null,
  salary_month date not null,
  pdf_file_name text,
  pdf_file_path text,
  zip_file_path text,
  status text default 'generated',
  created_at timestamptz default now()
);

create index if not exists payslip_batches_uploaded_by_idx on public.payslip_batches(uploaded_by);
create index if not exists payslip_batches_salary_month_idx on public.payslip_batches(salary_month);
create index if not exists payslip_batches_status_idx on public.payslip_batches(status);

create index if not exists payslip_rows_batch_id_idx on public.payslip_rows(batch_id);
create index if not exists payslip_rows_store_id_idx on public.payslip_rows(store_id);
create index if not exists payslip_rows_salary_month_idx on public.payslip_rows(salary_month);
create index if not exists payslip_rows_status_idx on public.payslip_rows(status);
create index if not exists payslip_rows_staff_name_idx on public.payslip_rows(staff_name);

create index if not exists generated_payslips_batch_id_idx on public.generated_payslips(batch_id);
create index if not exists generated_payslips_payslip_row_id_idx on public.generated_payslips(payslip_row_id);
create index if not exists generated_payslips_store_id_idx on public.generated_payslips(store_id);
create index if not exists generated_payslips_salary_month_idx on public.generated_payslips(salary_month);

drop trigger if exists set_payslip_batches_updated_at on public.payslip_batches;
create trigger set_payslip_batches_updated_at
  before update on public.payslip_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_payslip_rows_updated_at on public.payslip_rows;
create trigger set_payslip_rows_updated_at
  before update on public.payslip_rows
  for each row execute function public.set_updated_at();

alter table public.payslip_batches enable row level security;
alter table public.payslip_rows enable row level security;
alter table public.generated_payslips enable row level security;

drop policy if exists "payslip_batches_owner_all" on public.payslip_batches;
create policy "payslip_batches_owner_all"
on public.payslip_batches
for all
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "payslip_rows_owner_all" on public.payslip_rows;
create policy "payslip_rows_owner_all"
on public.payslip_rows
for all
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "generated_payslips_owner_all" on public.generated_payslips;
create policy "generated_payslips_owner_all"
on public.generated_payslips
for all
using (public.is_owner())
with check (public.is_owner());

insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "storage_payslips_owner_all" on storage.objects;
create policy "storage_payslips_owner_all"
on storage.objects
for all
using (bucket_id = 'payslips' and public.is_owner())
with check (bucket_id = 'payslips' and public.is_owner());