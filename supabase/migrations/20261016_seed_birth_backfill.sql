-- Seed birth year/month backfill + chat join no_birth (2026-10-15).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor.
-- Run after: 20261015_user_birth_year_month.sql, 20261015_chat_rooms.sql,
--            20261002_seedops_account_kind.sql (or friend_block_real_seed for is_real).
-- Safe to re-run. Seed rows only — never touches real users.
--
-- WHAT
--   1) Insert public.user_birth for each personal seed profile that has none yet.
--      Ages are every integer 13..26 (inclusive), assigned from seed_fleet_id
--      number: age = 13 + ((nnn - 1) % 14). birth_month = 1 so Oct 2026 age is exact.
--      Skips seed-0248 (Sage, under-13 test viewer) and any other under-13 fleet
--      ids listed below — those stay untouched here; removal is a separate SQL file.
--      No profile age column exists in Postgres (client ages live in localStorage /
--      auth metadata only), so this uses the deterministic fleet map above.
--   2) Dating intent (client applies flags): seeds aged 18–26 get dating on for
--      most fleet ids (nnn % 5 <> 0); 13–17 stay off. Matching is seed↔seed only
--      in JS (viewerCanSeeDating). This migration does not invent dating columns.
--   3) create or replace join_chat_room + post_chat_room_message: null age →
--      exception 'no_birth' (prompt to add birth); age < 13 → 'under_13'. Fail-closed.
--
-- VERIFY AFTER
--   select count(*) from public.user_birth b
--     join public.profiles p on p.user_id = b.user_id and p.kind = 'personal'
--    where p.account_kind = 'seed';  -- one row per backfilled seed
--   select public.cognation_user_age(
--     (select user_id from public.profiles where seed_fleet_id = 'seed-0001' limit 1));
--     -- 13
--
-- ROLLBACK
--   delete from public.user_birth b using public.profiles p
--    where b.user_id = p.user_id and p.kind = 'personal' and p.account_kind = 'seed'
--      and p.seed_fleet_id is not null;
--   -- then re-run 20261015_chat_rooms.sql join/post function bodies if needed.

-- 1) Backfill -----------------------------------------------------------------
insert into public.user_birth (user_id, birth_year, birth_month)
select
  p.user_id,
  (extract(year from current_date)::int
    - (13 + ((substring(p.seed_fleet_id from 6)::int - 1) % 14)))::smallint
    as birth_year,
  1::smallint as birth_month
from public.profiles p
where p.kind = 'personal'
  and p.account_kind = 'seed'
  and p.user_id is not null
  and p.seed_fleet_id ~ '^seed-[0-9]{4}$'
  and p.seed_fleet_id <> 'seed-0248'
  and not exists (
    select 1 from public.user_birth b where b.user_id = p.user_id
  )
on conflict (user_id) do nothing;

-- 2) Join / post: distinct no_birth vs under_13 --------------------------------
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
