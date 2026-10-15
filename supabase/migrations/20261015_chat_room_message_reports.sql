-- Chat room message reports (ECHO rooms step 2c) — schema only.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor AFTER 20261015_chat_rooms.sql.
-- Safe to re-run (idempotent).
--
-- Needs: public.chat_room_messages, public.profiles
--
-- WHAT
--   public.chat_room_message_reports — one report per person per room message.
--
-- RULES
--   - Insert as own profile only. Select own reports only.
--   - No DM path. Works for seed (Demo) and real authors alike.
--   - Investigator / service-role reads bypass RLS (same pattern as news_comment_reports).
--
-- VERIFY AFTER (SQL editor)
--   select to_regclass('public.chat_room_message_reports');
--   select relrowsecurity from pg_class where oid = 'public.chat_room_message_reports'::regclass;  -- true
--   select count(*) from public.chat_room_message_reports;  -- 0 on first run
--
-- ROLLBACK
--   drop table if exists public.chat_room_message_reports;

create table if not exists public.chat_room_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_room_messages(id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_profile_id)
);

create index if not exists chat_room_message_reports_message_idx
  on public.chat_room_message_reports (message_id);

alter table public.chat_room_message_reports enable row level security;

revoke all on public.chat_room_message_reports from anon, authenticated;
grant select, insert on public.chat_room_message_reports to authenticated;

drop policy if exists "signed-in people report room messages as own profile"
  on public.chat_room_message_reports;
create policy "signed-in people report room messages as own profile"
  on public.chat_room_message_reports for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = chat_room_message_reports.reporter_profile_id
        and profiles.user_id = auth.uid()
    )
  );

drop policy if exists "reporters read their own room message reports"
  on public.chat_room_message_reports;
create policy "reporters read their own room message reports"
  on public.chat_room_message_reports for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = chat_room_message_reports.reporter_profile_id
        and profiles.user_id = auth.uid()
    )
  );

comment on table public.chat_room_message_reports is
  'ECHO chat room message reports. Alexa-run; not auto-migrated. One row per reporter per message.';
