-- Add owner-only employee contact directory and payslip phone snapshot fields.
-- This migration is additive and keeps existing payslip behavior intact.

create table if not exists public.employee_contacts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  staff_name text not null,
  normalized_staff_name text not null,
  phone text,
  normalized_phone text,
  whatsapp_phone text,
  is_active boolean default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint employee_contacts_store_staff_name_key unique (store_id, normalized_staff_name)
);

alter table public.payslip_rows
  add column if not exists employee_phone text,
  add column if not exists whatsapp_phone text;

alter table public.generated_payslips
  add column if not exists employee_phone text,
  add column if not exists whatsapp_phone text;

create index if not exists employee_contacts_store_id_idx on public.employee_contacts(store_id);
create index if not exists employee_contacts_normalized_staff_name_idx on public.employee_contacts(normalized_staff_name);
create index if not exists employee_contacts_whatsapp_phone_idx on public.employee_contacts(whatsapp_phone);
create index if not exists payslip_rows_whatsapp_phone_idx on public.payslip_rows(whatsapp_phone);
create index if not exists generated_payslips_whatsapp_phone_idx on public.generated_payslips(whatsapp_phone);

drop trigger if exists set_employee_contacts_updated_at on public.employee_contacts;
create trigger set_employee_contacts_updated_at
  before update on public.employee_contacts
  for each row execute function public.set_updated_at();

alter table public.employee_contacts enable row level security;

drop policy if exists "employee_contacts_owner_all" on public.employee_contacts;
create policy "employee_contacts_owner_all"
on public.employee_contacts
for all
using (public.is_owner())
with check (public.is_owner());
