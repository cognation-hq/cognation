-- Profiles: stop public read of email, and stop using the email as a display name.
-- Run once in the Supabase SQL editor while signed in to the Cognation project.
-- Safe to re-run: every step checks first or uses statements that are idempotent.
--
-- WHY
--   20260924_cognation_social.sql:126-127 made every column of public.profiles
--   readable to everyone ("profiles are readable" ... using (true)), and Supabase's
--   default grants give anon + authenticated table-level SELECT. The live table
--   also has an `email` column. NOTE: that column is not created by any migration
--   in this repo (schema drift); it was added on the live project directly. This
--   file does not drop it. It only stops anon/authenticated from reading it.
--
-- WHAT
--   1. Table-level SELECT on public.profiles is revoked from anon + authenticated,
--      then SELECT is granted back on an explicit list of every non-email column.
--      RLS policies are unchanged. service_role (SeedOps scripts) is unchanged.
--      A signed-in user who needs their own email reads it from auth
--      (supabase.auth.getUser() / GET /auth/v1/user), never from profiles.
--   2. The signup trigger function falls back to 'Member' instead of the start
--      of the email when no display_name is supplied.
--   3. One-time cleanup: real profiles whose display_name equals the start of
--      their email are renamed to 'Member'. Only a row count is reported.
--
-- IMPORTANT FOR FUTURE MIGRATIONS
--   Any new column added to public.profiles must also be granted with
--   `grant select (new_col) on public.profiles to anon, authenticated;`
--   or browser reads that select it will fail with "permission denied".
--
-- BEFORE RUNNING (keep the output for rollback of step 2):
--   select pg_get_functiondef('public.create_profile_for_new_user()'::regprocedure);
--
-- VERIFY AFTER
--   a) In the SQL editor (counts only):
--        select has_column_privilege('anon', 'public.profiles', 'email', 'select')          as anon_email,     -- expect false
--               has_column_privilege('authenticated', 'public.profiles', 'email', 'select') as auth_email,     -- expect false
--               has_column_privilege('anon', 'public.profiles', 'display_name', 'select')   as anon_name;      -- expect true
--   b) From any browser/terminal with the site's public key:
--        GET /rest/v1/profiles?select=email&limit=1   -> 401/403, code 42501 (permission denied)
--        GET /rest/v1/profiles?select=id,display_name,account_kind&limit=1 -> 200
--   c) On the live site: sign in, Tower profile loads and saves, Circle loads,
--      SIGNAL News comments load.
--
-- ROLLBACK
--   Step 1 (restores the previous open read, including email -- only if something breaks):
--     grant select on public.profiles to anon, authenticated;
--   Step 2: re-run the function definition captured in BEFORE RUNNING.
--   Step 3 is a data change; there is no automatic rollback (names were the
--   start of the email, which is what this fix removes).

-- 1. Column-level SELECT --------------------------------------------------------
do $$
declare
  allowed text[] := array[
    'id', 'user_id', 'kind', 'handle', 'display_name', 'bio',
    'created_at', 'updated_at', 'account_kind', 'seed_fleet_id'
  ];
  col text;
  extra text;
begin
  revoke select on public.profiles from anon, authenticated;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) then
    revoke select (email) on public.profiles from anon, authenticated;
  end if;

  foreach col in array allowed loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = col
    ) then
      execute format('grant select (%I) on public.profiles to anon, authenticated', col);
    else
      raise notice 'profiles column % not found; skipped', col;
    end if;
  end loop;

  -- Report (names only) any live column that is neither granted nor email,
  -- so drift is visible instead of silently unreadable.
  for extra in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name <> 'email' and not (column_name = any (allowed))
  loop
    raise notice 'profiles column % exists but is not granted to anon/authenticated', extra;
  end loop;
end
$$;

-- 2. Signup trigger: 'Member' fallback ------------------------------------------
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  supplied_handle text := lower(coalesce(new.raw_user_meta_data ->> 'handle', ''));
  supplied_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  supplied_handle := regexp_replace(supplied_handle, '[^a-z0-9_-]', '', 'g');
  if char_length(supplied_handle) < 3 then
    supplied_handle := 'member_' || replace(left(new.id::text, 8), '-', '');
  end if;
  if supplied_handle !~ '^[a-z0-9_-]{3,40}$' then
    raise exception 'A valid handle is required';
  end if;
  insert into public.profiles (user_id, kind, handle, display_name)
  values (new.id, 'personal', supplied_handle, left(coalesce(supplied_name, 'Member'), 80));
  return new;
end;
$$;

-- 3. One-time cleanup of email-derived names (real accounts only) -------------
do $$
declare
  renamed integer := 0;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_kind'
  ) then
    execute $q$
      update public.profiles
         set display_name = 'Member'
       where account_kind = 'real'
         and email is not null
         and display_name = split_part(email, '@', 1)
    $q$;
    get diagnostics renamed = row_count;
  end if;
  raise notice 'profiles renamed to Member: %', renamed;
end
$$;
