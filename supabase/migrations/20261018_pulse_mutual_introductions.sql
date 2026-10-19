-- PULSE introductions: real people who share a friend with you and are not
-- your friend yet. Friendships only. Personal profiles. Alexa runs this in the
-- SQL editor. Rollback: drop function if exists public.pulse_mutual_introductions();

drop function if exists public.pulse_mutual_introductions();

create or replace function public.pulse_mutual_introductions()
returns table (profile_id uuid, display_name text, mutual_name text, handle text, photo_url text)
language sql stable security definer set search_path = public
as $$
  with me as (
    select auth.uid() as uid
    where auth.uid() is not null and public.cognation_user_is_real(auth.uid())
  ),
  mine as (
    select f.friend_user_id as uid
    from public.friendships f
    join me on f.user_id = me.uid
    where public.cognation_user_is_real(f.friend_user_id)
  )
  select p.id, p.display_name, m.display_name, p.handle, p.photo_url
  from (
    select ff.friend_user_id as uid, min(ff.user_id::text) as via
    from public.friendships ff
    join mine on mine.uid = ff.user_id
    join me on ff.friend_user_id <> me.uid
    where public.cognation_user_is_real(ff.friend_user_id)
      and not exists (
        select 1 from public.friendships already
        where already.user_id = me.uid and already.friend_user_id = ff.friend_user_id
      )
    group by ff.friend_user_id
    order by 1
    limit 5
  ) c
  join public.profiles p on p.user_id = c.uid and p.kind = 'personal'
  join public.profiles m on m.user_id = c.via::uuid and m.kind = 'personal';
$$;

revoke all on function public.pulse_mutual_introductions() from public, anon;
grant execute on function public.pulse_mutual_introductions() to authenticated;
