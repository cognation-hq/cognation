-- Reporter logging + lower weight for bad reporters (follow-up to Investigator review).
-- NOT auto-run. Alexa runs AFTER 20261016_investigator_review.sql. Safe to re-run.
--
-- RULES (simple, clear)
--   1. Every report already stores reporter_user_id. Only Investigator sees the
--      filer (investigator_list_queue). The reported person never learns who filed.
--   2. When Investigator chooses dismiss_groundless, that counts against the filer.
--   3. Weight window = last 30 days of groundless dismissals:
--        >= 3  → ordinary reports from that filer no longer auto-hide (flag only).
--        >= 5  → Report privilege suspended until Investigator restores it.
--   4. Seed daily caps and seed-to-seed is_test exclusion are unchanged.
--
-- VERIFY AFTER
--   select public.reporter_groundless_count(auth.uid());  -- 0 for a clean account
--   select has_function_privilege('anon','public.can_i_report()','execute'); -- false? grant is authenticated
--
-- ROLLBACK
--   drop function if exists public.investigator_restore_reporter(uuid);
--   drop function if exists public.can_i_report();
--   drop function if exists public.reporter_groundless_count(uuid);
--   drop table if exists public.reporter_suspensions;
--   Re-run report_tower_post / investigator_decide / investigator_list_queue from
--   20261016_investigator_review.sql to drop the weight hooks.

create table if not exists public.reporter_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 1 and 200),
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null
);
alter table public.reporter_suspensions enable row level security;
revoke all on public.reporter_suspensions from anon, authenticated;
-- Owner may see whether they are suspended (no one else's rows).
grant select on public.reporter_suspensions to authenticated;
drop policy if exists "owner reads own suspension" on public.reporter_suspensions;
create policy "owner reads own suspension"
on public.reporter_suspensions for select to authenticated
using (user_id = auth.uid() and restored_at is null);

create or replace function public.reporter_groundless_count(uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.investigator_decision_log d
  join public.content_reports r on r.id = d.queue_id and d.queue_kind = 'report'
  where d.action = 'dismiss_groundless'
    and r.reporter_user_id = uid
    and d.created_at >= now() - interval '30 days';
$$;
revoke all on function public.reporter_groundless_count(uuid) from public, anon, authenticated;
grant execute on function public.reporter_groundless_count(uuid) to service_role;

create or replace function public.can_i_report()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and not exists (
       select 1 from public.reporter_suspensions s
       where s.user_id = auth.uid() and s.restored_at is null
     );
$$;
revoke all on function public.can_i_report() from public, anon;
grant execute on function public.can_i_report() to authenticated;

create or replace function public.investigator_restore_reporter(target_user_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.am_i_cognation_investigator() then raise exception 'not_investigator'; end if;
  update public.reporter_suspensions
     set restored_at = now(), restored_by = auth.uid()
   where user_id = target_user_id and restored_at is null;
  return found;
end;
$$;
revoke all on function public.investigator_restore_reporter(uuid) from public, anon;
grant execute on function public.investigator_restore_reporter(uuid) to authenticated;

-- Report: honor suspension; drop auto-hide weight after 3 groundless in 30 days.
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
  groundless int;
  low_weight boolean := false;
  rid uuid;
  atts jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.can_i_report() then raise exception 'report_suspended'; end if;
  if reason not in ('harmful','untruthful','misrated','illegal_image') then
    raise exception 'invalid_reason';
  end if;
  select * into p from public.tower_posts where id = report_tower_post.post_id;
  if p.id is null then raise exception 'post_not_found'; end if;
  select * into author from public.profiles where id = p.author_profile_id;
  if author.user_id = auth.uid() then raise exception 'cannot_report_own'; end if;

  reporter_seed := not public.cognation_user_is_real(auth.uid());
  author_seed := not public.cognation_user_is_real(author.user_id);
  if reporter_seed and author_seed then is_test := true; end if;

  groundless := public.reporter_groundless_count(auth.uid());
  low_weight := groundless >= 3;  -- ordinary reports no longer auto-hide

  if reason = 'illegal_image' then
    if attachment_index is null then raise exception 'attachment_index_required'; end if;
    atts := coalesce(p.attachments, '[]'::jsonb);
    if jsonb_typeof(atts) <> 'array'
       or attachment_index >= jsonb_array_length(atts) then
      raise exception 'attachment_not_found';
    end if;
    perform set_config('cognation.rating_decision', 'on', true);
    update public.tower_posts
       set hidden_attachment_indexes =
             (select array(select distinct x from unnest(hidden_attachment_indexes || attachment_index) x order by 1)),
           hidden_reason = coalesce(hidden_reason, 'illegal_image')
     where id = p.id;
    perform set_config('cognation.rating_decision', '', true);
    hid_image := true;
  elsif not reporter_seed and not low_weight then
    -- Human with normal weight: hide on report.
    perform set_config('cognation.rating_decision', 'on', true);
    update public.tower_posts
       set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'report'
     where id = p.id;
    perform set_config('cognation.rating_decision', '', true);
    hid_post := true;
  else
    -- Seed OR low-weight human: flag only. Seed daily cap still applies.
    if reporter_seed then
      select count(*) into seed_today from public.content_reports
       where reporter_user_id = auth.uid() and reporter_is_seed
         and created_at >= date_trunc('day', now() at time zone 'utc')
         and content_reports.reason <> 'illegal_image';
      if seed_today >= 20 then raise exception 'seed_report_cap'; end if;
    end if;
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
    'reporter_is_seed', reporter_seed,
    'low_weight', low_weight
  );
end;
$$;
revoke all on function public.report_tower_post(uuid, text, text, int) from public, anon;
grant execute on function public.report_tower_post(uuid, text, text, int) to authenticated;

-- Queue: Investigator sees filer user id; reported person never gets this RPC.
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
    select r.id, 'report'::text as kind, r.created_at, r.post_id, r.reason,
           r.reporter_is_seed, r.reporter_user_id, r.attachment_index, r.note,
           t.rating, t.rating_confidence, t.hidden_at is not null as post_hidden,
           t.hidden_attachment_indexes, left(t.body, 280) as body_preview,
           pa.handle as author_handle, pa.display_name as author_name,
           pa.account_kind as author_kind,
           public.reporter_groundless_count(r.reporter_user_id) as reporter_groundless_30d
    from public.content_reports r
    join public.tower_posts t on t.id = r.post_id
    join public.profiles pa on pa.id = t.author_profile_id
    where r.status = 'open' and not r.is_test

    union all

    select q.id, q.kind, q.created_at, q.post_id, null::text as reason,
           false, null::uuid, null::int, q.note,
           t.rating, t.rating_confidence, t.hidden_at is not null,
           t.hidden_attachment_indexes, left(t.body, 280),
           pa.handle, pa.display_name, pa.account_kind, null::int
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

-- Decide: add dismiss_groundless (counts against filer; may suspend at 5).
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
  groundless int;
begin
  if not public.am_i_cognation_investigator() then raise exception 'not_investigator'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'reason_required'; end if;
  if queue_source not in ('report','rating') then raise exception 'bad_source'; end if;
  if act not in ('set_rating','restore','confirm_illegal','dismiss','dismiss_groundless') then
    raise exception 'bad_action';
  end if;

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
           hidden_at = case when hidden_reason = 'report' then null else hidden_at end,
           hidden_reason = case when hidden_reason = 'report' then null else hidden_reason end
     where id = p.id;
    notice := 'Your post''s rating was set to ' || new_rating || '. You can appeal once.';

  elsif act = 'restore' then
    update public.tower_posts
       set hidden_at = null, hidden_reason = null, hidden_attachment_indexes = '{}'
     where id = p.id;
    notice := 'Your post was restored after review.';

  elsif act = 'confirm_illegal' then
    update public.tower_posts
       set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'investigator'
     where id = p.id;
    update public.profiles
       set frozen_at = coalesce(frozen_at, now()),
           freeze_reason = left(btrim(reason), 200)
     where user_id = author_uid and kind = 'personal';
    notice := 'Your post was removed after a safety review.';

  elsif act in ('dismiss', 'dismiss_groundless') then
    notice := 'A report on your post was reviewed with no change.';
  end if;

  perform set_config('cognation.rating_decision', '', true);

  if queue_source = 'report' then
    update public.content_reports set status = 'decided' where id = r.id;
  else
    update public.rating_review_queue
       set status = 'decided',
           decision = case
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

  -- Groundless dismissals count against the filer (reports only).
  if act = 'dismiss_groundless' and queue_source = 'report' and r.reporter_user_id is not null then
    groundless := public.reporter_groundless_count(r.reporter_user_id);
    if groundless >= 5 then
      insert into public.reporter_suspensions (user_id, reason)
      values (r.reporter_user_id, 'Repeated groundless reports (5+ in 30 days)')
      on conflict (user_id) do update
        set suspended_at = now(), reason = excluded.reason, restored_at = null, restored_by = null;
    end if;
  end if;

  if author_uid is not null and notice is not null then
    insert into public.poster_notices (recipient_user_id, post_id, body)
    values (author_uid, p.id, notice);
  end if;
end;
$$;
revoke all on function public.investigator_decide(uuid, text, text, text, text) from public, anon;
grant execute on function public.investigator_decide(uuid, text, text, text, text) to authenticated;
