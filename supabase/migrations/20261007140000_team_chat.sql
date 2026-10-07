-- Team chat.
-- Rooms: per store "team" (owners, the store's manager/cashier, its staff with
-- a login) and "management" (owners, manager, cashier); "owners"; and private
-- chats between an owner and one person. Membership follows roles and stores,
-- so a manager only ever sees their own store's chats.
-- Messages: text with @mentions; owners and managers can "keep" a message
-- (kept forever); others are removed after 90 days. Owners can delete any
-- message and make a group announcements-only.
begin;

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('store_team', 'store_management', 'owners', 'direct')),
  store_id uuid references public.stores(id),
  user_a uuid references public.profiles(id),
  user_b uuid references public.profiles(id),
  announcements_only boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind in ('store_team', 'store_management')) = (store_id is not null)),
  check ((kind = 'direct') = (user_a is not null and user_b is not null and user_a < user_b))
);
create unique index chat_rooms_store_kind on public.chat_rooms (kind, store_id) where store_id is not null;
create unique index chat_rooms_owners on public.chat_rooms (kind) where kind = 'owners';
create unique index chat_rooms_direct on public.chat_rooms (user_a, user_b) where kind = 'direct';
alter table public.chat_rooms enable row level security;
revoke all on public.chat_rooms from anon, authenticated;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (length(body) <= 2000),
  mentions uuid[] not null default '{}',
  kept boolean not null default false,
  kept_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index chat_messages_room_idx on public.chat_messages (room_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

create table public.chat_reads (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from anon, authenticated;

-- ---------------------------------------------------------------- membership
create function public.chat_room_member_ids(p_room uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with r as (select * from public.chat_rooms where id = p_room)
  select p.id from public.profiles p, r where r.kind <> 'direct' and p.is_active and p.role = 'owner'
  union
  select su.user_id from public.store_users su join public.profiles p on p.id = su.user_id and p.is_active and p.role in ('manager', 'cashier'), r
  where r.kind in ('store_team', 'store_management') and su.store_id = r.store_id
  union
  select l.auth_user_id from public.employee_auth_links l join public.profiles p on p.id = l.auth_user_id and p.is_active, r
  where r.kind = 'store_team' and l.status = 'active' and l.store_id = r.store_id
  union
  select x from r cross join lateral unnest(array[r.user_a, r.user_b]) x where r.kind = 'direct'
$$;
revoke all on function public.chat_room_member_ids(uuid) from public, anon, authenticated;
grant execute on function public.chat_room_member_ids(uuid) to service_role;

create function public.can_chat(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.is_active_user() and auth.uid() in (select public.chat_room_member_ids(p_room))
$$;

-- Live updates: a member may read the room's messages (used by the app's live view).
grant select on public.chat_messages to authenticated;
create policy chat_messages_members_read on public.chat_messages for select to authenticated using (public.can_chat(room_id));

create function public.chat_display_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.staff_name from public.employee_auth_links l join public.employee_contacts e on e.id = l.employee_contact_id where l.auth_user_id = p_user limit 1),
    (select coalesce(nullif(btrim(full_name), ''), split_part(email, '@', 1)) from public.profiles where id = p_user), 'Someone')
$$;
revoke all on function public.chat_display_name(uuid) from public, anon, authenticated;

-- Store rooms and the owners' room exist for every active store.
create function public.ensure_chat_rooms() returns void
language sql security definer set search_path = '' as $$
  insert into public.chat_rooms(kind, store_id) select k, s.id from public.stores s cross join (values ('store_team'), ('store_management')) v(k)
  where s.is_active on conflict do nothing;
  insert into public.chat_rooms(kind) values ('owners') on conflict do nothing;
$$;
revoke all on function public.ensure_chat_rooms() from public, anon, authenticated;

create function public.chat_room_title(p_room uuid, p_viewer uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case r.kind
    when 'store_team' then s.name || ' team'
    when 'store_management' then s.name || ' management'
    when 'owners' then 'Owners'
    else public.chat_display_name(case when r.user_a = p_viewer then r.user_b else r.user_a end) end
  from public.chat_rooms r left join public.stores s on s.id = r.store_id where r.id = p_room
$$;
revoke all on function public.chat_room_title(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- rooms list
create function public.my_chat_rooms() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_active_user() then raise exception 'Sign in first.'; end if;
  perform public.ensure_chat_rooms();
  return coalesce((select jsonb_agg(row_to_json(t)::jsonb order by t.sort_at desc nulls last, t.title) from (
    select r.id, r.kind, r.announcements_only, public.chat_room_title(r.id, v_me) as title,
      m.body as last_body, m.created_at as last_at, public.chat_display_name(m.sender_id) as last_sender,
      (select count(*) from public.chat_messages x where x.room_id = r.id and x.deleted_at is null and x.sender_id <> v_me
         and x.created_at > coalesce((select last_read_at from public.chat_reads cr where cr.room_id = r.id and cr.user_id = v_me), '-infinity')) as unread,
      coalesce(m.created_at, r.created_at) as sort_at
    from public.chat_rooms r
    left join lateral (select body, created_at, sender_id from public.chat_messages x where x.room_id = r.id and x.deleted_at is null order by created_at desc limit 1) m on true
    where v_me in (select public.chat_room_member_ids(r.id))
  ) t), '[]'::jsonb);
end $$;

create function public.chat_unread_total() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.chat_messages x
  join public.chat_rooms r on r.id = x.room_id
  where x.deleted_at is null and x.sender_id <> auth.uid()
    and x.created_at > coalesce((select last_read_at from public.chat_reads cr where cr.room_id = x.room_id and cr.user_id = auth.uid()), now() - interval '30 days')
    and x.created_at > now() - interval '30 days'
    and auth.uid() in (select public.chat_room_member_ids(r.id))
$$;

-- An owner and one person (either side may open it; one of them must be an owner).
create function public.open_direct_chat(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
begin
  if v_me is null or not public.is_active_user() then raise exception 'Sign in first.'; end if;
  if p_other is null or p_other = v_me or not exists (select 1 from public.profiles where id = p_other and is_active) then raise exception 'Choose a person.'; end if;
  if not (public.is_owner() or exists (select 1 from public.profiles where id = p_other and role = 'owner')) then
    raise exception 'Private chats are with an owner.';
  end if;
  v_a := least(v_me, p_other); v_b := greatest(v_me, p_other);
  insert into public.chat_rooms(kind, user_a, user_b) values ('direct', v_a, v_b) on conflict do nothing;
  select id into v_id from public.chat_rooms where kind = 'direct' and user_a = v_a and user_b = v_b;
  return v_id;
end $$;

-- ---------------------------------------------------------------- one room
create function public.chat_room(p_room uuid, p_limit integer default 80) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if not public.can_chat(p_room) then raise exception 'You are not in this chat.'; end if;
  return (select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'announcements_only', r.announcements_only, 'title', public.chat_room_title(r.id, v_me),
    'me', v_me, 'my_role', (select role from public.profiles where id = v_me),
    'members', (select jsonb_agg(jsonb_build_object('id', m, 'name', public.chat_display_name(m), 'role', (select role from public.profiles where id = m)) order by public.chat_display_name(m))
                from public.chat_room_member_ids(r.id) m),
    'reads', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'at', last_read_at)) from public.chat_reads where room_id = r.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(row_to_json(t)::jsonb order by t.created_at) from (
        select x.id, x.sender_id, public.chat_display_name(x.sender_id) as sender, case when x.deleted_at is null then x.body else '' end as body,
          x.mentions, x.kept, x.created_at, x.deleted_at is not null as deleted
        from public.chat_messages x where x.room_id = r.id order by x.created_at desc limit least(greatest(coalesce(p_limit, 80), 1), 300)) t), '[]'::jsonb))
  from public.chat_rooms r where r.id = p_room);
end $$;

create function public.mark_chat_read(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_chat(p_room) then return; end if;
  insert into public.chat_reads(room_id, user_id, last_read_at) values (p_room, auth.uid(), now())
  on conflict (room_id, user_id) do update set last_read_at = now();
end $$;

-- Returns the new message id and who to notify (other members, and who was mentioned).
create function public.send_chat_message(p_room uuid, p_body text, p_mentions uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_room public.chat_rooms; v_id uuid; v_members uuid[]; v_mentions uuid[];
begin
  if not public.can_chat(p_room) then raise exception 'You are not in this chat.'; end if;
  if length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message.'; end if;
  select * into v_room from public.chat_rooms where id = p_room;
  if v_room.announcements_only and not public.is_owner() then raise exception 'Only the owners can post in this group.'; end if;
  select array_agg(m) into v_members from public.chat_room_member_ids(p_room) m;
  select coalesce(array_agg(distinct x), '{}') into v_mentions from unnest(coalesce(p_mentions, '{}')) x where x = any(v_members) and x <> v_me;
  insert into public.chat_messages(room_id, sender_id, body, mentions) values (p_room, v_me, left(btrim(p_body), 2000), v_mentions) returning id into v_id;
  insert into public.chat_reads(room_id, user_id, last_read_at) values (p_room, v_me, now())
  on conflict (room_id, user_id) do update set last_read_at = now();
  return jsonb_build_object('id', v_id, 'members', to_jsonb(array_remove(v_members, v_me)), 'mentions', to_jsonb(v_mentions),
    'title', public.chat_room_title(p_room, v_me), 'sender', public.chat_display_name(v_me), 'kind', v_room.kind,
    'direct_title', public.chat_display_name(v_me));
end $$;

create function public.delete_chat_message(p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_msg public.chat_messages;
begin
  select * into v_msg from public.chat_messages where id = p_message;
  if v_msg.id is null or not public.can_chat(v_msg.room_id) then raise exception 'Message not found.'; end if;
  if v_msg.sender_id <> auth.uid() and not public.is_owner() then raise exception 'You can delete only your own messages.'; end if;
  update public.chat_messages set deleted_at = now(), body = '', kept = false where id = p_message;
end $$;

create function public.keep_chat_message(p_message uuid, p_keep boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_msg public.chat_messages;
begin
  select * into v_msg from public.chat_messages where id = p_message;
  if v_msg.id is null or not public.can_chat(v_msg.room_id) then raise exception 'Message not found.'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'manager')) then raise exception 'Only owners and managers can keep messages.'; end if;
  update public.chat_messages set kept = p_keep, kept_by = case when p_keep then auth.uid() end where id = p_message and deleted_at is null;
end $$;

create function public.set_chat_announcements(p_room uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Only the owners can change this.'; end if;
  update public.chat_rooms set announcements_only = p_on where id = p_room and kind <> 'direct';
end $$;

-- Daily: messages older than 90 days go, unless kept.
create function public.purge_old_chat_messages() returns integer
language sql security definer set search_path = '' as $$
  with gone as (delete from public.chat_messages where created_at < now() - interval '90 days' and not kept returning 1)
  select count(*)::integer from gone
$$;
revoke all on function public.purge_old_chat_messages() from public, anon, authenticated;

revoke all on function public.can_chat(uuid), public.my_chat_rooms(), public.chat_unread_total(), public.open_direct_chat(uuid),
  public.chat_room(uuid, integer), public.mark_chat_read(uuid), public.send_chat_message(uuid, text, uuid[]),
  public.delete_chat_message(uuid), public.keep_chat_message(uuid, boolean), public.set_chat_announcements(uuid, boolean) from public, anon;
grant execute on function public.can_chat(uuid), public.my_chat_rooms(), public.chat_unread_total(), public.open_direct_chat(uuid),
  public.chat_room(uuid, integer), public.mark_chat_read(uuid), public.send_chat_message(uuid, text, uuid[]),
  public.delete_chat_message(uuid), public.keep_chat_message(uuid, boolean), public.set_chat_announcements(uuid, boolean) to authenticated;

-- Notifications: chat mentions go to the 🔔 inbox too.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task', 'broadcast', 'request', 'request_reply', 'approval', 'alert', 'chat', 'mention'));

select public.ensure_chat_rooms();

commit;

do $outer$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('chat-purge', '10 22 * * *', 'select public.purge_old_chat_messages()');
  end if;
end
$outer$;
