-- Investigator room lock (illegal content only, after pattern check).
-- NOT auto-run. Alexa runs this after 20261016_investigator_review.sql
-- (and reporter_weight / user_blocks if those are already applied). Safe to re-run.
--
-- RULES (Alexa lock)
--   - After Confirm illegal, Investigator pattern-checks the account's other
--     posts/attachments (metadata only — never image bytes, never mailbox addresses).
--   - If a trend or duplicates are found (illegal content only):
--       1. Auto-generate an incident report form (username + what was found).
--       2. Freeze the account and hide it from the public eye.
--       3. Do NOT delete the account or its content — Investigator/legal keep
--          evidence access via security-definer reads.
--   - Seeds still only flag public ordinary content (unchanged report path).
--
-- VERIFY AFTER
--   select has_function_privilege('anon','public.investigator_pattern_check(uuid)','execute'); -- false
--   select has_table_privilege('authenticated','public.incident_report_forms','insert'); -- false
--
-- ROLLBACK
--   drop function if exists public.investigator_incident_takedown(uuid, text);
--   drop function if exists public.investigator_pattern_check(uuid);
--   drop function if exists public.cognation_attachment_meta(jsonb);
--   drop table if exists public.incident_report_forms;

-- Incident report forms: username + what was found. No mailbox addresses. No image bytes.
create table if not exists public.incident_report_forms (
  id uuid primary key default gen_random_uuid(),
  generated_by uuid not null references auth.users(id) on delete set null,
  subject_handle text not null check (char_length(subject_handle) between 1 and 64),
  subject_user_id uuid references auth.users(id) on delete set null,
  findings text not null check (char_length(findings) between 1 and 2000),
  related_post_id uuid references public.tower_posts(id) on delete set null,
  pattern_summary jsonb not null default '{}'::jsonb,
  status text not null default 'generated'
    check (status in ('generated','sent_to_legal','closed')),
  created_at timestamptz not null default now()
);
-- Legacy name from an earlier draft (safe if never created).
drop table if exists public.lawyer_review_queue;
alter table public.incident_report_forms enable row level security;
revoke all on public.incident_report_forms from anon, authenticated;
grant select on public.incident_report_forms to authenticated;
drop policy if exists "investigators read incident forms" on public.incident_report_forms;
create policy "investigators read incident forms"
on public.incident_report_forms for select to authenticated
using (public.am_i_cognation_investigator());

-- Strip attachment jsonb to safe metadata (no url / data / bytes).
create or replace function public.cognation_attachment_meta(atts jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'index', ord - 1,
         'kind', coalesce(elem->>'kind', elem->>'type', 'file'),
         'name', left(coalesce(elem->>'name', elem->>'label', ''), 120),
         'size', case when (elem->>'size') ~ '^[0-9]+$' then (elem->>'size')::bigint else null end,
         'type', left(coalesce(elem->>'type', ''), 80)
       )
       order by ord
     )
     from jsonb_array_elements(coalesce(atts, '[]'::jsonb)) with ordinality as t(elem, ord)
     where jsonb_typeof(atts) = 'array'),
    '[]'::jsonb
  );
$$;
revoke all on function public.cognation_attachment_meta(jsonb) from public, anon;
grant execute on function public.cognation_attachment_meta(jsonb) to authenticated;

-- Pattern check: author's posts/attachments (evidence read; no deletes).
-- Returns handle + safe previews only.
create or replace function public.investigator_pattern_check(post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  author_profile public.profiles;
  out jsonb;
begin
  if not public.am_i_cognation_investigator() then raise exception 'not_investigator'; end if;

  select pa.* into author_profile
  from public.tower_posts t
  join public.profiles pa on pa.id = t.author_profile_id
  where t.id = investigator_pattern_check.post_id;
  if author_profile.id is null then raise exception 'post_not_found'; end if;

  select jsonb_build_object(
    'handle', author_profile.handle,
    'display_name', author_profile.display_name,
    'frozen', author_profile.frozen_at is not null,
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'created_at', s.created_at,
               'body_preview', s.body_preview,
               'rating', s.rating,
               'visibility', s.visibility,
               'hidden', s.hidden,
               'attachment_count', s.attachment_count,
               'attachments', s.attachments,
               'is_trigger_post', s.is_trigger_post
             ) order by s.created_at desc)
      from (
        select t.created_at,
               left(coalesce(t.body, ''), 200) as body_preview,
               t.rating,
               t.visibility,
               t.hidden_at is not null as hidden,
               case when jsonb_typeof(t.attachments) = 'array'
                    then jsonb_array_length(t.attachments) else 0 end as attachment_count,
               public.cognation_attachment_meta(t.attachments) as attachments,
               t.id = investigator_pattern_check.post_id as is_trigger_post
        from public.tower_posts t
        where t.author_profile_id = author_profile.id
        order by t.created_at desc
        limit 50
      ) s
    ), '[]'::jsonb)
  ) into out;

  return out;
end;
$$;
revoke all on function public.investigator_pattern_check(uuid) from public, anon;
grant execute on function public.investigator_pattern_check(uuid) to authenticated;

-- Illegal trend/duplicates: auto-generate incident form, freeze + hide from
-- public. NEVER delete auth.users, profiles, or tower_posts (evidence retained).
create or replace function public.investigator_incident_takedown(
  post_id uuid, findings text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  author_profile public.profiles;
  findings_clean text;
  pattern jsonb;
  form_id uuid;
  hidden_n int := 0;
begin
  if not public.am_i_cognation_investigator() then raise exception 'not_investigator'; end if;
  findings_clean := left(btrim(coalesce(findings, '')), 2000);
  if findings_clean = '' then raise exception 'findings_required'; end if;

  select pa.* into author_profile
  from public.tower_posts t
  join public.profiles pa on pa.id = t.author_profile_id
  where t.id = investigator_incident_takedown.post_id;
  if author_profile.id is null then raise exception 'post_not_found'; end if;
  if coalesce(btrim(author_profile.handle), '') = '' then raise exception 'handle_required'; end if;

  -- Evidence read (security definer); content stays in tables.
  pattern := public.investigator_pattern_check(investigator_incident_takedown.post_id);

  -- Hide from the public eye — UPDATE only, never DELETE.
  perform set_config('cognation.rating_decision', 'on', true);
  update public.tower_posts
     set hidden_at = coalesce(hidden_at, now()),
         hidden_reason = 'investigator'
   where author_profile_id = author_profile.id
     and hidden_at is null;
  get diagnostics hidden_n = row_count;
  perform set_config('cognation.rating_decision', '', true);

  -- Freeze account (profile row kept).
  update public.profiles
     set frozen_at = coalesce(frozen_at, now()),
         freeze_reason = left('incident: ' || findings_clean, 200)
   where user_id = author_profile.user_id and kind = 'personal';

  -- Auto-generate incident report form (username + what was found).
  insert into public.incident_report_forms
    (generated_by, subject_handle, subject_user_id, findings, related_post_id, pattern_summary)
  values (
    auth.uid(),
    left(author_profile.handle, 64),
    author_profile.user_id,
    findings_clean,
    investigator_incident_takedown.post_id,
    jsonb_build_object(
      'post_count', jsonb_array_length(coalesce(pattern->'posts', '[]'::jsonb)),
      'hidden_now', hidden_n,
      'attachment_names', (
        select coalesce(jsonb_agg(distinct a->>'name'), '[]'::jsonb)
        from jsonb_array_elements(coalesce(pattern->'posts', '[]'::jsonb)) p,
             jsonb_array_elements(coalesce(p->'attachments', '[]'::jsonb)) a
        where coalesce(a->>'name', '') <> ''
      )
    )
  )
  returning id into form_id;

  insert into public.investigator_decision_log
    (investigator_user_id, queue_kind, queue_id, post_id, action, new_rating, reason)
  values (
    auth.uid(), 'incident', form_id,
    investigator_incident_takedown.post_id,
    'incident_takedown', null,
    left(findings_clean, 200)
  );

  return jsonb_build_object(
    'form_generated', true,
    'handle', author_profile.handle,
    'findings', findings_clean,
    'hidden_posts', hidden_n,
    'deleted', false
  );
end;
$$;
revoke all on function public.investigator_incident_takedown(uuid, text) from public, anon;
grant execute on function public.investigator_incident_takedown(uuid, text) to authenticated;

-- Drop earlier draft RPC name if present.
drop function if exists public.investigator_queue_lawyer_takedown(uuid, text);

comment on table public.incident_report_forms is
  'Auto-generated after illegal pattern check: username (handle) + findings. No mailbox addresses, no image bytes. Account/content are frozen/hidden, never deleted.';
