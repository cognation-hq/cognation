-- 20261022_seed_pro_demo_fix.sql  (ONE-OFF WRITE. NOT RUN. Alexa runs it in the Supabase SQL Editor.)
-- Box copy: /workspace/seed-pro-demo-fix-sql/01_fix_seed_pro_demo.sql
-- Run supabase/checks/20261022_seed_pro_demo_check_readonly.sql first and after.
--
-- What it fixes: 3 seed Professional pages were saved with the column default
-- account_kind 'real', so they show no Demo badge and slip through seed filters:
--   seed-shawn-0251-pro, seed-alex-0003-pro, seed-skye-0252-pro
-- It sets each one's account_kind to its owner's Personal page label ('seed').
--
-- Scope (every guard must hold, or the row is left alone):
--   * handle is one of the 3 above (by exact handle; nothing else is touched)
--   * the page is a Professional page
--   * the owner's Personal page (same user, different row) is labelled 'seed' or 'ops'
--     and has a fleet id, so a real member's page can never be relabelled
--   * the page is still stored as 'real' (so running it again changes 0 rows)
--
-- seed_fleet_id is left as it is (null) on purpose: profiles_seed_fleet_id_uidx
-- (20261002_seedops_provision_wave.sql) makes a fleet id unique, and the owner's
-- Personal page already holds it. The Demo badge reads account_kind, so 'seed' is enough.
--
-- The SQL Editor runs as postgres, so the label lock (#240's 01_lock_account_labels) does
-- not block it. Order relative to #240 does not matter.
-- No deletes, no other columns, no emails. One transaction: check the 3 returned rows,
-- then commit (or rollback).

begin;

update public.profiles pro
   set account_kind = per.account_kind
  from public.profiles per
 where pro.handle in ('seed-shawn-0251-pro', 'seed-alex-0003-pro', 'seed-skye-0252-pro')
   and pro.kind = 'professional'
   and pro.account_kind = 'real'
   and per.user_id = pro.user_id
   and per.kind = 'personal'
   and per.id <> pro.id
   and per.account_kind in ('seed', 'ops')
   and per.seed_fleet_id is not null
returning pro.id, pro.handle, pro.account_kind;

-- Expect at most 3 rows (0 if already fixed). If anything else shows: rollback;
commit;
