-- Classrooms as real live rooms (ECHO). NOT auto-run. Alexa runs this herself
-- in the Supabase SQL editor. Safe to re-run.
--
-- Adds chat_rooms.min_age (default 13, so existing rooms are unchanged), adds the
-- three Cognation classrooms as 18+ rooms with no member cap, and re-creates join_chat_room /
-- post_chat_room_message with one extra check: age < min_age -> 'under_18'.
-- Everything else is copied unchanged from 20261016_seed_birth_backfill.sql.
--
-- Needs: 20261015_chat_rooms.sql, 20261016_seed_birth_backfill.sql,
--        20261016_chat_room_members_rls_fix.sql.
--
-- VERIFY AFTER:
--   select slug, min_age from public.chat_rooms where slug like 'class-%';  -- 3 rows, 18
--
-- ROLLBACK: re-run the two functions from 20261016_seed_birth_backfill.sql, then
--   delete from public.chat_rooms where slug like 'class-%';
--   do $$ declare c record; begin
--     for c in select conname from pg_constraint
--       where conrelid = 'public.chat_rooms'::regclass and contype = 'c'
--         and pg_get_constraintdef(oid) ilike '%max_members%'
--     loop execute format('alter table public.chat_rooms drop constraint %I', c.conname); end loop;
--   end $$;
--   alter table public.chat_rooms alter column max_members set not null;
--   alter table public.chat_rooms add constraint chat_rooms_max_members_check check (max_members between 2 and 20);
--   alter table public.chat_rooms drop column if exists min_age;

alter table public.chat_rooms
  add column if not exists min_age int not null default 13
  check (min_age between 13 and 21);

/* Member cap: chatrooms keep their small cap (2–20). Classrooms (min_age >= 18)
   have no cap: max_members is null, and join skips the cap check. */
alter table public.chat_rooms alter column max_members drop not null;
/* Drop any existing max_members check by lookup (name-independent, idempotent). */
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.chat_rooms'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%max_members%'
  loop
    execute format('alter table public.chat_rooms drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.chat_rooms add constraint chat_rooms_max_members_check
  check ((max_members is not null and max_members between 2 and 20) or (max_members is null and min_age >= 18));

insert into public.chat_rooms (id, slug, title, topic, body, rating, max_members, min_age) values
  ('a2000000-0000-4000-8000-000000000001', 'class-insurance', 'Insurance basics', 'insurance', 'Cognation Classroom — life skills at a human pace.', 'PG-13', null, 18),
  ('a2000000-0000-4000-8000-000000000002', 'class-voting', 'Voting & civic basics', 'voting', 'Cognation Classroom — life skills at a human pace.', 'PG-13', null, 18),
  ('a2000000-0000-4000-8000-000000000003', 'class-business', 'Starting a small business', 'business', 'Cognation Classroom — life skills at a human pace.', 'PG-13', null, 18)
on conflict (id) do update set min_age = excluded.min_age, title = excluded.title, max_members = excluded.max_members;

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
  if age is null then raise exception 'no_birth'; end if;
  if age < 13 then raise exception 'under_13'; end if;

  select * into room from public.chat_rooms where id = p_room_id;
  if room.id is null then raise exception 'room_not_found'; end if;
  if not public.cognation_viewer_can_see(room.rating) then
    raise exception 'rating_blocked';
  end if;
  if age < room.min_age then raise exception 'under_18'; end if;
  if room.created_by is not null
     and public.block_users_related(auth.uid(), room.created_by) then
    raise exception 'blocked';
  end if;

  select count(*)::int into members from public.chat_room_members where room_id = room.id;
  if room.max_members is not null
     and members >= room.max_members
     and not exists (
       select 1 from public.chat_room_members
       where room_id = room.id and user_id = auth.uid()
     ) then
    raise exception 'room_full:%', room.max_members;
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
  if age is null then raise exception 'no_birth'; end if;
  if age < 13 then raise exception 'under_13'; end if;

  cleaned := trim(both from coalesce(p_body, ''));
  if char_length(cleaned) < 1 or char_length(cleaned) > 500 then
    raise exception 'bad_body';
  end if;

  select * into room from public.chat_rooms where id = p_room_id;
  if room.id is null then raise exception 'room_not_found'; end if;
  if not public.cognation_viewer_can_see(room.rating) then
    raise exception 'rating_blocked';
  end if;
  if age < room.min_age then raise exception 'under_18'; end if;
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

comment on function public.join_chat_room(uuid) is
  'Join a chat room. no_birth if user_birth missing; under_13 if age < 13; else cap/rating/blocks.';
