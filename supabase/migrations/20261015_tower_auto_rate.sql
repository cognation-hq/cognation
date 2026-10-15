-- Tower auto-rate + rating visibility (RATING-RULES-DRAFT.md sections 1-6).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Run order: 2 of 3
-- (after 20261015_user_birth_year_month.sql). Safe to re-run.
--
-- WHAT
--   - tower_posts gets rating / rating_confidence / rating_reasons. A trigger
--     rates every post at insert time; anything the client sends is ignored.
--     On edit, the rating can only get stricter. Only Investigator functions
--     (security definer, PR 3) can lower it.
--   - Not rateable (harmful) posts are rated NR, hidden from everyone but the
--     author, and queued as Harmful.
--   - Low confidence, R/MA, and self-harm / graphic violence / war / sexual
--     posts are queued for Investigator review and stay visible at the stricter rating.
--   - Read policy: G/PG/PG-13 for 13+, R for 18+, MA for 21+ who opted in.
--     Age comes from user_birth (year + month); no row => 13.
--     SIGNAL and ECHO read the same tower_posts rows, so the rule carries over.
--   - No dwell time or engagement signals are used.
--
-- VERIFY AFTER
--   select public.cognation_auto_rate('hello friends', '[]'::jsonb);            -- (G,high,{},f,f)
--   select public.cognation_auto_rate('my dad bought a gun', '[]'::jsonb);      -- PG-13
--   select public.cognation_auto_rate('war propaganda clip', '[]'::jsonb);      -- R, review
--   select has_table_privilege('anon','public.rating_review_queue','select');   -- false
--
-- ROLLBACK
--   drop trigger if exists tower_posts_auto_rate on public.tower_posts;
--   drop trigger if exists tower_posts_queue_review on public.tower_posts;
--   drop policy if exists "tower feed respects rating and age" on public.tower_posts;
--   create policy "tower feed is visible to author, friends, and public" ... (see 20260924_cognation_social.sql)
--   alter table public.tower_posts drop column if exists rating, drop column if exists rating_confidence,
--     drop column if exists rating_reasons;
--   drop table if exists public.rating_review_queue;

-- 1. Columns ------------------------------------------------------------------
alter table public.tower_posts
  add column if not exists rating text not null default 'PG-13'
    check (rating in ('G','PG','PG-13','R','MA','NR')),
  add column if not exists rating_confidence text not null default 'low'
    check (rating_confidence in ('high','low')),
  add column if not exists rating_reasons text[] not null default '{}';

alter table public.user_birth
  add column if not exists mature_opt_in boolean not null default false;

-- 2. Investigator queue (service_role / SQL editor only) -------------------------
create table if not exists public.rating_review_queue (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.tower_posts(id) on delete cascade,
  kind text not null check (kind in ('review','harmful','appeal')),
  reasons text[] not null default '{}',
  status text not null default 'open' check (status in ('open','decided')),
  created_at timestamptz not null default now()
);
create index if not exists rating_review_queue_open_idx
  on public.rating_review_queue (status, created_at);
alter table public.rating_review_queue enable row level security;
revoke all on public.rating_review_queue from anon, authenticated;

-- 3. Rater (term lists mirrored in js/auto-rate.js; a test keeps them equal) ----
create or replace function public.cognation_rating_rank(r text)
returns int language sql immutable as $$
  select case r when 'G' then 0 when 'PG' then 1 when 'PG-13' then 2
                when 'R' then 3 when 'MA' then 4 when 'NR' then 5 else 2 end;
$$;

create or replace function public.cognation_term_hits(t text, terms text[])
returns int language sql immutable as $$
  select count(*)::int from unnest(terms) term
  where t ~ ('(^|[^a-z0-9])' || regexp_replace(term, '([.*+?^${}()|\[\]\\-])', '\\\1', 'g') || '($|[^a-z0-9])');
$$;

create or replace function public.cognation_auto_rate(
  body text, attachments jsonb,
  out rating text, out confidence text, out reasons text[], out harmful boolean, out review boolean)
language plpgsql
immutable
as $$
declare
  l_harmful text[] := array['i will kill you','im going to kill you','i''m going to kill you','going to shoot up','shoot up the school','bomb the school','kill yourself','kys','how to make a bomb','how to build a bomb','pipe bomb instructions','how to make a gun','ghost gun instructions','how to kill myself','ways to kill myself','how to cut myself','child porn','cp links','underage nudes','their home address is','here is his address','here is her address','doxx','doxxed','doxxing']::text[];
  l_ma text[] := array['porn','porno','nudes','nude pics','explicit sex','xxx','onlyfans','hardcore sex','gore video','beheading video']::text[];
  l_war text[] := array['war footage','combat footage','airstrike video','drone strike video','war propaganda','propaganda video','psyop','psy-op','psyops','psy-ops','psychological operation','enemy propaganda']::text[];
  l_r text[] := array['sex','sexy','horny','hookup','cocaine','heroin','meth','molly','get high','getting high','stoned','weed','blunt','wasted','drunk','shots shots','gore','graphic violence','massacre','beheading','tortured']::text[];
  l_strong text[] := array['fuck','fucking','fucked','motherfucker','shit','shitty','bitch','asshole','bastard','dick','cunt']::text[];
  l_weapon text[] := array['gun','guns','rifle','rifles','pistol','pistols','handgun','shotgun','ammo','ammunition','firearm','firearms','ar-15','ak-47','knife','knives','machete','switchblade','glock','bullets']::text[];
  l_pg13 text[] := array['murder','murdered','shooting','stabbed','stabbing','killed','assault','assaulted','arrested','crime','robbery','violence','violent','blood','bloody','kiss','making out','war']::text[];
  l_pg text[] := array['damn','hell','crap','sucks','scary','fight','fighting','punch','stupid','idiot','freaking','dang']::text[];
  l_self_harm text[] := array['suicide','suicidal','self harm','self-harm','cutting myself','kill myself','want to die','end it all','overdose']::text[];
  l_sexual text[] := array['sex','sexy','horny','nudes','nude','porn','porno','onlyfans','hookup','explicit sex']::text[];
  l_graphic text[] := array['gore','graphic violence','beheading','massacre','tortured','blood everywhere','dismembered']::text[];
  t text := translate(lower(coalesce(body, '')), '’`', '''''');
  strong int := 0;
  sensitive boolean := false;
  term text;
  ranks text[] := array['G','PG','PG-13','R','MA'];
begin
  rating := 'G'; confidence := 'high'; reasons := '{{}}'; harmful := false; review := false;
  if public.cognation_term_hits(t, l_harmful) > 0 then
    rating := 'NR'; reasons := array['harmful']; harmful := true; review := true;
    return;
  end if;
  if public.cognation_term_hits(t, l_ma) > 0 then rating := 'MA'; reasons := reasons || 'explicit'::text; end if;
  if public.cognation_term_hits(t, l_war) > 0 then
    if public.cognation_rating_rank(rating) < 3 then rating := 'R'; end if;
    reasons := reasons || 'war'::text; sensitive := true;
  end if;
  if public.cognation_term_hits(t, l_r) > 0 then
    if public.cognation_rating_rank(rating) < 3 then rating := 'R'; end if;
    reasons := reasons || 'adult'::text;
  end if;
  foreach term in array l_strong loop
    strong := strong + (select count(*)::int from regexp_matches(t,
      '(^|[^a-z0-9])' || term || '(?=$|[^a-z0-9])', 'g'));
  end loop;
  if strong >= 3 then
    if public.cognation_rating_rank(rating) < 3 then rating := 'R'; end if;
    reasons := reasons || 'strong-language'::text;
  elsif strong >= 1 then
    if public.cognation_rating_rank(rating) < 2 then rating := 'PG-13'; end if;
    reasons := reasons || 'strong-language'::text;
  end if;
  if public.cognation_term_hits(t, l_weapon) > 0 then
    if public.cognation_rating_rank(rating) < 2 then rating := 'PG-13'; end if;
    reasons := reasons || 'weapons'::text;
  end if;
  if public.cognation_term_hits(t, l_pg13) > 0 then
    if public.cognation_rating_rank(rating) < 2 then rating := 'PG-13'; end if;
    reasons := reasons || 'mature-topic'::text;
  end if;
  if public.cognation_term_hits(t, l_pg) > 0 then
    if public.cognation_rating_rank(rating) < 1 then rating := 'PG'; end if;
    reasons := reasons || 'mild'::text;
  end if;
  if public.cognation_term_hits(t, l_self_harm) > 0 then
    if public.cognation_rating_rank(rating) < 2 then rating := 'PG-13'; end if;
    reasons := reasons || 'self-harm'::text; sensitive := true;
  end if;
  if public.cognation_term_hits(t, l_sexual) > 0 then reasons := reasons || 'sexual'::text; sensitive := true; end if;
  if public.cognation_term_hits(t, l_graphic) > 0 then reasons := reasons || 'graphic-violence'::text; sensitive := true; end if;
  -- Masked words (f*ck, sh!t): unsure, so one level stricter and low confidence.
  if t ~ '[a-z][*@#$!][a-z*]' then
    rating := ranks[least(greatest(public.cognation_rating_rank(rating), 1) + 2, 5)];
    confidence := 'low'; reasons := reasons || 'masked-words'::text;
  end if;
  -- Attachments cannot be read by the text rater: unsure, so stricter.
  if jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) > 0 then
    if public.cognation_rating_rank(rating) < 2 then rating := 'PG-13'; end if;
    confidence := 'low'; reasons := reasons || 'attachment-unread'::text;
  end if;
  review := confidence = 'low' or rating in ('R','MA') or sensitive;
end;
$$;

-- 4. Rate on insert; on edit only ever stricter. Client values are ignored. ------
create or replace function public.tower_posts_apply_rating()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  if tg_op = 'UPDATE'
     and current_user not in ('anon', 'authenticated')
     and coalesce(current_setting('cognation.rating_decision', true), '') = 'on' then
    return new; -- Investigator decision path (security definer, PR 3)
  end if;
  select * into r from public.cognation_auto_rate(new.body, new.attachments);
  if tg_op = 'INSERT' then
    new.rating := r.rating;
    new.rating_confidence := r.confidence;
    new.rating_reasons := r.reasons;
  else
    if new.body is distinct from old.body or new.attachments is distinct from old.attachments then
      new.rating := case when public.cognation_rating_rank(r.rating) > public.cognation_rating_rank(old.rating)
                         then r.rating else old.rating end;
      new.rating_confidence := case when r.confidence = 'low' then 'low' else old.rating_confidence end;
      new.rating_reasons := (select array(select distinct unnest(old.rating_reasons || r.reasons)));
    else
      new.rating := old.rating;
      new.rating_confidence := old.rating_confidence;
      new.rating_reasons := old.rating_reasons;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tower_posts_auto_rate on public.tower_posts;
create trigger tower_posts_auto_rate
before insert or update on public.tower_posts
for each row execute procedure public.tower_posts_apply_rating();

create or replace function public.tower_posts_queue_review()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.cognation_auto_rate(new.body, new.attachments);
  if r.harmful then
    insert into public.rating_review_queue (post_id, kind, reasons) values (new.id, 'harmful', r.reasons);
  elsif r.review and (tg_op = 'INSERT' or not exists (
      select 1 from public.rating_review_queue q
      where q.post_id = new.id and q.status = 'open' and q.kind in ('review','harmful'))) then
    insert into public.rating_review_queue (post_id, kind, reasons) values (new.id, 'review', r.reasons);
  end if;
  return null;
end;
$$;

drop trigger if exists tower_posts_queue_review on public.tower_posts;
create trigger tower_posts_queue_review
after insert or update of body, attachments on public.tower_posts
for each row execute procedure public.tower_posts_queue_review();

-- Existing posts: rate them once now and queue what needs review. Only rows
-- still on the column defaults are touched, so re-running is a no-op.
do $$
declare
  p record;
  r record;
begin
  perform set_config('cognation.rating_decision', 'on', true);
  for p in
    select id, body, attachments from public.tower_posts
    where rating = 'PG-13' and rating_confidence = 'low' and rating_reasons = '{}'
  loop
    select * into r from public.cognation_auto_rate(p.body, p.attachments);
    update public.tower_posts
       set rating = r.rating, rating_confidence = r.confidence,
           rating_reasons = case when r.reasons = '{}' then array['backfill'] else r.reasons end
     where id = p.id;
    if r.harmful or r.review then
      insert into public.rating_review_queue (post_id, kind, reasons)
      values (p.id, case when r.harmful then 'harmful' else 'review' end, r.reasons);
    end if;
  end loop;
  perform set_config('cognation.rating_decision', '', true);
end
$$;

-- 5. Viewer gate --------------------------------------------------------------
create or replace function public.cognation_viewer_can_see(r text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select coalesce(public.cognation_user_age(auth.uid()), 13) as age,
           coalesce((select b.mature_opt_in from public.user_birth b where b.user_id = auth.uid()), false) as opt_in
  )
  select case r
    when 'G' then true   -- under-13 backstop: G and PG only
    when 'PG' then true
    when 'PG-13' then v.age >= 13
    when 'R' then v.age >= 18
    when 'MA' then v.age >= 21 and v.opt_in
    else false
  end from v;
$$;
revoke all on function public.cognation_viewer_can_see(text) from public;
grant execute on function public.cognation_viewer_can_see(text) to anon, authenticated;

drop policy if exists "tower feed is visible to author, friends, and public" on public.tower_posts;
drop policy if exists "tower feed respects rating and age" on public.tower_posts;
create policy "tower feed respects rating and age"
on public.tower_posts for select using (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_posts.author_profile_id
      and profiles.user_id = auth.uid()
  )
  or (
    public.cognation_viewer_can_see(rating)
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

-- 6. MA opt-in (21+ only; 18-20 can never turn it on) -----------------------------
create or replace function public.set_my_mature_opt_in(turn_on boolean)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if turn_on and coalesce(public.cognation_user_age(auth.uid()), 0) < 21 then
    return false;
  end if;
  update public.user_birth set mature_opt_in = coalesce(turn_on, false) where user_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.set_my_mature_opt_in(boolean) from public, anon;
grant execute on function public.set_my_mature_opt_in(boolean) to authenticated;
