-- Rating appeals + Investigator decisions (RATING-RULES-DRAFT.md section 5).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Run order: 3 of 3
-- (after 20261015_tower_auto_rate.sql). Safe to re-run.
--
-- WHAT
--   - appeal_my_post_rating(post_id, note): the poster appeals once per post.
--     Queued for Investigator as kind 'appeal'. No account penalties.
--   - investigator_decide_rating(queue_id, decision, new_rating, reason):
--     keep / lower / raise with a one-line reason. service_role only
--     (no admin role exists yet; run from the SQL editor).
--
-- VERIFY AFTER
--   select has_function_privilege('authenticated','public.investigator_decide_rating(uuid,text,text,text)','execute'); -- false
--
-- ROLLBACK
--   drop function if exists public.appeal_my_post_rating(uuid, text);
--   drop function if exists public.investigator_decide_rating(uuid, text, text, text);
--   alter table public.tower_posts drop column if exists appealed_at;
--   alter table public.rating_review_queue drop column if exists note, drop column if exists decision,
--     drop column if exists decision_rating, drop column if exists decision_reason, drop column if exists decided_at;

alter table public.tower_posts add column if not exists appealed_at timestamptz;

alter table public.rating_review_queue
  add column if not exists note text check (note is null or char_length(note) <= 280),
  add column if not exists decision text check (decision in ('keep','lower','raise')),
  add column if not exists decision_rating text check (decision_rating in ('G','PG','PG-13','R','MA','NR')),
  add column if not exists decision_reason text check (decision_reason is null or char_length(decision_reason) <= 200),
  add column if not exists decided_at timestamptz;

create unique index if not exists rating_review_queue_one_appeal
  on public.rating_review_queue (post_id) where kind = 'appeal';

-- appealed_at is set only here; the auto-rate trigger keeps posters from touching ratings.
create or replace function public.appeal_my_post_rating(post_id uuid, note text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  p public.tower_posts;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select t.* into p from public.tower_posts t
    join public.profiles pr on pr.id = t.author_profile_id
   where t.id = appeal_my_post_rating.post_id and pr.user_id = auth.uid();
  if not found then raise exception 'Only the poster can appeal'; end if;
  if p.appealed_at is not null then return false; end if; -- one appeal per post
  perform set_config('cognation.rating_decision', 'on', true);
  update public.tower_posts set appealed_at = now() where id = p.id;
  perform set_config('cognation.rating_decision', '', true);
  insert into public.rating_review_queue (post_id, kind, reasons, note)
  values (p.id, 'appeal', p.rating_reasons, left(nullif(btrim(note), ''), 280));
  return true;
end;
$$;
revoke all on function public.appeal_my_post_rating(uuid, text) from public, anon;
grant execute on function public.appeal_my_post_rating(uuid, text) to authenticated;

-- Stop posters from setting appealed_at themselves (the rating trigger already
-- protects rating columns); outside the appeal function it keeps the old value.
create or replace function public.tower_posts_keep_appealed_at()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.appealed_at := old.appealed_at;
  end if;
  return new;
end;
$$;
drop trigger if exists tower_posts_keep_appealed_at on public.tower_posts;
create trigger tower_posts_keep_appealed_at
before update on public.tower_posts
for each row execute procedure public.tower_posts_keep_appealed_at();

create or replace function public.investigator_decide_rating(
  queue_id uuid, decision text, new_rating text, reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  q public.rating_review_queue;
  cur text;
begin
  if decision not in ('keep','lower','raise') then raise exception 'decision must be keep, lower or raise'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'A one-line reason is required'; end if;
  select * into q from public.rating_review_queue where id = queue_id for update;
  if not found or q.status <> 'open' then raise exception 'No open queue item'; end if;
  select rating into cur from public.tower_posts where id = q.post_id;
  if decision = 'keep' then new_rating := cur; end if;
  if decision = 'lower' and public.cognation_rating_rank(new_rating) >= public.cognation_rating_rank(cur) then
    raise exception 'lower needs a less strict rating';
  end if;
  if decision = 'raise' and public.cognation_rating_rank(new_rating) <= public.cognation_rating_rank(cur) then
    raise exception 'raise needs a stricter rating';
  end if;
  perform set_config('cognation.rating_decision', 'on', true);
  update public.tower_posts
     set rating = new_rating, rating_confidence = 'high',
         rating_reasons = rating_reasons || ('investigator:' || decision)
   where id = q.post_id;
  perform set_config('cognation.rating_decision', '', true);
  update public.rating_review_queue
     set status = 'decided', decision = investigator_decide_rating.decision,
         decision_rating = new_rating, decision_reason = left(btrim(reason), 200), decided_at = now()
   where id = queue_id;
end;
$$;
revoke all on function public.investigator_decide_rating(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.investigator_decide_rating(uuid, text, text, text) to service_role;
