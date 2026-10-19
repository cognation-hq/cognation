-- PULSE: one shared activity among your friends. Five people.
-- Friendships, dating matches, and the 21+ room. tower_posts has no event column.
-- Rollback: drop function if exists public.pulse_mutual_introductions();

drop function if exists public.pulse_mutual_introductions();

create or replace function public.pulse_mutual_introductions()
returns table (profile_id uuid, display_name text, handle text, photo_url text, activity text, acted_at timestamptz)
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
  ),
  friend_pair as (
    select f.created_at as at, 'They became friends.'::text as activity, array[f.user_id, f.friend_user_id] as ids
    from public.friendships f
    join mine a on a.uid = f.user_id
    join mine b on b.uid = f.friend_user_id
    order by f.created_at desc
    limit 1
  ),
  dating as (
    select t.created_at, 'They are now dating.'::text, array[t.user_a, t.user_b]
    from public.direct_threads t
    join mine a on a.uid = t.user_a
    join mine b on b.uid = t.user_b
    where t.kind = 'match'
    order by t.created_at desc
    limit 1
  ),
  room as (
    select max(m.joined_at), 'They are in the 21+ chatroom.'::text,
           (array_agg(m.user_id order by m.joined_at desc))[1:5]
    from public.chat_room_members m
    join public.chat_rooms r on r.id = m.room_id and r.slug = '21-plus'
    join mine on mine.uid = m.user_id
    having count(*) >= 2
  ),
  chosen as (
    select at, activity, ids from (
      select * from friend_pair
      union all select * from dating
      union all select * from room
    ) u
    where at is not null
    order by at desc
    limit 1
  )
  select p.id, p.display_name, p.handle, p.photo_url, c.activity, c.at
  from chosen c
  cross join lateral unnest(c.ids) as uid
  join public.profiles p on p.user_id = uid and p.kind = 'personal'
  limit 5;
$$;

revoke all on function public.pulse_mutual_introductions() from public, anon;
grant execute on function public.pulse_mutual_introductions() to authenticated;
