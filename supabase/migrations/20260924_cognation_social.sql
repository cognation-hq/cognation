-- Cognation multi-user social foundation.
-- Run this migration in Supabase SQL Editor before enabling the browser client.

create type public.cognation_profile_kind as enum ('personal', 'professional');
create type public.cognation_request_status as enum ('pending', 'accepted', 'declined', 'cancelled');
create type public.cognation_post_visibility as enum ('friends', 'public');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.cognation_profile_kind not null default 'personal',
  handle text not null unique check (handle ~ '^[a-z0-9_-]{3,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

create table public.follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, profile_id)
);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status public.cognation_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_user_id <> recipient_user_id)
);

create unique index friend_requests_one_pending_per_pair
  on public.friend_requests (sender_user_id, recipient_user_id)
  where status = 'pending';

-- One row in each direction makes friend feed policies inexpensive.
create table public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('friend_request', 'friend_request_accepted', 'professional_follow')),
  body text not null,
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tower_posts (
  id uuid primary key default gen_random_uuid(),
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  visibility public.cognation_post_visibility not null default 'friends',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tower_posts_feed_idx on public.tower_posts (created_at desc);
create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc);

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_updated_at();

create trigger tower_posts_touch_updated_at
before update on public.tower_posts
for each row execute procedure public.touch_updated_at();

-- Auth signup creates the owner’s personal Tower profile.
create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  supplied_handle text := lower(coalesce(new.raw_user_meta_data ->> 'handle', ''));
  -- Never derive a name from the email (see 20261007_profiles_hide_email.sql).
  supplied_name text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Member');
begin
  supplied_handle := regexp_replace(supplied_handle, '[^a-z0-9_-]', '', 'g');
  if char_length(supplied_handle) < 3 then
    supplied_handle := 'member_' || replace(left(new.id::text, 8), '-', '');
  end if;
  if supplied_handle !~ '^[a-z0-9_-]{3,40}$' then
    raise exception 'A valid handle is required';
  end if;
  insert into public.profiles (user_id, kind, handle, display_name)
  values (new.id, 'personal', supplied_handle, left(supplied_name, 80));
  return new;
end;
$$;

create trigger create_profile_after_auth_signup
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.tower_posts enable row level security;

create policy "profiles are readable"
on public.profiles for select using (true);
create policy "users update their own profiles"
on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users create their professional profile"
on public.profiles for insert with check (user_id = auth.uid() and kind = 'professional');

create policy "follows are readable"
on public.follows for select using (true);
create policy "users manage their own follows"
on public.follows for all using (follower_user_id = auth.uid()) with check (follower_user_id = auth.uid());

create policy "users see their requests"
on public.friend_requests for select using (sender_user_id = auth.uid() or recipient_user_id = auth.uid());
create policy "users send requests"
on public.friend_requests for insert with check (sender_user_id = auth.uid());

create policy "users see their friendships"
on public.friendships for select using (user_id = auth.uid() or friend_user_id = auth.uid());

create policy "users see their notifications"
on public.notifications for select using (recipient_user_id = auth.uid());
create policy "users mark their notifications read"
on public.notifications for update using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

create policy "tower authors create their own posts"
on public.tower_posts for insert with check (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_posts.author_profile_id
      and profiles.user_id = auth.uid()
  )
);
create policy "tower authors manage their own posts"
on public.tower_posts for update using (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_posts.author_profile_id
      and profiles.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_posts.author_profile_id
      and profiles.user_id = auth.uid()
  )
);
create policy "tower feed is visible to author, friends, and public"
on public.tower_posts for select using (
  visibility = 'public'
  or exists (
    select 1 from public.profiles
    where profiles.id = tower_posts.author_profile_id
      and profiles.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles
    join public.friendships on friendships.friend_user_id = profiles.user_id
    where profiles.id = tower_posts.author_profile_id
      and friendships.user_id = auth.uid()
  )
);

create function public.send_friend_request(recipient_profile_id uuid)
returns public.friend_requests
language plpgsql
security definer set search_path = public
as $$
declare
  recipient_id uuid;
  request public.friend_requests;
  actor_name text;
begin
  select user_id into recipient_id from public.profiles
  where id = recipient_profile_id and kind = 'personal';
  if recipient_id is null or recipient_id = auth.uid() then
    raise exception 'Invalid recipient';
  end if;
  insert into public.friend_requests (sender_user_id, recipient_user_id)
  values (auth.uid(), recipient_id)
  on conflict (sender_user_id, recipient_user_id) where status = 'pending'
  do update set created_at = excluded.created_at
  returning * into request;
  select display_name into actor_name from public.profiles
  where user_id = auth.uid() and kind = 'personal';
  insert into public.notifications (recipient_user_id, actor_user_id, type, body, resource_id)
  values (recipient_id, auth.uid(), 'friend_request', actor_name || ' sent you a friend request.', request.id);
  return request;
end;
$$;

create function public.accept_friend_request(request_id uuid)
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

create function public.toggle_profile_follow(target_profile_id uuid)
returns table (following boolean, follower_count bigint)
language plpgsql
security definer set search_path = public
as $$
declare
  target_owner uuid;
  actor_name text;
begin
  select user_id into target_owner from public.profiles where id = target_profile_id;
  if target_owner is null or target_owner = auth.uid() then raise exception 'Invalid profile'; end if;
  if exists (select 1 from public.follows where follower_user_id = auth.uid() and profile_id = target_profile_id) then
    delete from public.follows where follower_user_id = auth.uid() and profile_id = target_profile_id;
    following := false;
  else
    insert into public.follows (follower_user_id, profile_id) values (auth.uid(), target_profile_id);
    select display_name into actor_name from public.profiles where user_id = auth.uid() and kind = 'personal';
    insert into public.notifications (recipient_user_id, actor_user_id, type, body, resource_id)
    values (target_owner, auth.uid(), 'professional_follow', actor_name || ' followed your page.', target_profile_id);
    following := true;
  end if;
  select count(*) into follower_count from public.follows where profile_id = target_profile_id;
  return next;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.toggle_profile_follow(uuid) to authenticated;
