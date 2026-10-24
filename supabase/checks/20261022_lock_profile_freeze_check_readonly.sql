-- Repo copy of the read-only pre-check for 20261022_lock_profile_freeze.sql (box: /workspace/freeze-lock-sql/00_check_freeze_lock_readonly.sql).
-- 00_check_freeze_lock_readonly.sql  (READ-ONLY. Changes nothing. Safe any time.)
-- Shows what controls writes to public.profiles.frozen_at / freeze_reason today.
-- Returns role names, policy/trigger/function names and counts only. No emails, no user data.

-- F1. Do the freeze columns exist? (Both rows expected. None = 20261016_investigator_review.sql not run.)
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles'
   and column_name in ('frozen_at', 'freeze_reason')
 order by column_name;

-- F2. Table-level grants for the browser roles on profiles.
--     can_update = true for authenticated is the reason a column REVOKE alone cannot fix this.
select r.rolname as role,
       has_table_privilege(r.rolname, 'public.profiles', 'select') as can_select,
       has_table_privilege(r.rolname, 'public.profiles', 'insert') as can_insert,
       has_table_privilege(r.rolname, 'public.profiles', 'update') as can_update
  from pg_roles r
 where r.rolname in ('anon', 'authenticated', 'service_role')
 order by r.rolname;

-- F3. Column-level UPDATE on the freeze columns (only meaningful if the columns exist).
select grantee, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'profiles'
   and column_name in ('frozen_at', 'freeze_reason')
   and grantee in ('anon', 'authenticated')
 order by grantee, column_name, privilege_type;

-- F4. Row policies on profiles (the owner UPDATE policy has no column limit).
select policyname, cmd, roles, qual as using_expr, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'profiles'
 order by cmd, policyname;

-- F5. Triggers on profiles, in firing order (same timing fires by name).
select t.tgname as trigger_name, p.proname as function_name,
       p.prosecdef as security_definer, t.tgenabled as enabled
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
 order by t.tgname;

-- F6. Is the freeze lock installed? (false before the migration, true after.)
select exists (
         select 1 from pg_trigger
          where tgrelid = 'public.profiles'::regclass
            and tgname = 'profiles_a_lock_freeze_columns' and not tgisinternal
       ) as has_freeze_lock,
       to_regprocedure('public.am_i_cognation_investigator()') is not null as has_investigator_check;

-- F7. Server functions that write the freeze columns (expect the two Investigator functions).
select p.proname as function_name, p.prosecdef as security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and pg_get_functiondef(p.oid) ~* 'frozen_at\s*='
 order by p.proname;

-- F8. How many accounts are frozen right now (count only).
select count(*) filter (where frozen_at is not null) as frozen_profiles
  from public.profiles;
