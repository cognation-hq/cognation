-- User blocks (HH locked). Separate from Report. Quiet — no notice to the blocked person.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Safe to re-run.
-- Needs 20261015_friend_block_real_seed.sql (friendship tables / send_friend_request).
--
-- RULES
--   - Anyone can block anyone (not self).
--   - Blocking undoes friendship both ways and cancels pending friend requests.
--   - Quiet: the blocked person is not notified.
--   - Blocked person cannot: see the blocker's Tower posts, message them,
--     friend them, or (app-enforced) @-mention / comment on their posts.
--   - Each person's content is hidden from the other's SIGNAL/ECHO feeds.
--   - Unblock from the Blocked list only (settings).
--
-- VERIFY AFTER
--   select has_table_privilege('anon','public.user_blocks','select'); -- false
--   select public.block_users_related('00000000-0000-0000-0000-000000000001',
--                                     '00000000-0000-0000-0000-000000000002'); -- false
--
-- ROLLBACK
--   drop function if exists public.list_my_blocks();
--   drop function if exists public.unblock_user(uuid);
--   drop function if exists public.block_user(uuid);
--   drop function if exists public.block_users_related(uuid, uuid);
--   drop table if exists public.user_blocks;
--   Re-apply tower feed policy from 20261016_investigator_review.sql (or earlier).

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_user_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
drop policy if exists "blocker reads own blocks" on public.user_blocks;
create policy "blocker reads own blocks"
on public.user_blocks for select to authenticated
using (blocker_user_id = auth.uid());
-- No direct insert/delete: only through RPCs.

create or replace function public.block_users_related(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_user_id = a and blocked_user_id = b)
       or (blocker_user_id = b and blocked_user_id = a)
  );
$$;
revoke all on function public.block_users_related(uuid, uuid) from public, anon, authenticated;
grant execute on function public.block_users_related(uuid, uuid) to authenticated;

create or replace function public.block_user(target_user_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'cannot_block_self';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'user_not_found';
  end if;

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (auth.uid(), target_user_id)
  on conflict do nothing;

  -- Undo friendship both ways (quiet).
  delete from public.friendships
   where (user_id = auth.uid() and friend_user_id = target_user_id)
      or (user_id = target_user_id and friend_user_id = auth.uid());

  -- Cancel pending requests either direction.
  update public.friend_requests
     set status = 'cancelled', responded_at = coalesce(responded_at, now())
   where status = 'pending'
     and ((sender_user_id = auth.uid() and recipient_user_id = target_user_id)
       or (sender_user_id = target_user_id and recipient_user_id = auth.uid()));

  return true;
end;
$$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from public.user_blocks
   where blocker_user_id = auth.uid() and blocked_user_id = target_user_id;
  return found;
end;
$$;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- Blocked list for settings: people I blocked (handles/names only; no emails).
create or replace function public.list_my_blocks()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', b.blocked_user_id,
           'handle', p.handle,
           'display_name', p.display_name,
           'blocked_at', b.created_at
         ) order by b.created_at desc), '[]'::jsonb)
  from public.user_blocks b
  join public.profiles p on p.user_id = b.blocked_user_id and p.kind = 'personal'
  where b.blocker_user_id = auth.uid();
$$;
revoke all on function public.list_my_blocks() from public, anon;
grant execute on function public.list_my_blocks() to authenticated;

-- Friend RPCs refuse blocked pairs.
create or replace function public.send_friend_request(recipient_profile_id uuid)
returns public.friend_requests
language plpgsql
security definer set search_path = public
as $$
declare
  recipient public.profiles;
  request public.friend_requests;
  actor_name text;
begin
  select * into recipient from public.profiles
  where id = recipient_profile_id and kind = 'personal';
  if recipient.id is null or recipient.user_id = auth.uid() then
    raise exception 'Invalid recipient';
  end if;
  if public.block_users_related(auth.uid(), recipient.user_id) then
    raise exception 'blocked';
  end if;
  if public.cognation_user_is_real(auth.uid()) <> public.cognation_user_is_real(recipient.user_id) then
    raise exception 'real_seed_friend_blocked';
  end if;
  insert into public.friend_requests (sender_user_id, recipient_user_id)
  values (auth.uid(), recipient.user_id)
  on conflict (sender_user_id, recipient_user_id) where status = 'pending'
  do update set created_at = excluded.created_at
  returning * into request;
  select display_name into actor_name from public.profiles
  where user_id = auth.uid() and kind = 'personal';
  insert into public.notifications (recipient_user_id, actor_user_id, type, body, resource_id)
  values (recipient.user_id, auth.uid(), 'friend_request', coalesce(actor_name, 'Member') || ' sent you a friend request.', request.id);
  return request;
end;
$$;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  request public.friend_requests;
  actor_name text;
begin
  select * into request from public.friend_requests
  where id = request_id and recipient_user_id = auth.uid() and status = 'pending'
  for update;
  if request.id is null then raise exception 'Friend request not found'; end if;
  if public.block_users_related(request.sender_user_id, request.recipient_user_id) then
    raise exception 'blocked';
  end if;
  if public.cognation_user_is_real(request.sender_user_id)
     <> public.cognation_user_is_real(request.recipient_user_id) then
    raise exception 'real_seed_friend_blocked';
  end if;
  update public.friend_requests set status = 'accepted', responded_at = now() where id = request.id;
  insert into public.friendships (user_id, friend_user_id)
  values (request.sender_user_id, request.recipient_user_id),
         (request.recipient_user_id, request.sender_user_id)
  on conflict do nothing;
  select display_name into actor_name from public.profiles
  where user_id = auth.uid() and kind = 'personal';
  insert into public.notifications (recipient_user_id, actor_user_id, type, body, resource_id)
  values (request.sender_user_id, auth.uid(), 'friend_request_accepted', actor_name || ' accepted your friend request.', request.id);
end;
$$;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- Tower feed: hide posts across a block (either direction). Author still sees own.
drop policy if exists "tower feed respects rating and age" on public.tower_posts;
create policy "tower feed respects rating and age"
on public.tower_posts for select using (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_posts.author_profile_id
      and profiles.user_id = auth.uid()
  )
  or (
    tower_posts.hidden_at is null
    and public.cognation_viewer_can_see(rating)
    and not public.block_users_related(
          auth.uid(),
          (select profiles.user_id from public.profiles where profiles.id = tower_posts.author_profile_id)
        )
    and (
      visibility = 'public'
      or exists (
        select 1 from public.profiles
        join public.friendships on friendships.friend_user_id = profiles.user_id
        where profiles.id = tower_posts.author_profile_id
          and friendships.user_id = auth.uid()
      )
    )
  )
);

comment on table public.user_blocks is
  'Quiet user blocks. Separate from Report. Undoes friendship. No notice to the blocked person.';
