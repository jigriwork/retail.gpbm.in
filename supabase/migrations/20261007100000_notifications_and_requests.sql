-- Phone notifications (web push), the in-app inbox, and requests to the owner.
-- * push_subscriptions: each phone/browser that allowed notifications.
-- * notifications: one row per person per notice (the 🔔 inbox); the push to
--   phones is sent by the app (service role) after inserting the rows.
-- * team_requests: staff, managers and cashiers write a need ("hangers
--   finished", "leave on Sunday"); owners are notified and reply.
begin;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures integer not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('task', 'broadcast', 'request', 'request_reply', 'approval', 'alert')),
  title text not null check (length(title) between 1 and 120),
  body text check (length(body) <= 600),
  url text check (url is null or url ~ '^/[a-z]'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

create table public.team_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  category text not null check (category in ('stock', 'supplies', 'leave', 'issue', 'idea', 'other')),
  message text not null check (length(btrim(message)) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  reply text check (length(reply) <= 600),
  replied_by uuid references public.profiles(id),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index team_requests_status_idx on public.team_requests (status, created_at desc);
alter table public.team_requests enable row level security;
revoke all on public.team_requests from anon, authenticated;

-- ---------------------------------------------------------------- subscriptions
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Sign in first.'; end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, failures = 0;
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- inbox
create function public.my_notifications(p_limit integer default 50) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'unread', (select count(*) from public.notifications where user_id = auth.uid() and read_at is null),
    'items', coalesce((select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc) from (
      select n.id, n.kind, n.title, n.body, n.url, n.created_at, n.read_at, p.full_name as sender
      from public.notifications n left join public.profiles p on p.id = n.created_by
      where n.user_id = auth.uid() order by n.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) t), '[]'::jsonb))
$$;

create function public.my_unread_notifications() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.notifications where user_id = auth.uid() and read_at is null
$$;

create function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- ---------------------------------------------------------------- requests to the owner
-- The writer's store: a staff member's store, else a manager's / cashier's first store.
create function public.create_team_request(p_category text, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_store uuid; v_id uuid;
begin
  select role into v_role from public.profiles where id = auth.uid() and is_active;
  if v_role is null or v_role not in ('staff', 'manager', 'cashier') then raise exception 'Requests are for staff, managers and cashiers.'; end if;
  if v_role = 'staff' then
    select e.store_id into v_store from public.employee_contacts e where e.id = public.current_staff_employee_id();
    if v_store is null then raise exception 'Staff access denied.'; end if;
  else
    select su.store_id into v_store from public.store_users su join public.stores s on s.id = su.store_id and s.is_active
    where su.user_id = auth.uid() order by s.code limit 1;
  end if;
  insert into public.team_requests(store_id, category, message) values (v_store, p_category, btrim(p_message)) returning id into v_id;
  return v_id;
end $$;

create function public.my_team_requests() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb) from (
    select id, category, message, status, reply, replied_at, created_at from public.team_requests
    where created_by = auth.uid() order by created_at desc limit 50) t
$$;

-- Owners: every request (open first).
create function public.owner_team_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owner sees all requests.'; end if;
  return coalesce((select jsonb_agg(row_to_json(t)::jsonb) from (
    select r.id, r.category, r.message, r.status, r.reply, r.replied_at, r.created_at, r.created_by,
      p.full_name as writer, p.role as writer_role, s.name as store
    from public.team_requests r join public.profiles p on p.id = r.created_by left join public.stores s on s.id = r.store_id
    order by (r.status = 'open') desc, r.created_at desc limit 200) t), '[]'::jsonb);
end $$;

create function public.answer_team_request(p_request uuid, p_status text, p_reply text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_writer uuid;
begin
  if not public.is_owner() then raise exception 'Only the owner answers requests.'; end if;
  if p_status not in ('open', 'done', 'declined') then raise exception 'Choose done or declined.'; end if;
  update public.team_requests set status = p_status, reply = nullif(btrim(coalesce(p_reply, '')), ''), replied_by = auth.uid(), replied_at = now()
  where id = p_request returning created_by into v_writer;
  if v_writer is null then raise exception 'Request not found.'; end if;
  return v_writer;
end $$;

revoke all on function public.save_push_subscription(text, text, text, text), public.remove_push_subscription(text),
  public.my_notifications(integer), public.my_unread_notifications(), public.mark_notifications_read(),
  public.create_team_request(text, text), public.my_team_requests(), public.owner_team_requests(),
  public.answer_team_request(uuid, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text), public.remove_push_subscription(text),
  public.my_notifications(integer), public.my_unread_notifications(), public.mark_notifications_read(),
  public.create_team_request(text, text), public.my_team_requests(), public.owner_team_requests(),
  public.answer_team_request(uuid, text, text) to authenticated;

commit;
