-- Friend block fails closed: an account with NO personal profile is NOT real.
-- NOT auto-run. Run AFTER 20261015_friend_block_real_seed.sql. Safe to re-run.
--
-- WHY  cognation_user_is_real() defaulted a missing personal profile to real, and
--      send_friend_request defaulted a missing actor kind to 'real'. A seed or ops
--      account without a personal profile could therefore friend real users.
-- NOW  real only when a personal profile exists AND account_kind = 'real'.
--      Every signup creates a personal profile (create_profile_for_new_user), so
--      real users are unaffected; anything without one is treated as non-real.
--
-- VERIFY AFTER (the last statement prints this count)
--   users_without_personal_profile = auth users that are now treated as non-real.
--   select public.cognation_user_is_real('00000000-0000-0000-0000-000000000000'); -- false
--
-- ROLLBACK
--   Re-run the cognation_user_is_real definition from 20261015_friend_block_real_seed.sql
--   and send_friend_request from 20261002_seedops_account_kind.sql.

create or replace function public.cognation_user_is_real(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.account_kind = 'real' from public.profiles p
      where p.user_id = uid and p.kind = 'personal' limit 1),
    false);
$$;
revoke all on function public.cognation_user_is_real(uuid) from public, anon, authenticated;

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

  -- real <-> real and non-real <-> non-real only; no personal profile = non-real
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

-- Count (read-only): accounts that are now treated as non-real.
select count(*) as users_without_personal_profile
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id and p.kind = 'personal');
