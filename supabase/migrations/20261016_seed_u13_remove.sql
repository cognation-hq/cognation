-- Remove live under-13 seed accounts (2026-10-15).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor HERSELF.
-- Never auto-apply. Separate from the birth backfill on purpose.
--
-- Run after (optional): 20261016_seed_birth_backfill.sql
-- Needs: public.profiles (account_kind, seed_fleet_id), auth.users
--
-- WHAT
--   Deletes the under-13 test seed fleet account(s) from auth.users so
--   profiles cascade away. Today that is Sage (seed-0248), handle
--   seed-sage-0248. Also catches any other personal seed whose stored
--   cognation_user_age is under 13 (none expected after backfill skips them).
--
-- HANDLES AFFECTED (canonical fleet map)
--   seed-sage-0248  (seed_fleet_id seed-0248, display_name Sage)
--   + any other seed handle returned by the preview select below
--
-- PREVIEW (read-only — run first)
--   select p.handle, p.display_name, p.seed_fleet_id, public.cognation_user_age(p.user_id) as age
--     from public.profiles p
--    where p.kind = 'personal' and p.account_kind = 'seed'
--      and (
--        p.seed_fleet_id = 'seed-0248'
--        or coalesce(public.cognation_user_age(p.user_id), 12) < 13
--      );
--
-- ROLLBACK
--   Re-provision seed-0248 via SeedOps wave/bind (no undelete of auth.users).

do $remove$
declare
  deleted int := 0;
begin
  with doomed as (
    select p.user_id
      from public.profiles p
     where p.kind = 'personal'
       and p.account_kind = 'seed'
       and p.user_id is not null
       and (
         p.seed_fleet_id = 'seed-0248'
         or coalesce(public.cognation_user_age(p.user_id), 12) < 13
       )
  )
  delete from auth.users u
   using doomed d
   where u.id = d.user_id;

  get diagnostics deleted = row_count;
  raise notice 'seed_u13_remove: deleted % auth.users row(s)', deleted;
end;
$remove$;
