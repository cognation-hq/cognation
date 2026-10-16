-- Direct messages (Tower DMs) — real, saved server-side, seen by the other person.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Safe to re-run.
-- Needs: 20261016_user_blocks.sql (block_users_related),
--        20261015_friend_block_real_seed.sql (cognation_user_is_real),
--        20261015_tower_auto_rate.sql (cognation_auto_rate, cognation_viewer_can_see),
--        20261015_user_birth_year_month.sql (cognation_user_age).
--
-- RULES
--   - One thread per pair of people (user_a < user_b). Only the two people can read it.
--   - No recursive RLS: thread policy compares columns to auth.uid() only; message
--     policy goes through the SECURITY DEFINER helper is_direct_thread_member().
--   - Blocks: a blocked pair cannot open a thread or send, and cannot read each
--     other's messages while the block stands (quiet, same as user_blocks).
--   - Real and seed accounts cannot DM each other (same rule as friends).
--   - 13+: null or under-13 age fails closed (same as chat rooms).
--   - Rating: each message is auto-rated (cognation_auto_rate); readers only see
--     ratings cognation_viewer_can_see allows. Harmful text is refused.
--   - No direct insert/update/delete from the app; only through the RPCs below.
--
-- VERIFY AFTER
--   select has_table_privilege('anon','public.direct_messages','select'); -- false
--   select count(*) from public.direct_threads; -- runs (as owner)
--
-- ROLLBACK
--   drop function if exists public.list_my_direct_threads();
--   drop function if exists public.send_direct_message(uuid, text);
--   drop function if exists public.open_direct_thread(uuid, text);
--   drop function if exists public.is_direct_thread_member(uuid);
--   drop table if exists public.direct_messages;
--   drop table if exists public.direct_threads;

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'dm' check (kind in ('dm','match')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists direct_threads_b_idx on public.direct_threads (user_b);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete cascade, -- null = Cognation system line
  body text not null check (char_length(body) between 1 and 2000),
  kind text not null default 'friend' check (kind in ('friend','match')),
  event_line text check (event_line is null or char_length(event_line) <= 200),
  rating text not null default 'PG-13' check (rating in ('G','PG','PG-13','R','MA','NR')),
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_thread_idx on public.direct_messages (thread_id, created_at);

alter table public.direct_threads enable row level security;
alter table public.direct_messages enable row level security;
revoke all on public.direct_threads from anon, authenticated;
revoke all on public.direct_messages from anon, authenticated;
grant select on public.direct_threads to authenticated;
grant select on public.direct_messages to authenticated;

-- Membership helper (SECURITY DEFINER, checks only the caller). Keeps the
-- message policy from re-entering RLS on direct_threads.
create or replace function public.is_direct_thread_member(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.direct_threads t
    where t.id = p_thread_id
      and (t.user_a = auth.uid() or t.user_b = auth.uid())
      and not public.block_users_related(t.user_a, t.user_b)
  );
$$;
revoke all on function public.is_direct_thread_member(uuid) from public, anon;
grant execute on function public.is_direct_thread_member(uuid) to authenticated;

drop policy if exists "direct threads readable to the two people" on public.direct_threads;
create policy "direct threads readable to the two people"
on public.direct_threads for select to authenticated
using (
  (user_a = auth.uid() or user_b = auth.uid())
  and not public.block_users_related(user_a, user_b)
);

drop policy if exists "direct messages readable to thread members" on public.direct_messages;
create policy "direct messages readable to thread members"
on public.direct_messages for select to authenticated
using (
  public.is_direct_thread_member(thread_id)
  and public.cognation_viewer_can_see(rating)
);

-- Open (or find) the thread with another person by their profile id.
create or replace function public.open_direct_thread(p_peer_profile_id uuid, p_kind text default 'dm')
returns public.direct_threads
language plpgsql
security definer set search_path = public
as $$
declare
  peer uuid;
  a uuid;
  b uuid;
  age int;
  t public.direct_threads;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  age := public.cognation_user_age(auth.uid());
  if age is null or age < 13 then raise exception 'under_13'; end if;
  select user_id into peer from public.profiles where id = p_peer_profile_id limit 1;
  if peer is null then raise exception 'peer_not_found'; end if;
  if peer = auth.uid() then raise exception 'cannot_message_self'; end if;
  age := public.cognation_user_age(peer);
  if age is null or age < 13 then raise exception 'peer_unavailable'; end if;
  if public.block_users_related(auth.uid(), peer) then raise exception 'blocked'; end if;
  if public.cognation_user_is_real(auth.uid()) <> public.cognation_user_is_real(peer) then
    raise exception 'real_seed_blocked';
  end if;
  a := least(auth.uid(), peer);
  b := greatest(auth.uid(), peer);
  insert into public.direct_threads (user_a, user_b, kind)
  values (a, b, case when p_kind = 'match' then 'match' else 'dm' end)
  on conflict (user_a, user_b) do update
    set kind = case when excluded.kind = 'match' then 'match' else direct_threads.kind end
  returning * into t;
  return t;
end;
$$;
revoke all on function public.open_direct_thread(uuid, text) from public, anon;
grant execute on function public.open_direct_thread(uuid, text) to authenticated;

create or replace function public.send_direct_message(p_thread_id uuid, p_body text)
returns public.direct_messages
language plpgsql
security definer set search_path = public
as $$
declare
  t public.direct_threads;
  peer uuid;
  cleaned text;
  age int;
  r record;
  msg public.direct_messages;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  age := public.cognation_user_age(auth.uid());
  if age is null or age < 13 then raise exception 'under_13'; end if;
  cleaned := trim(both from coalesce(p_body, ''));
  if char_length(cleaned) < 1 or char_length(cleaned) > 2000 then raise exception 'bad_body'; end if;
  select * into t from public.direct_threads where id = p_thread_id;
  if t.id is null or (t.user_a <> auth.uid() and t.user_b <> auth.uid()) then
    raise exception 'thread_not_found';
  end if;
  peer := case when t.user_a = auth.uid() then t.user_b else t.user_a end;
  if public.block_users_related(auth.uid(), peer) then raise exception 'blocked'; end if;
  if public.cognation_user_is_real(auth.uid()) <> public.cognation_user_is_real(peer) then
    raise exception 'real_seed_blocked';
  end if;
  select * into r from public.cognation_auto_rate(cleaned, '[]'::jsonb);
  if coalesce(r.harmful, false) then raise exception 'harmful'; end if;
  insert into public.direct_messages (thread_id, sender_user_id, body, rating)
  values (t.id, auth.uid(), cleaned, coalesce(r.rating, 'PG-13'))
  returning * into msg;
  update public.direct_threads set last_message_at = msg.created_at where id = t.id;
  return msg;
end;
$$;
revoke all on function public.send_direct_message(uuid, text) from public, anon;
grant execute on function public.send_direct_message(uuid, text) to authenticated;

-- My threads with the other person's profile id and display name (no emails).
create or replace function public.list_my_direct_threads()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'kind', t.kind,
           'peer_user_id', o.peer,
           'peer_profile_id', p.id,
           'peer_name', coalesce(p.display_name, p.handle, 'Member'),
           'last_message_at', t.last_message_at,
           'created_at', t.created_at
         ) order by coalesce(t.last_message_at, t.created_at) desc), '[]'::jsonb)
  from public.direct_threads t
  cross join lateral (select case when t.user_a = auth.uid() then t.user_b else t.user_a end as peer) o
  left join public.profiles p on p.user_id = o.peer and p.kind = 'personal'
  where (t.user_a = auth.uid() or t.user_b = auth.uid())
    and not public.block_users_related(t.user_a, t.user_b);
$$;
revoke all on function public.list_my_direct_threads() from public, anon;
grant execute on function public.list_my_direct_threads() to authenticated;

comment on table public.direct_threads is
  'One DM thread per pair. Opened via open_direct_thread (13+, blocks, real/seed).';
comment on table public.direct_messages is
  'DM messages. Sent via send_direct_message (auto-rated); reads respect blocks and rating.';
