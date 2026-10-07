-- Reading a chat also clears that chat's notices (mentions) in the 🔔 inbox.
begin;

create or replace function public.mark_chat_read(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_chat(p_room) then return; end if;
  insert into public.chat_reads(room_id, user_id, last_read_at) values (p_room, auth.uid(), now())
  on conflict (room_id, user_id) do update set last_read_at = now();
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and kind in ('chat', 'mention') and url like '%/' || p_room::text;
end $$;

commit;
