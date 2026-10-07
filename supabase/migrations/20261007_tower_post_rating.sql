-- Tower posts: optional age rating (G / PG / PG-13 / R).
-- Held for Alexa to run in the Supabase SQL editor. Safe to re-run.
--
-- rating is nullable with no default: null means unrated. Existing posts stay
-- unrated (null). Nothing in the app writes or reads this column yet; until it
-- does, the client keyword check (js/age-floor-keywords.js) is still the only
-- Tower age screen. Who sets the rating (author, SeedOps, moderator) is Alexa's
-- call and comes in a later PR. The existing tower_posts RLS policies cover
-- the new column, so no policy changes are needed.
--
-- Verify after (counts / booleans only):
--   select count(*) filter (where rating is null) as unrated, count(*) as total
--     from public.tower_posts;                                   -- unrated = total on first run
--   select column_default is null as no_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'tower_posts' and column_name = 'rating';   -- true, YES
--   select conname from pg_constraint
--    where conrelid = 'public.tower_posts'::regclass and conname = 'tower_posts_rating_check';  -- 1 row
--
-- Rollback (drops any ratings that were set):
--   alter table public.tower_posts drop constraint if exists tower_posts_rating_check;
--   alter table public.tower_posts drop column if exists rating;

alter table public.tower_posts
  add column if not exists rating text;

alter table public.tower_posts
  alter column rating drop default;

alter table public.tower_posts
  drop constraint if exists tower_posts_rating_check;
alter table public.tower_posts
  add constraint tower_posts_rating_check
  check (rating is null or rating in ('G', 'PG', 'PG-13', 'R'));

comment on column public.tower_posts.rating is
  'Optional age rating: G, PG, PG-13 or R. Null means unrated.';
