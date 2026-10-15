-- Chat rooms (ECHO group chat) — schema only. No UI wiring in this PR (that is 2b).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor.
-- Safe to re-run (idempotent).
--
-- Needs (already on main / prior migrations):
--   auth.users, public.profiles, public.user_birth, public.cognation_user_age,
--   public.cognation_viewer_can_see, public.user_blocks, public.block_users_related
--
-- WHAT
--   public.chat_rooms            — room catalog (title, topic, content rating, small cap)
--   public.chat_room_members     — who is in a room (cap enforced on join)
--   public.chat_room_messages    — messages in a room
--
-- RULES
--   - 13+: join / read / write require cognation_user_age IS NOT NULL AND >= 13. Null age fails closed (no birth year/month yet → not 13+; matches G/PG-only until age set).
--   - Rating: room + message rows carry G|PG|PG-13|R|MA|NR; reads use cognation_viewer_can_see.
--   - Blocks: messages from anyone related via user_blocks are hidden; you cannot join a room
--     whose creator you are blocked with (when created_by is set).
--   - Small cap: chat_rooms.max_members default 12 (check 2..20). join_chat_room refuses when full.
--   - Seeds never DM: this migration is rooms only; 1:1 DMs stay out of scope.
--   - Demo badge / Enter-card wiring = PR 2b (not here).
--
-- VERIFY AFTER (SQL editor)
--   select to_regclass('public.chat_rooms');
--   select to_regclass('public.chat_room_members');
--   select to_regclass('public.chat_room_messages');
--   select relrowsecurity from pg_class where oid = 'public.chat_rooms'::regclass;          -- true
--   select max_members from public.chat_rooms where slug = 'tech-ai';                       -- 12
--   -- as authenticated under 13 or anon: join should fail (run with a test user)
--
-- ROLLBACK
--   drop function if exists public.leave_chat_room(uuid);
--   drop function if exists public.join_chat_room(uuid);
--   drop function if exists public.post_chat_room_message(uuid, text);
--   drop table if exists public.chat_room_messages;
--   drop table if exists public.chat_room_members;
--   drop table if exists public.chat_rooms;

-- 1. Tables --------------------------------------------------------------------
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null check (char_length(title) between 1 and 80),
  topic text not null default '' check (char_length(topic) <= 120),
  body text not null default 'Cognation hosts this room.' check (char_length(body) <= 280),
  /* Content rating for the room as a whole (under-13 sees G/PG only via viewer_can_see). */
  rating text not null default 'PG-13'
    check (rating in ('G','PG','PG-13','R','MA','NR')),
  max_members int not null default 12 check (max_members between 2 and 20),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists chat_room_members_user_idx
  on public.chat_room_members (user_id);

create table if not exists public.chat_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_profile_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  rating text not null default 'PG-13'
    check (rating in ('G','PG','PG-13','R','MA','NR')),
  created_at timestamptz not null default now()
);
create index if not exists chat_room_messages_room_created_idx
  on public.chat_room_messages (room_id, created_at);

-- 2. RLS -----------------------------------------------------------------------
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_room_messages enable row level security;

revoke all on public.chat_rooms from anon, authenticated;
revoke all on public.chat_room_members from anon, authenticated;
revoke all on public.chat_room_messages from anon, authenticated;

grant select on public.chat_rooms to authenticated;
grant select on public.chat_room_members to authenticated;
grant select on public.chat_room_messages to authenticated;
/* Writes go through RPCs (security definer). */

drop policy if exists "chat rooms readable to 13+ when rating allows" on public.chat_rooms;
create policy "chat rooms readable to 13+ when rating allows"
on public.chat_rooms for select to authenticated
using (
  public.cognation_user_age(auth.uid()) is not null
  and public.cognation_user_age(auth.uid()) >= 13
  and public.cognation_viewer_can_see(rating)
);

drop policy if exists "chat room members readable to fellow members" on public.chat_room_members;
create policy "chat room members readable to fellow members"
on public.chat_room_members for select to authenticated
using (
  exists (
    select 1 from public.chat_room_members me
    where me.room_id = chat_room_members.room_id
      and me.user_id = auth.uid()
  )
);

drop policy if exists "chat room messages readable to members" on public.chat_room_messages;
create policy "chat room messages readable to members"
on public.chat_room_messages for select to authenticated
using (
  exists (
    select 1 from public.chat_room_members me
    where me.room_id = chat_room_messages.room_id
      and me.user_id = auth.uid()
  )
  and public.cognation_viewer_can_see(rating)
  and not public.block_users_related(auth.uid(), author_user_id)
);

-- 3. Join / leave / post (cap + age + rating + blocks) --------------------------
create or replace function public.join_chat_room(p_room_id uuid)
returns public.chat_room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.chat_rooms;
  members int;
  row public.chat_room_members;
  age int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  age := public.cognation_user_age(auth.uid());
  if age is null or age < 13 then raise exception 'under_13'; end if;

  select * into room from public.chat_rooms where id = p_room_id;
  if room.id is null then raise exception 'room_not_found'; end if;
  if not public.cognation_viewer_can_see(room.rating) then
    raise exception 'rating_blocked';
  end if;
  if room.created_by is not null
     and public.block_users_related(auth.uid(), room.created_by) then
    raise exception 'blocked';
  end if;

  select count(*)::int into members from public.chat_room_members where room_id = room.id;
  if members >= room.max_members
     and not exists (
       select 1 from public.chat_room_members
       where room_id = room.id and user_id = auth.uid()
     ) then
    raise exception 'room_full';
  end if;

  insert into public.chat_room_members (room_id, user_id)
  values (room.id, auth.uid())
  on conflict (room_id, user_id) do update set joined_at = chat_room_members.joined_at
  returning * into row;
  return row;
end;
$$;
revoke all on function public.join_chat_room(uuid) from public, anon;
grant execute on function public.join_chat_room(uuid) to authenticated;

create or replace function public.leave_chat_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from public.chat_room_members
   where room_id = p_room_id and user_id = auth.uid();
  return true;
end;
$$;
revoke all on function public.leave_chat_room(uuid) from public, anon;
grant execute on function public.leave_chat_room(uuid) to authenticated;

create or replace function public.post_chat_room_message(p_room_id uuid, p_body text)
returns public.chat_room_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.chat_rooms;
  msg public.chat_room_messages;
  cleaned text;
  age int;
  profile_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  age := public.cognation_user_age(auth.uid());
  if age is null or age < 13 then raise exception 'under_13'; end if;

  cleaned := trim(both from coalesce(p_body, ''));
  if char_length(cleaned) < 1 or char_length(cleaned) > 500 then
    raise exception 'bad_body';
  end if;

  select * into room from public.chat_rooms where id = p_room_id;
  if room.id is null then raise exception 'room_not_found'; end if;
  if not public.cognation_viewer_can_see(room.rating) then
    raise exception 'rating_blocked';
  end if;
  if not exists (
    select 1 from public.chat_room_members
    where room_id = room.id and user_id = auth.uid()
  ) then
    raise exception 'not_a_member';
  end if;

  select id into profile_id from public.profiles
   where user_id = auth.uid() and kind = 'personal'
   limit 1;

  insert into public.chat_room_messages (room_id, author_user_id, author_profile_id, body, rating)
  values (room.id, auth.uid(), profile_id, cleaned, room.rating)
  returning * into msg;
  return msg;
end;
$$;
revoke all on function public.post_chat_room_message(uuid, text) from public, anon;
grant execute on function public.post_chat_room_message(uuid, text) to authenticated;

-- 4. Catalog seed (matches today’s SITE_ROOMS titles; ids are stable UUIDv5-ish fixed) -
-- Fixed UUIDs so re-runs and later UI wiring can rely on them.
insert into public.chat_rooms (id, slug, title, topic, rating, max_members) values
  ('a1000000-0000-4000-8000-000000000001', '18-21', '18–21', '18–21', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000002', 'highschool', 'Highschool', 'highschool', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000003', 'moms', 'Moms', 'moms', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000004', 'tech-ai', 'Tech/AI', 'tech/ai', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000005', 'speed-dating', 'Speed dating', 'speed dating', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000006', '21-plus', '21+', '21+', 'R', 12),
  ('a1000000-0000-4000-8000-000000000007', 'disability-help', 'Disability help', 'disability help', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000008', 'mental-health', 'Mental health', 'mental health', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000009', 'military', 'Military', 'military', 'PG-13', 12),
  ('a1000000-0000-4000-8000-00000000000a', 'lgbtq', 'LGBTQ', 'lgbtq', 'PG-13', 12),
  ('a1000000-0000-4000-8000-00000000000b', 'public-policy', 'Public policy', 'public policy', 'PG-13', 12),
  ('a1000000-0000-4000-8000-00000000000c', 'gamers', 'Gamers', 'gamers', 'PG-13', 12),
  ('a1000000-0000-4000-8000-00000000000d', 'jobs', 'Jobs', 'jobs', 'PG-13', 12),
  ('a1000000-0000-4000-8000-00000000000e', 'garage-sale', 'Garage sale', 'garage sale', 'PG-13', 12),
  ('a1000000-0000-4000-8000-00000000000f', 'reality-shows', 'Reality shows', 'reality shows', 'PG-13', 12),
  ('a1000000-0000-4000-8000-000000000010', 'insurance', 'Insurance', 'insurance', 'PG-13', 12)
on conflict (slug) do nothing;

comment on table public.chat_rooms is
  'ECHO group chat rooms. Small cap (max_members). UI join wiring is PR 2b.';
comment on table public.chat_room_members is
  'Membership for chat_rooms. Join via join_chat_room (enforces cap, 13+, rating, blocks).';
comment on table public.chat_room_messages is
  'Room messages. Reads hide blocked authors and respect content rating.';
