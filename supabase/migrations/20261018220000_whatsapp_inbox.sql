-- WhatsApp inbox: customers' replies to the stores' MSG91 numbers (read from
-- MSG91's logs) and the free-text replies staff send back from the app.
-- Only the server (service role) reads or writes it; pages check the role.
begin;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  provider_id text unique,
  brand_code text not null check (brand_code in ('GP', 'BM')),
  store_id uuid references public.stores(id),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  direction text not null check (direction in ('in', 'out')),
  message_type text not null default 'text',
  body text not null default '' check (length(body) <= 4096),
  template_name text,
  sent_by uuid references public.profiles(id),
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_chat_idx on public.whatsapp_messages (brand_code, mobile, sent_at desc);
create index if not exists whatsapp_messages_recent_idx on public.whatsapp_messages (sent_at desc);

alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from anon, authenticated;

commit;
