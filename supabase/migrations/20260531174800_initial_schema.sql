-- GPBM Retail initial schema
-- Project: retail.gpbm.in

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role text not null default 'manager' check (role in ('owner','manager')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  type text,
  location text,
  is_active boolean default true,
  monthly_target_enabled boolean default false,
  monthly_target numeric,
  slow_stock_days int default 45,
  dead_stock_days int default 90,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.store_users (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'manager',
  created_at timestamptz default now(),
  unique (store_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  uploaded_by uuid references public.profiles(id),
  report_type text not null check (report_type in ('sales','stock','salary_attendance')),
  report_date date,
  period_month date,
  file_name text,
  file_path text,
  status text default 'processed',
  row_count int default 0,
  summary jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.sales_rows (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  store_id uuid references public.stores(id),
  sale_date date,
  bill_no text,
  item_name text,
  sku text,
  barcode text,
  brand text,
  category text,
  size text,
  color text,
  quantity numeric default 0,
  mrp numeric,
  discount numeric,
  net_sale numeric,
  staff_name text,
  customer_name text,
  customer_phone text,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.stock_rows (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete cascade,
  store_id uuid references public.stores(id),
  stock_month date,
  item_name text,
  sku text,
  barcode text,
  brand text,
  category text,
  size text,
  color text,
  quantity numeric default 0,
  mrp numeric,
  cost_price numeric,
  supplier text,
  purchase_date date,
  ageing_days int,
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  created_by uuid references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  title text not null,
  description text,
  category text,
  priority text default 'normal' check (priority in ('low','normal','high','urgent')),
  status text default 'pending' check (status in ('pending','in_progress','done','moved','waiting','cancelled')),
  due_date date,
  due_time time,
  is_private boolean default false,
  carry_forward boolean default true,
  source text default 'manual' check (source in ('manual','manager','auto','ai')),
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.manager_updates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  created_by uuid references public.profiles(id),
  title text not null,
  details text,
  category text,
  urgency text default 'normal',
  status text default 'open',
  photo_path text,
  created_task_id uuid references public.tasks(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.rack_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  reviewed_by uuid references public.profiles(id),
  review_date date default current_date,
  rack_arranged boolean default false,
  sizes_arranged boolean default false,
  new_stock_displayed boolean default false,
  brand_display_proper boolean default false,
  dust_free boolean default false,
  lighting_ok boolean default false,
  premium_display_ok boolean default false,
  remarks text,
  photo_path text,
  created_at timestamptz default now()
);

create table if not exists public.cleaning_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  reviewed_by uuid references public.profiles(id),
  review_date date default current_date,
  entry_clean boolean default false,
  floor_clean boolean default false,
  trial_room_clean boolean default false,
  billing_counter_clean boolean default false,
  racks_clean boolean default false,
  mirrors_clean boolean default false,
  lights_working boolean default false,
  ac_fan_working boolean default false,
  staff_grooming_ok boolean default false,
  store_smell_fresh boolean default false,
  remarks text,
  photo_path text,
  created_at timestamptz default now()
);

create table if not exists public.life_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  log_date date default current_date,
  mood text,
  energy text,
  wake_time timestamptz,
  sleep_time timestamptz,
  gym_done boolean default false,
  sports_done boolean default false,
  sleep_quality text,
  no_useless_scrolling boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, log_date)
);

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  memory_type text,
  title text,
  content text not null,
  importance int default 3,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('user','assistant','system')),
  content text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.weekly_audits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  week_start date,
  week_end date,
  generated_by uuid references public.profiles(id),
  summary jsonb default '{}'::jsonb,
  ai_summary text,
  created_at timestamptz default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into public.stores (name, code, type, slow_stock_days, dead_stock_days)
values
  ('Go Planet', 'GP', 'mass retail', 30, 60),
  ('Brand Mark', 'BM', 'premium retail', 45, 90),
  ('MITTY', 'MITTY', 'own brand', 45, 90)
on conflict (code) do update set
  name = excluded.name,
  type = excluded.type,
  slow_stock_days = excluded.slow_stock_days,
  dead_stock_days = excluded.dead_stock_days,
  updated_at = now();

insert into public.app_settings (key, value)
values
  ('salary_day', '{"day":3}'::jsonb),
  ('salary_attendance_due_day', '{"day":1}'::jsonb),
  ('stock_report_due_day', '{"day":1}'::jsonb),
  ('weekly_audit_day', '{"day":"monday"}'::jsonb),
  ('timezone', '{"timezone":"Asia/Kolkata"}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare
  target_table text;
begin
  foreach target_table in array array['profiles','stores','tasks','manager_updates','life_logs','ai_memories','app_settings'] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', target_table, target_table);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', target_table, target_table);
  end loop;
end;
$$;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists stores_code_idx on public.stores(code);
create index if not exists store_users_user_id_idx on public.store_users(user_id);
create index if not exists store_users_store_id_idx on public.store_users(store_id);
create index if not exists reports_store_id_idx on public.reports(store_id);
create index if not exists reports_report_type_idx on public.reports(report_type);
create index if not exists reports_report_date_idx on public.reports(report_date);
create index if not exists reports_period_month_idx on public.reports(period_month);
create index if not exists sales_rows_store_id_idx on public.sales_rows(store_id);
create index if not exists sales_rows_sale_date_idx on public.sales_rows(sale_date);
create index if not exists sales_rows_staff_name_idx on public.sales_rows(staff_name);
create index if not exists sales_rows_brand_idx on public.sales_rows(brand);
create index if not exists sales_rows_category_idx on public.sales_rows(category);
create index if not exists stock_rows_store_id_idx on public.stock_rows(store_id);
create index if not exists stock_rows_stock_month_idx on public.stock_rows(stock_month);
create index if not exists stock_rows_brand_idx on public.stock_rows(brand);
create index if not exists stock_rows_category_idx on public.stock_rows(category);
create index if not exists tasks_store_id_idx on public.tasks(store_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists manager_updates_store_id_idx on public.manager_updates(store_id);
create index if not exists rack_reviews_store_id_review_date_idx on public.rack_reviews(store_id, review_date);
create index if not exists cleaning_reviews_store_id_review_date_idx on public.cleaning_reviews(store_id, review_date);
create index if not exists life_logs_user_id_log_date_idx on public.life_logs(user_id, log_date);

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active = true
  );
$$;

create or replace function public.user_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.store_users where user_id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_users enable row level security;
alter table public.reports enable row level security;
alter table public.sales_rows enable row level security;
alter table public.stock_rows enable row level security;
alter table public.tasks enable row level security;
alter table public.manager_updates enable row level security;
alter table public.rack_reviews enable row level security;
alter table public.cleaning_reviews enable row level security;
alter table public.life_logs enable row level security;
alter table public.ai_memories enable row level security;
alter table public.ai_chats enable row level security;
alter table public.weekly_audits enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles_select_own_or_owner" on public.profiles for select using (id = auth.uid() or public.is_owner());
create policy "profiles_owner_insert" on public.profiles for insert with check (public.is_owner());
create policy "profiles_owner_update" on public.profiles for update using (public.is_owner()) with check (public.is_owner());
create policy "profiles_owner_delete" on public.profiles for delete using (public.is_owner());

create policy "stores_owner_all" on public.stores for all using (public.is_owner()) with check (public.is_owner());
create policy "stores_manager_select_assigned" on public.stores for select using (id in (select public.user_store_ids()));

create policy "store_users_owner_all" on public.store_users for all using (public.is_owner()) with check (public.is_owner());
create policy "store_users_manager_select_own" on public.store_users for select using (user_id = auth.uid());

create policy "reports_owner_all" on public.reports for all using (public.is_owner()) with check (public.is_owner());
create policy "reports_manager_select_assigned" on public.reports for select using (store_id in (select public.user_store_ids()));
create policy "reports_manager_insert_assigned" on public.reports for insert with check (store_id in (select public.user_store_ids()) and uploaded_by = auth.uid());

create policy "sales_rows_owner_all" on public.sales_rows for all using (public.is_owner()) with check (public.is_owner());
create policy "sales_rows_manager_select_assigned" on public.sales_rows for select using (store_id in (select public.user_store_ids()));

create policy "stock_rows_owner_all" on public.stock_rows for all using (public.is_owner()) with check (public.is_owner());
create policy "stock_rows_manager_select_assigned" on public.stock_rows for select using (store_id in (select public.user_store_ids()));

create policy "tasks_owner_all" on public.tasks for all using (public.is_owner()) with check (public.is_owner());
create policy "tasks_manager_select_allowed" on public.tasks for select using ((store_id in (select public.user_store_ids()) or assigned_to = auth.uid()) and coalesce(is_private, false) = false);
create policy "tasks_manager_insert_assigned_store" on public.tasks for insert with check (store_id in (select public.user_store_ids()) and coalesce(is_private, false) = false and created_by = auth.uid());
create policy "tasks_manager_update_allowed" on public.tasks for update using ((store_id in (select public.user_store_ids()) or assigned_to = auth.uid()) and coalesce(is_private, false) = false) with check ((store_id in (select public.user_store_ids()) or assigned_to = auth.uid()) and coalesce(is_private, false) = false);

create policy "manager_updates_owner_all" on public.manager_updates for all using (public.is_owner()) with check (public.is_owner());
create policy "manager_updates_manager_select_assigned" on public.manager_updates for select using (store_id in (select public.user_store_ids()));
create policy "manager_updates_manager_insert_assigned" on public.manager_updates for insert with check (store_id in (select public.user_store_ids()) and created_by = auth.uid());

create policy "rack_reviews_owner_all" on public.rack_reviews for all using (public.is_owner()) with check (public.is_owner());
create policy "rack_reviews_manager_select_assigned" on public.rack_reviews for select using (store_id in (select public.user_store_ids()));
create policy "rack_reviews_manager_insert_assigned" on public.rack_reviews for insert with check (store_id in (select public.user_store_ids()) and reviewed_by = auth.uid());

create policy "cleaning_reviews_owner_all" on public.cleaning_reviews for all using (public.is_owner()) with check (public.is_owner());
create policy "cleaning_reviews_manager_select_assigned" on public.cleaning_reviews for select using (store_id in (select public.user_store_ids()));
create policy "cleaning_reviews_manager_insert_assigned" on public.cleaning_reviews for insert with check (store_id in (select public.user_store_ids()) and reviewed_by = auth.uid());

create policy "life_logs_owner_all" on public.life_logs for all using (public.is_owner()) with check (public.is_owner());
create policy "life_logs_user_select_own" on public.life_logs for select using (user_id = auth.uid());
create policy "life_logs_user_insert_own" on public.life_logs for insert with check (user_id = auth.uid());
create policy "life_logs_user_update_own" on public.life_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_memories_owner_all" on public.ai_memories for all using (public.is_owner()) with check (public.is_owner());
create policy "ai_memories_user_select_own" on public.ai_memories for select using (user_id = auth.uid());
create policy "ai_memories_user_insert_own" on public.ai_memories for insert with check (user_id = auth.uid());
create policy "ai_memories_user_update_own" on public.ai_memories for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_chats_owner_all" on public.ai_chats for all using (public.is_owner()) with check (public.is_owner());
create policy "ai_chats_user_select_own" on public.ai_chats for select using (user_id = auth.uid());
create policy "ai_chats_user_insert_own" on public.ai_chats for insert with check (user_id = auth.uid());

create policy "weekly_audits_owner_all" on public.weekly_audits for all using (public.is_owner()) with check (public.is_owner());
create policy "weekly_audits_manager_select_assigned" on public.weekly_audits for select using (store_id in (select public.user_store_ids()));

create policy "app_settings_owner_all" on public.app_settings for all using (public.is_owner()) with check (public.is_owner());
create policy "app_settings_authenticated_select" on public.app_settings for select using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values
  ('reports', 'reports', false),
  ('review-photos', 'review-photos', false)
on conflict (id) do nothing;

create policy "storage_reports_owner_all" on storage.objects for all using (bucket_id = 'reports' and public.is_owner()) with check (bucket_id = 'reports' and public.is_owner());
create policy "storage_reports_authenticated_insert" on storage.objects for insert with check (bucket_id = 'reports' and auth.role() = 'authenticated');
create policy "storage_reports_authenticated_select" on storage.objects for select using (bucket_id = 'reports' and auth.role() = 'authenticated');
create policy "storage_review_photos_owner_all" on storage.objects for all using (bucket_id = 'review-photos' and public.is_owner()) with check (bucket_id = 'review-photos' and public.is_owner());
create policy "storage_review_photos_authenticated_insert" on storage.objects for insert with check (bucket_id = 'review-photos' and auth.role() = 'authenticated');
create policy "storage_review_photos_authenticated_select" on storage.objects for select using (bucket_id = 'review-photos' and auth.role() = 'authenticated');