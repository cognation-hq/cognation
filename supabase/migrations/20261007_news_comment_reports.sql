-- News comment reports: a signed-in person can report a news story comment once.
-- Held for Alexa to run in the Supabase SQL editor (with #66's SQL). Safe to re-run.
--
-- Access
--   insert: signed-in people, only as their own profile (one report per comment).
--   select: a reporter sees only their own reports. No one else's reports are readable.
--   update / delete: none for anon or authenticated.
--   Moderator access: the repo has no admin/moderator role pattern in SQL, so
--   moderation reads go through the service role (bypasses RLS) for now.
--
-- Verify after (counts / booleans only):
--   select count(*) from public.news_comment_reports;                       -- 0 on first run
--   select relrowsecurity from pg_class where oid = 'public.news_comment_reports'::regclass;  -- true
--   select policyname, cmd from pg_policies where tablename = 'news_comment_reports';
--
-- Rollback (drops all reports):
--   drop table if exists public.news_comment_reports;

create table if not exists public.news_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.news_story_comments(id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (reason is null or char_length(reason) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_profile_id)
);

create index if not exists news_comment_reports_comment_idx
  on public.news_comment_reports (comment_id);

alter table public.news_comment_reports enable row level security;

drop policy if exists "signed-in people report as their own profile" on public.news_comment_reports;
create policy "signed-in people report as their own profile"
  on public.news_comment_reports for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = news_comment_reports.reporter_profile_id
        and profiles.user_id = auth.uid()
    )
  );

drop policy if exists "reporters read their own reports" on public.news_comment_reports;
create policy "reporters read their own reports"
  on public.news_comment_reports for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = news_comment_reports.reporter_profile_id
        and profiles.user_id = auth.uid()
    )
  );

revoke all on public.news_comment_reports from anon, authenticated;
grant select, insert on public.news_comment_reports to authenticated;
