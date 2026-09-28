-- Phase 1 shared owner notes. Local migration only until explicitly deployed.
begin;

create table if not exists public.owner_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  content text not null default '' check (char_length(content) <= 4000),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  converted_task_id uuid references public.tasks(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_notes_archived_updated_idx
  on public.owner_notes (archived_at, updated_at desc);

drop trigger if exists set_owner_notes_updated_at on public.owner_notes;
create trigger set_owner_notes_updated_at
  before update on public.owner_notes
  for each row execute function public.set_updated_at();

alter table public.owner_notes enable row level security;
revoke all on public.owner_notes from anon, authenticated;
grant select, insert, update on public.owner_notes to authenticated;

drop policy if exists owner_notes_active_required on public.owner_notes;
create policy owner_notes_active_required
on public.owner_notes as restrictive for all to authenticated
using (public.is_active_user())
with check (public.is_active_user());

drop policy if exists owner_notes_owner_select on public.owner_notes;
create policy owner_notes_owner_select
on public.owner_notes for select to authenticated
using (public.is_owner());

drop policy if exists owner_notes_owner_insert on public.owner_notes;
create policy owner_notes_owner_insert
on public.owner_notes for insert to authenticated
with check (public.is_owner() and created_by = auth.uid());

drop policy if exists owner_notes_owner_update on public.owner_notes;
create policy owner_notes_owner_update
on public.owner_notes for update to authenticated
using (public.is_owner())
with check (public.is_owner());

create or replace function public.convert_owner_note_to_task(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.owner_notes%rowtype;
  v_task_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Owner access required';
  end if;

  select * into v_note
  from public.owner_notes
  where id = p_note_id
  for update;

  if not found then
    raise exception 'Owner note not found';
  end if;

  if v_note.converted_task_id is not null then
    return v_note.converted_task_id;
  end if;

  insert into public.tasks (
    assigned_to, carry_forward, category, created_by, description,
    due_date, is_private, priority, source, status, title
  ) values (
    auth.uid(), true, 'owner-note', auth.uid(),
    coalesce(nullif(v_note.content, ''), 'Created from a shared owner note.'),
    (now() at time zone 'Asia/Kolkata')::date,
    true, 'normal', 'manual', 'pending', v_note.title
  ) returning id into v_task_id;

  update public.owner_notes
  set converted_task_id = v_task_id, updated_by = auth.uid()
  where id = v_note.id;

  return v_task_id;
end;
$$;

revoke all on function public.convert_owner_note_to_task(uuid) from public, anon;
grant execute on function public.convert_owner_note_to_task(uuid) to authenticated;

-- Existing Secretary conversations and memories remain private to the owner
-- account that created them. Shared business notes use owner_notes instead.
drop policy if exists "ai_chats_owner_all" on public.ai_chats;
drop policy if exists "ai_chats_user_select_own" on public.ai_chats;
drop policy if exists "ai_chats_user_insert_own" on public.ai_chats;
create policy ai_chats_owner_select_own
on public.ai_chats for select to authenticated
using (public.is_owner() and user_id = auth.uid());
create policy ai_chats_owner_insert_own
on public.ai_chats for insert to authenticated
with check (public.is_owner() and user_id = auth.uid());

drop policy if exists "ai_memories_owner_all" on public.ai_memories;
drop policy if exists "ai_memories_user_select_own" on public.ai_memories;
drop policy if exists "ai_memories_user_insert_own" on public.ai_memories;
drop policy if exists "ai_memories_user_update_own" on public.ai_memories;
create policy ai_memories_owner_select_own
on public.ai_memories for select to authenticated
using (public.is_owner() and user_id = auth.uid());
create policy ai_memories_owner_insert_own
on public.ai_memories for insert to authenticated
with check (public.is_owner() and user_id = auth.uid());
create policy ai_memories_owner_update_own
on public.ai_memories for update to authenticated
using (public.is_owner() and user_id = auth.uid())
with check (public.is_owner() and user_id = auth.uid());

commit;
