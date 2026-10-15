-- Friend-to-friend links among the viewer's own friends (for PULSE lines).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor AFTER
-- 20261015_friend_block_real_seed.sql (uses cognation_user_is_real). Safe to re-run.
--
-- Returns one row per pair (a, b) where a and b are BOTH the viewer's friends and
-- are friends with each other. Personal profile ids only: no user ids, no emails,
-- no names. Seeds/ops never appear (and a seed viewer gets nothing).
-- The viewer is always auth.uid(); there is no parameter to ask about someone else.
--
-- VERIFY AFTER
--   select has_function_privilege('anon', 'public.my_friend_links()', 'execute');            -- false
--   select has_function_privilege('authenticated', 'public.my_friend_links()', 'execute');   -- true
--   select prosecdef, proconfig from pg_proc where proname = 'my_friend_links';              -- t, {search_path=public}
--
-- ROLLBACK
--   drop function if exists public.my_friend_links();

create or replace function public.my_friend_links()
returns table (a_profile_id uuid, b_profile_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
    where auth.uid() is not null and public.cognation_user_is_real(auth.uid())
  ),
  mine as (
    select f.friend_user_id as uid
    from public.friendships f, me
    where f.user_id = me.uid
      and public.cognation_user_is_real(f.friend_user_id)
  )
  select pa.id, pb.id
  from public.friendships ff
  join mine a on a.uid = ff.user_id
  join mine b on b.uid = ff.friend_user_id
  join public.profiles pa on pa.user_id = ff.user_id and pa.kind = 'personal'
  join public.profiles pb on pb.user_id = ff.friend_user_id and pb.kind = 'personal'
  where ff.user_id < ff.friend_user_id
  order by 1, 2
  limit 5000;
$$;

revoke all on function public.my_friend_links() from public, anon;
grant execute on function public.my_friend_links() to authenticated;
