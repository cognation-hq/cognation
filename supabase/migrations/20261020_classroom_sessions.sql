-- Classroom + Webinar sessions booked through Cognation (one public Cognation Calendar).
-- NOT auto-run. Alexa runs this herself in the Supabase SQL editor. Safe to re-run.
--
-- Needs: public.profiles (id, user_id, kind, account_kind),
--        public.cognation_user_is_real (20261015_friend_block_missing_profile.sql),
--        public.cognation_viewer_can_see (20261015_tower_auto_rate.sql),
--        public.user_blocks (20261016_user_blocks.sql).
--
-- WHAT
--   1. Table public.classroom_sessions: one row per booked Classroom or Webinar session
--      (host_profile_id, title, kind, starts_at, ends_at, status, rating, created_at).
--      rating defaults to PG-13 and is not writable from the browser, so under-13 viewers
--      see no sessions until a rating step exists.
--      Personal calendar events are NOT here; they stay private in the profile record.
--   2. Helper public.cognation_classroom_session_visible(uuid, text): who may read a row.
--      - Seed / ops hosts are seen only by seed / ops viewers (and the host).
--      - Hosts related by a block (either way) are hidden.
--      - Rating floor: under-13 viewers see G / PG only (cognation_viewer_can_see).
--   3. Helper public.cognation_owns_pro_profile(uuid): caller owns that Professional page.
--   4. Policies on classroom_sessions:
--      - "classroom sessions public read"   (select, anon + authenticated): scheduled or live rows
--        that pass the visibility helper. Ended rows are not public.
--      - "classroom sessions host reads own" (select, authenticated): the host reads all of their rows.
--      - "classroom sessions host books"     (insert, authenticated): only for a Professional page the
--        caller owns, and only as status 'scheduled'.
--      - "classroom sessions host updates"   (update, authenticated): only the host, only on their
--        own Professional page.
--      No delete (End or cancel sets status 'ended').
--   5. Trigger classroom_sessions_guard (function public.classroom_sessions_guard()):
--      - host_profile_id and created_at never change after booking.
--      - Status only moves forward: scheduled -> live, scheduled -> ended, live -> ended.
--      - Go live only on a Professional page, and one live session per host at a time.
--
-- VERIFY AFTER
--   select has_table_privilege('anon','public.classroom_sessions','select');   -- true
--   select has_table_privilege('anon','public.classroom_sessions','insert');   -- false
--   select count(*) from pg_policies where tablename = 'classroom_sessions';  -- 4
--   select has_function_privilege('anon','public.cognation_classroom_session_visible(uuid,text)','execute'); -- true
--
-- ROLLBACK
--   drop table if exists public.classroom_sessions;   -- drops its policies and trigger
--   drop function if exists public.classroom_sessions_guard();
--   drop function if exists public.cognation_classroom_session_visible(uuid, text);
--   drop function if exists public.cognation_owns_pro_profile(uuid);

-- 1. Table ---------------------------------------------------------------------
create table if not exists public.classroom_sessions (
  id uuid primary key default gen_random_uuid(),
  host_profile_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('classroom', 'webinar')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  rating text not null default 'PG-13' check (rating in ('G', 'PG', 'PG-13', 'R')),
  created_at timestamptz not null default now(),
  constraint classroom_sessions_host_profile_id_fkey
    foreign key (host_profile_id) references public.profiles(id) on delete cascade,
  constraint classroom_sessions_length_check
    check (ends_at > starts_at and ends_at <= starts_at + interval '4 hours')
);
create index if not exists classroom_sessions_starts_idx on public.classroom_sessions (starts_at);
create index if not exists classroom_sessions_host_idx on public.classroom_sessions (host_profile_id, status);

alter table public.classroom_sessions enable row level security;
revoke all on public.classroom_sessions from anon, authenticated;
grant select on public.classroom_sessions to anon, authenticated;
-- rating is not writable from the browser: every session is PG-13 (under-13 never sees it)
-- until a rating step exists. Hosts cannot self-rate a session down to G / PG.
grant insert (host_profile_id, title, kind, starts_at, ends_at) on public.classroom_sessions to authenticated;
grant update (title, kind, starts_at, ends_at, status) on public.classroom_sessions to authenticated;

-- 2. Visibility helper ----------------------------------------------------------
create or replace function public.cognation_classroom_session_visible(p_host_profile_id uuid, p_rating text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles h
    where h.id = p_host_profile_id
      and h.kind = 'professional'
      and (
        h.user_id = auth.uid()
        or (
          public.cognation_viewer_can_see(p_rating)
          and (
            coalesce(h.account_kind::text, 'real') = 'real'
            or (auth.uid() is not null and not public.cognation_user_is_real(auth.uid()))
          )
          and (
            auth.uid() is null
            or not exists (
              select 1 from public.user_blocks b
              where (b.blocker_user_id = auth.uid() and b.blocked_user_id = h.user_id)
                 or (b.blocker_user_id = h.user_id and b.blocked_user_id = auth.uid())
            )
          )
        )
      )
  );
$$;
revoke all on function public.cognation_classroom_session_visible(uuid, text) from public;
grant execute on function public.cognation_classroom_session_visible(uuid, text) to anon, authenticated;

-- 3. Ownership helper -----------------------------------------------------------
create or replace function public.cognation_owns_pro_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.user_id = auth.uid() and p.kind = 'professional'
  );
$$;
revoke all on function public.cognation_owns_pro_profile(uuid) from public, anon;
grant execute on function public.cognation_owns_pro_profile(uuid) to authenticated;

-- 4. Policies -------------------------------------------------------------------
drop policy if exists "classroom sessions public read" on public.classroom_sessions;
create policy "classroom sessions public read"
on public.classroom_sessions for select to anon, authenticated
using (
  status in ('scheduled', 'live')
  and public.cognation_classroom_session_visible(host_profile_id, rating)
);

drop policy if exists "classroom sessions host reads own" on public.classroom_sessions;
create policy "classroom sessions host reads own"
on public.classroom_sessions for select to authenticated
using (public.cognation_owns_pro_profile(host_profile_id));

drop policy if exists "classroom sessions host books" on public.classroom_sessions;
create policy "classroom sessions host books"
on public.classroom_sessions for insert to authenticated
with check (status = 'scheduled' and public.cognation_owns_pro_profile(host_profile_id));

drop policy if exists "classroom sessions host updates" on public.classroom_sessions;
create policy "classroom sessions host updates"
on public.classroom_sessions for update to authenticated
using (public.cognation_owns_pro_profile(host_profile_id))
with check (public.cognation_owns_pro_profile(host_profile_id));

-- 5. Guard trigger --------------------------------------------------------------
create or replace function public.classroom_sessions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.host_profile_id <> old.host_profile_id or new.created_at <> old.created_at then
      raise exception 'classroom_session_locked';
    end if;
    if new.status <> old.status and not (
      (old.status = 'scheduled' and new.status in ('live', 'ended'))
      or (old.status = 'live' and new.status = 'ended')
    ) then
      raise exception 'classroom_session_status';
    end if;
  end if;
  if new.status = 'live' and (tg_op = 'INSERT' or old.status <> 'live') then
    if not exists (select 1 from public.profiles p where p.id = new.host_profile_id and p.kind = 'professional') then
      raise exception 'classroom_session_not_professional';
    end if;
    if exists (
      select 1 from public.classroom_sessions s
      where s.host_profile_id = new.host_profile_id and s.status = 'live' and s.id <> new.id
    ) then
      raise exception 'classroom_session_already_live';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists classroom_sessions_guard on public.classroom_sessions;
create trigger classroom_sessions_guard
before insert or update on public.classroom_sessions
for each row execute function public.classroom_sessions_guard();

comment on table public.classroom_sessions is
  'Classroom / Webinar sessions booked from Professional pages. Public read: scheduled + live only. Personal calendar events never live here.';
