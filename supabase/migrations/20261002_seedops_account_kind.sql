-- SeedOps: account_kind on profiles + real↛seed friend block in send_friend_request.

create type public.cognation_account_kind as enum ('real', 'seed', 'ops');

alter table public.profiles
  add column if not exists account_kind public.cognation_account_kind not null default 'real';

alter table public.profiles
  add column if not exists seed_fleet_id text;

create index if not exists profiles_account_kind_idx
  on public.profiles (account_kind);

create or replace function public.send_friend_request(recipient_profile_id uuid)
returns public.friend_requests
language plpgsql
security definer set search_path = public
as $$
declare
  recipient public.profiles;
  actor_kind public.cognation_account_kind;
  request public.friend_requests;
  actor_name text;
begin
  select * into recipient from public.profiles
  where id = recipient_profile_id and kind = 'personal';
  if recipient.id is null or recipient.user_id = auth.uid() then
    raise exception 'Invalid recipient';
  end if;

  select coalesce(account_kind, 'real') into actor_kind
  from public.profiles
  where user_id = auth.uid() and kind = 'personal'
  limit 1;
  actor_kind := coalesce(actor_kind, 'real');

  -- real ↔ real and non-real ↔ non-real only
  if (actor_kind = 'real') <> (coalesce(recipient.account_kind, 'real') = 'real') then
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
  values (recipient.user_id, auth.uid(), 'friend_request', actor_name || ' sent you a friend request.', request.id);
  return request;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;
