-- Chat room message reports (ECHO rooms step 2c) — schema + report RPC.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor AFTER
--   20261015_chat_rooms.sql and 20261015_friend_block_real_seed.sql
--   (needs public.cognation_user_is_real).
-- Safe to re-run (idempotent).
--
-- Needs: public.chat_room_messages, public.profiles, public.cognation_user_is_real
--
-- WHAT
--   chat_room_messages.hidden_at / hidden_reason — under Investigator review
--   public.chat_room_message_reports — one report per person per room message
--   public.report_chat_room_message(message_id, reason) — report RPC
--
-- RULES (locked)
--   - Human (real) report: hide the message for EVERYONE in the room until
--     Investigator reviews (hidden_at set; room read RLS excludes it).
--   - Seed report: FLAG ONLY (no hide). Daily cap 20 ordinary reports / UTC day.
--   - No DM path. Works for seed (Demo) and real authors alike.
--   - Writes go through the RPC (security definer). Direct insert revoked.
--
-- VERIFY AFTER (SQL editor)
--   select to_regclass('public.chat_room_message_reports');
--   select relrowsecurity from pg_class where oid = 'public.chat_room_message_reports'::regclass;  -- true
--   select count(*) from information_schema.columns
--     where table_name = 'chat_room_messages' and column_name = 'hidden_at';  -- 1
--   select proname from pg_proc where proname = 'report_chat_room_message';
--
-- ROLLBACK
--   drop function if exists public.report_chat_room_message(uuid, text);
--   drop table if exists public.chat_room_message_reports;
--   alter table public.chat_room_messages drop column if exists hidden_at;
--   alter table public.chat_room_messages drop column if exists hidden_reason;
--   -- then re-apply the original messages SELECT policy from 20261015_chat_rooms.sql

-- 1. Hide columns on messages --------------------------------------------------
alter table public.chat_room_messages
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

-- 2. Reports table -------------------------------------------------------------
create table if not exists public.chat_room_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_room_messages(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_profile_id uuid references public.profiles(id) on delete set null,
  reason text check (reason is null or char_length(reason) between 1 and 200),
  reporter_is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_user_id)
);

create index if not exists chat_room_message_reports_message_idx
  on public.chat_room_message_reports (message_id);
create index if not exists chat_room_message_reports_seed_day_idx
  on public.chat_room_message_reports (reporter_user_id, created_at)
  where reporter_is_seed;

alter table public.chat_room_message_reports enable row level security;
revoke all on public.chat_room_message_reports from anon, authenticated;
grant select on public.chat_room_message_reports to authenticated;
/* Inserts only via report_chat_room_message (security definer). */

drop policy if exists "signed-in people report room messages as own profile"
  on public.chat_room_message_reports;
drop policy if exists "reporters read their own room message reports"
  on public.chat_room_message_reports;
create policy "reporters read their own room message reports"
  on public.chat_room_message_reports for select to authenticated
  using (reporter_user_id = auth.uid());

-- 3. Room reads exclude hidden messages ----------------------------------------
drop policy if exists "chat room messages readable to members" on public.chat_room_messages;
create policy "chat room messages readable to members"
on public.chat_room_messages for select to authenticated
using (
  exists (
    select 1 from public.chat_room_members me
    where me.room_id = chat_room_messages.room_id
      and me.user_id = auth.uid()
  )
  and public.cognation_viewer_can_see(rating)
  and not public.block_users_related(auth.uid(), author_user_id)
  and hidden_at is null
);

-- 4. Report RPC ----------------------------------------------------------------
create or replace function public.report_chat_room_message(
  p_message_id uuid,
  p_reason text default 'harmful'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  msg public.chat_room_messages;
  reporter_seed boolean;
  seed_today int;
  rid uuid;
  hid boolean := false;
  reason_norm text;
  profile_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;

  reason_norm := lower(nullif(btrim(coalesce(p_reason, 'harmful')), ''));
  if reason_norm is null then reason_norm := 'harmful'; end if;
  if char_length(reason_norm) > 200 then
    raise exception 'bad_reason';
  end if;

  select * into msg from public.chat_room_messages where id = p_message_id;
  if msg.id is null then raise exception 'message_not_found'; end if;
  if msg.author_user_id = auth.uid() then raise exception 'cannot_report_own'; end if;

  /* Must be a member of the room to report. */
  if not exists (
    select 1 from public.chat_room_members m
    where m.room_id = msg.room_id and m.user_id = auth.uid()
  ) then
    raise exception 'not_a_member';
  end if;

  reporter_seed := not public.cognation_user_is_real(auth.uid());

  select id into profile_id
    from public.profiles
   where user_id = auth.uid()
   order by created_at asc nulls last
   limit 1;

  if reporter_seed then
    -- Seed report: FLAG ONLY. Daily cap 20 (UTC day), matching tower reports.
    select count(*) into seed_today
      from public.chat_room_message_reports
     where reporter_user_id = auth.uid()
       and reporter_is_seed
       and created_at >= date_trunc('day', now() at time zone 'utc');
    if seed_today >= 20 then raise exception 'seed_report_cap'; end if;
  else
    -- Human (real) report: hide for everyone until Investigator reviews.
    update public.chat_room_messages
       set hidden_at = coalesce(hidden_at, now()),
           hidden_reason = coalesce(hidden_reason, 'report')
     where id = msg.id;
    hid := true;
  end if;

  insert into public.chat_room_message_reports
    (message_id, reporter_user_id, reporter_profile_id, reason, reporter_is_seed)
  values (msg.id, auth.uid(), profile_id, reason_norm, reporter_seed)
  on conflict (message_id, reporter_user_id) do nothing
  returning id into rid;

  if rid is null then
    select id into rid
      from public.chat_room_message_reports
     where message_id = msg.id and reporter_user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'report_id', rid,
    'hidden_message', hid,
    'reporter_is_seed', reporter_seed
  );
end;
$$;

revoke all on function public.report_chat_room_message(uuid, text) from public, anon;
grant execute on function public.report_chat_room_message(uuid, text) to authenticated;

comment on table public.chat_room_message_reports is
  'ECHO chat room message reports. Alexa-run; not auto-migrated. Human report hides message; seed flags only (20/day).';
comment on function public.report_chat_room_message(uuid, text) is
  'Report a chat room message. Real reporters hide it for the room; seeds flag only with a daily cap.';
