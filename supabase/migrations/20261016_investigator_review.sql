-- Cognation Investigator review queue (HH locked, 2026-10-15).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Safe to re-run.
-- Needs: 20261015_tower_auto_rate.sql, 20261015_rating_appeals.sql,
--        20261015_friend_block_real_seed.sql (cognation_user_is_real).
--
-- WHAT
--   - public.cognation_investigators: server-side allowlist by auth user id.
--     SEPARATE from cognation_admins (seed-preview). RLS on; no app grants.
--   - am_i_cognation_investigator(): true only for allowlisted callers.
--   - content_reports: person/seed reports of posts (and illegal-image reports).
--   - investigator_queue view: open reports + low-confidence / R-MA reviews +
--     appeals, excluding seed-to-seed tests.
--   - investigator_decide(...): change rating or restore, required reason,
--     decision log, plain poster notice. Freeze account only after Investigator
--     confirms illegal (never on report alone).
--   - report_tower_post(...): human hide-on-report; seed flag-only (cap/day);
--     illegal image hides that image only; seeds never send image bytes.
--
-- ONE-TIME SETUP (Alexa): add Investigator's User UID (Supabase dashboard >
-- Authentication > Users > User UID). Do not paste an email.
--   insert into public.cognation_investigators (user_id)
--   values ('<investigator-user-uid>')
--   on conflict do nothing;
--
-- VERIFY AFTER
--   select has_table_privilege('authenticated','public.cognation_investigators','select'); -- false
--   select has_function_privilege('anon','public.investigator_list_queue()','execute');    -- false
--   select public.am_i_cognation_investigator();  -- false unless allowlisted
--
-- ROLLBACK
--   drop function if exists public.investigator_list_queue();
--   drop function if exists public.investigator_decide(uuid, text, text, text, text);
--   drop function if exists public.report_tower_post(uuid, text, text, int);
--   drop function if exists public.mark_report_as_test(uuid);
--   drop function if exists public.am_i_cognation_investigator();
--   drop view if exists public.investigator_queue;
--   drop table if exists public.investigator_decision_log;
--   drop table if exists public.poster_notices;
--   drop table if exists public.content_reports;
--   drop table if exists public.cognation_investigators;
--   alter table public.tower_posts drop column if exists hidden_at, drop column if exists hidden_reason,
--     drop column if exists hidden_attachment_indexes;
--   alter table public.profiles drop column if exists frozen_at, drop column if exists freeze_reason;

-- 1. Allowlist (separate from cognation_admins) ---------------------------------
create table if not exists public.cognation_investigators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.cognation_investigators enable row level security;
revoke all on public.cognation_investigators from anon, authenticated;

create or replace function public.am_i_cognation_investigator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.cognation_investigators i where i.user_id = auth.uid());
$$;
revoke all on function public.am_i_cognation_investigator() from public, anon;
grant execute on function public.am_i_cognation_investigator() to authenticated;

-- 2. Post / account hide + freeze columns --------------------------------------
alter table public.tower_posts
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text
    check (hidden_reason is null or hidden_reason in ('report','illegal_image','investigator')),
  add column if not exists hidden_attachment_indexes int[] not null default '{}';

alter table public.profiles
  add column if not exists frozen_at timestamptz,
  add column if not exists freeze_reason text check (freeze_reason is null or char_length(freeze_reason) <= 200);

-- Hide-from-feed: authors still see their own posts; everyone else does not.
drop policy if exists "tower feed respects rating and age" on public.tower_posts;
create policy "tower feed respects rating and age"
on public.tower_posts for select using (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_posts.author_profile_id
      and profiles.user_id = auth.uid()
  )
  or (
    tower_posts.hidden_at is null
    and public.cognation_viewer_can_see(rating)
    and (
      visibility = 'public'
      or exists (
        select 1 from public.profiles
        join public.friendships on friendships.friend_user_id = profiles.user_id
        where profiles.id = tower_posts.author_profile_id
          and friendships.user_id = auth.uid()
      )
    )
  )
);

-- 3. Reports --------------------------------------------------------------------
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.tower_posts(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harmful','untruthful','misrated','illegal_image')),
  note text check (note is null or char_length(note) <= 280),
  attachment_index int check (attachment_index is null or attachment_index >= 0),
  reporter_is_seed boolean not null default false,
  is_test boolean not null default false,  -- seed-to-seed; stays out of the real queue
  status text not null default 'open' check (status in ('open','decided','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists content_reports_open_idx
  on public.content_reports (status, created_at) where status = 'open' and not is_test;
create index if not exists content_reports_seed_day_idx
  on public.content_reports (reporter_user_id, created_at)
  where reporter_is_seed;
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;
-- Reporter can see their own open reports (no other columns of other people).
grant select on public.content_reports to authenticated;
drop policy if exists "reporter reads own reports" on public.content_reports;
create policy "reporter reads own reports"
on public.content_reports for select to authenticated
using (reporter_user_id = auth.uid());

-- 4. Poster notices + decision log ---------------------------------------------
create table if not exists public.poster_notices (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.tower_posts(id) on delete set null,
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.poster_notices enable row level security;
revoke all on public.poster_notices from anon, authenticated;
grant select, update on public.poster_notices to authenticated;
drop policy if exists "recipient reads own notices" on public.poster_notices;
create policy "recipient reads own notices"
on public.poster_notices for select to authenticated using (recipient_user_id = auth.uid());
drop policy if exists "recipient marks notices read" on public.poster_notices;
create policy "recipient marks notices read"
on public.poster_notices for update to authenticated
using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

create table if not exists public.investigator_decision_log (
  id uuid primary key default gen_random_uuid(),
  investigator_user_id uuid not null references auth.users(id) on delete set null,
  queue_kind text not null,
  queue_id uuid not null,
  post_id uuid references public.tower_posts(id) on delete set null,
  action text not null,
  new_rating text,
  reason text not null check (char_length(reason) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table public.investigator_decision_log enable row level security;
revoke all on public.investigator_decision_log from anon, authenticated;
-- Investigators may read the log; nobody else.
grant select on public.investigator_decision_log to authenticated;
drop policy if exists "investigators read decision log" on public.investigator_decision_log;
create policy "investigators read decision log"
on public.investigator_decision_log for select to authenticated
using (public.am_i_cognation_investigator());

-- 5. Report a tower post -------------------------------------------------------
-- Seed daily cap (ordinary reports only; illegal_image is never capped).
create or replace function public.report_tower_post(
  post_id uuid, reason text, note text default null, attachment_index int default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  p public.tower_posts;
  author public.profiles;
  reporter_seed boolean;
  author_seed boolean;
  is_test boolean := false;
  hid_post boolean := false;
  hid_image boolean := false;
  seed_today int;
  rid uuid;
  atts jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if reason not in ('harmful','untruthful','misrated','illegal_image') then
    raise exception 'invalid_reason';
  end if;
  select * into p from public.tower_posts where id = report_tower_post.post_id;
  if p.id is null then raise exception 'post_not_found'; end if;
  select * into author from public.profiles where id = p.author_profile_id;
  if author.user_id = auth.uid() then raise exception 'cannot_report_own'; end if;

  reporter_seed := not public.cognation_user_is_real(auth.uid());
  author_seed := not public.cognation_user_is_real(author.user_id);
  -- Seed-to-seed: mark as test and keep out of the real Investigator queue.
  if reporter_seed and author_seed then is_test := true; end if;

  if reason = 'illegal_image' then
    if attachment_index is null then raise exception 'attachment_index_required'; end if;
    atts := coalesce(p.attachments, '[]'::jsonb);
    if jsonb_typeof(atts) <> 'array'
       or attachment_index >= jsonb_array_length(atts) then
      raise exception 'attachment_not_found';
    end if;
    -- Hide THAT IMAGE for everyone immediately. Do NOT freeze the account.
    -- Seeds/bots never send image bytes; only the index is stored.
    perform set_config('cognation.rating_decision', 'on', true);
    update public.tower_posts
       set hidden_attachment_indexes =
             (select array(select distinct x from unnest(hidden_attachment_indexes || attachment_index) x order by 1)),
           hidden_reason = coalesce(hidden_reason, 'illegal_image')
     where id = p.id;
    perform set_config('cognation.rating_decision', '', true);
    hid_image := true;
  elsif not reporter_seed then
    -- Human report of ordinary content: hide the post until review (existing rule).
    perform set_config('cognation.rating_decision', 'on', true);
    update public.tower_posts
       set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'report'
     where id = p.id;
    perform set_config('cognation.rating_decision', '', true);
    hid_post := true;
  else
    -- Seed report of ordinary content: FLAG ONLY. Daily cap.
    select count(*) into seed_today from public.content_reports
     where reporter_user_id = auth.uid() and reporter_is_seed
       and created_at >= date_trunc('day', now() at time zone 'utc')
       and content_reports.reason <> 'illegal_image';
    if seed_today >= 20 then raise exception 'seed_report_cap'; end if;
  end if;

  insert into public.content_reports
    (post_id, reporter_user_id, reason, note, attachment_index, reporter_is_seed, is_test)
  values (p.id, auth.uid(), reason, left(nullif(btrim(note), ''), 280),
          attachment_index, reporter_seed, is_test)
  returning id into rid;

  return jsonb_build_object(
    'report_id', rid,
    'hidden_post', hid_post,
    'hidden_image', hid_image,
    'is_test', is_test,
    'reporter_is_seed', reporter_seed
  );
end;
$$;
revoke all on function public.report_tower_post(uuid, text, text, int) from public, anon;
grant execute on function public.report_tower_post(uuid, text, text, int) to authenticated;

-- Mark a seed-to-seed report as a test (or confirm). Owner of the report or Investigator.
create or replace function public.mark_report_as_test(report_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  r public.content_reports;
begin
  select * into r from public.content_reports where id = mark_report_as_test.report_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not (r.reporter_user_id = auth.uid() or public.am_i_cognation_investigator()) then
    raise exception 'not_allowed';
  end if;
  if not (r.reporter_is_seed) then raise exception 'only_seed_reports'; end if;
  update public.content_reports set is_test = true where id = r.id;
  return true;
end;
$$;
revoke all on function public.mark_report_as_test(uuid) from public, anon;
grant execute on function public.mark_report_as_test(uuid) to authenticated;

-- 6. Queue list (Investigator only; tests excluded) ----------------------------
create or replace function public.investigator_list_queue()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  out jsonb;
begin
  if not public.am_i_cognation_investigator() then raise exception 'not_investigator'; end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at), '[]'::jsonb) into out
  from (
    -- Person/seed reported posts (real queue only)
    select r.id, 'report'::text as kind, r.created_at, r.post_id, r.reason,
           r.reporter_is_seed, r.attachment_index, r.note,
           t.rating, t.rating_confidence, t.hidden_at is not null as post_hidden,
           t.hidden_attachment_indexes, left(t.body, 280) as body_preview,
           pa.handle as author_handle, pa.display_name as author_name,
           pa.account_kind as author_kind
    from public.content_reports r
    join public.tower_posts t on t.id = r.post_id
    join public.profiles pa on pa.id = t.author_profile_id
    where r.status = 'open' and not r.is_test

    union all

    -- Low-confidence auto-ratings and R/MA / sensitive reviews (+ harmful auto)
    select q.id, q.kind, q.created_at, q.post_id, null::text as reason,
           false, null::int, q.note,
           t.rating, t.rating_confidence, t.hidden_at is not null,
           t.hidden_attachment_indexes, left(t.body, 280),
           pa.handle, pa.display_name, pa.account_kind
    from public.rating_review_queue q
    join public.tower_posts t on t.id = q.post_id
    join public.profiles pa on pa.id = t.author_profile_id
    where q.status = 'open' and q.kind in ('review','harmful','appeal')
  ) x;

  return out;
end;
$$;
revoke all on function public.investigator_list_queue() from public, anon;
grant execute on function public.investigator_list_queue() to authenticated;

-- 7. Decide: change rating or restore (required reason; logged; poster notice) -
-- queue_source: 'report' | 'rating'  (rating covers review/harmful/appeal rows)
-- action: 'set_rating' | 'restore' | 'confirm_illegal' | 'dismiss'
create or replace function public.investigator_decide(
  queue_id uuid, queue_source text, action text, new_rating text, reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r public.content_reports;
  q public.rating_review_queue;
  p public.tower_posts;
  author_uid uuid;
  notice text;
  act text := action;
begin
  if not public.am_i_cognation_investigator() then raise exception 'not_investigator'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'reason_required'; end if;
  if queue_source not in ('report','rating') then raise exception 'bad_source'; end if;
  if act not in ('set_rating','restore','confirm_illegal','dismiss') then raise exception 'bad_action'; end if;

  if queue_source = 'report' then
    select * into r from public.content_reports where id = queue_id and status = 'open' for update;
    if r.id is null then raise exception 'not_found'; end if;
    select * into p from public.tower_posts where id = r.post_id for update;
  else
    select * into q from public.rating_review_queue where id = queue_id and status = 'open' for update;
    if q.id is null then raise exception 'not_found'; end if;
    select * into p from public.tower_posts where id = q.post_id for update;
  end if;

  select user_id into author_uid from public.profiles where id = p.author_profile_id;

  perform set_config('cognation.rating_decision', 'on', true);

  if act = 'set_rating' then
    if new_rating is null or new_rating not in ('G','PG','PG-13','R','MA','NR') then
      raise exception 'rating_required';
    end if;
    update public.tower_posts
       set rating = new_rating, rating_confidence = 'high',
           rating_reasons = rating_reasons || ('investigator:' || new_rating),
           -- Restoring visibility when re-rating a report-hidden post
           hidden_at = case when hidden_reason = 'report' then null else hidden_at end,
           hidden_reason = case when hidden_reason = 'report' then null else hidden_reason end
     where id = p.id;
    notice := 'Your post''s rating was set to ' || new_rating || '. You can appeal once.';

  elsif act = 'restore' then
    update public.tower_posts
       set hidden_at = null,
           hidden_reason = null,
           hidden_attachment_indexes = '{}'
     where id = p.id;
    notice := 'Your post was restored after review.';

  elsif act = 'confirm_illegal' then
    -- Freeze the author's account ONLY after Investigator confirms illegal.
    update public.tower_posts
       set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'investigator'
     where id = p.id;
    update public.profiles
       set frozen_at = coalesce(frozen_at, now()),
           freeze_reason = left(btrim(reason), 200)
     where user_id = author_uid and kind = 'personal';
    notice := 'Your post was removed after a safety review.';

  elsif act = 'dismiss' then
    -- Leave the post as-is (e.g. seed flag with no action).
    notice := 'A report on your post was reviewed with no change.';
  end if;

  perform set_config('cognation.rating_decision', '', true);

  if queue_source = 'report' then
    update public.content_reports set status = 'decided' where id = r.id;
  else
    update public.rating_review_queue
       set status = 'decided', decision = case
             when act = 'set_rating' and public.cognation_rating_rank(new_rating) < public.cognation_rating_rank(p.rating) then 'lower'
             when act = 'set_rating' and public.cognation_rating_rank(new_rating) > public.cognation_rating_rank(p.rating) then 'raise'
             else 'keep' end,
           decision_rating = coalesce(new_rating, p.rating),
           decision_reason = left(btrim(reason), 200),
           decided_at = now()
     where id = q.id;
  end if;

  insert into public.investigator_decision_log
    (investigator_user_id, queue_kind, queue_id, post_id, action, new_rating, reason)
  values (auth.uid(), queue_source, queue_id, p.id, act, new_rating, left(btrim(reason), 200));

  if author_uid is not null and notice is not null then
    insert into public.poster_notices (recipient_user_id, post_id, body)
    values (author_uid, p.id, notice);
  end if;
end;
$$;
revoke all on function public.investigator_decide(uuid, text, text, text, text) from public, anon;
grant execute on function public.investigator_decide(uuid, text, text, text, text) to authenticated;

-- Bridge the older investigator_decide_rating name to the allowlisted path.
create or replace function public.investigator_decide_rating(
  queue_id uuid, decision text, new_rating text, reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.am_i_cognation_investigator() then
    raise exception 'not_investigator';
  end if;
  if decision = 'keep' then
    perform public.investigator_decide(queue_id, 'rating', 'dismiss', null, reason);
  else
    perform public.investigator_decide(queue_id, 'rating', 'set_rating', new_rating, reason);
  end if;
end;
$$;
revoke all on function public.investigator_decide_rating(uuid, text, text, text) from public, anon;
grant execute on function public.investigator_decide_rating(uuid, text, text, text) to authenticated;

comment on table public.cognation_investigators is
  'Investigator review allowlist (user ids only). Separate from cognation_admins.';
comment on table public.content_reports is
  'Tower post reports. Seed ordinary reports flag only; illegal_image hides that image; seed-to-seed may be is_test.';
