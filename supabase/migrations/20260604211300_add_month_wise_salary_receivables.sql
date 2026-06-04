-- Add owner-only month-wise salary receivables support for negative payslip amounts.
-- Each receivable belongs to a specific salary_month and payslip row.
-- Managers are intentionally not granted access to salary receivables or payslip data.

create table if not exists public.salary_receivables (
  id uuid primary key default gen_random_uuid(),
  payslip_row_id uuid references public.payslip_rows(id) on delete cascade,
  generated_payslip_id uuid references public.generated_payslips(id) on delete set null,
  batch_id uuid references public.payslip_batches(id) on delete cascade,
  store_id uuid references public.stores(id),
  staff_name text not null,
  normalized_staff_name text,
  firm_name text,
  store_name text,
  salary_month date not null,
  net_payable numeric not null,
  receivable_amount numeric not null check (receivable_amount >= 0),
  received_amount numeric default 0 check (received_amount >= 0),
  balance_amount numeric not null check (balance_amount >= 0),
  status text default 'pending' check (status in ('pending', 'partial', 'received', 'waived', 'disputed')),
  received_at timestamptz,
  received_by uuid references public.profiles(id),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint salary_receivables_payslip_row_id_key unique (payslip_row_id),
  constraint salary_receivables_negative_net_payable_check check (net_payable < 0)
);

create index if not exists salary_receivables_salary_month_idx on public.salary_receivables(salary_month);
create index if not exists salary_receivables_store_id_idx on public.salary_receivables(store_id);
create index if not exists salary_receivables_status_idx on public.salary_receivables(status);
create index if not exists salary_receivables_staff_name_idx on public.salary_receivables(staff_name);
create index if not exists salary_receivables_payslip_row_id_idx on public.salary_receivables(payslip_row_id);
create index if not exists salary_receivables_salary_month_store_id_idx on public.salary_receivables(salary_month, store_id);
create index if not exists salary_receivables_salary_month_status_idx on public.salary_receivables(salary_month, status);

drop trigger if exists set_salary_receivables_updated_at on public.salary_receivables;
create trigger set_salary_receivables_updated_at
  before update on public.salary_receivables
  for each row execute function public.set_updated_at();

alter table public.salary_receivables enable row level security;

drop policy if exists "salary_receivables_owner_all" on public.salary_receivables;
create policy "salary_receivables_owner_all"
on public.salary_receivables
for all
using (public.is_owner())
with check (public.is_owner());
