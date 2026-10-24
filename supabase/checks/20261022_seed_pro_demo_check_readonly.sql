-- 20261022_seed_pro_demo_check_readonly.sql  (READ-ONLY. Changes nothing. Safe any time.)
-- Box copy: /workspace/seed-pro-demo-fix-sql/00_check_seed_pro_demo_readonly.sql
-- The 3 seed Professional pages that are stored as real (so they show no Demo badge):
--   seed-shawn-0251-pro, seed-alex-0003-pro, seed-skye-0252-pro
-- Shows page ids, handles and labels only. No emails, no user data.

-- C1. The 3 pages and their owner's Personal page.
--     needs_fix = true means the fix will relabel this row.
select pro.id            as pro_id,
       pro.handle        as pro_handle,
       pro.kind          as pro_kind,
       pro.account_kind  as pro_account_kind,
       pro.seed_fleet_id as pro_fleet_id,
       per.handle        as owner_personal_handle,
       per.account_kind  as owner_account_kind,
       per.seed_fleet_id as owner_fleet_id,
       (pro.kind = 'professional'
        and pro.account_kind = 'real'
        and per.account_kind in ('seed', 'ops')
        and per.seed_fleet_id is not null) as needs_fix
  from public.profiles pro
  left join public.profiles per
         on per.user_id = pro.user_id
        and per.kind = 'personal'
        and per.id <> pro.id
 where pro.handle in ('seed-shawn-0251-pro', 'seed-alex-0003-pro', 'seed-skye-0252-pro')
 order by pro.handle;

-- C2. Safety: any OTHER 'seed-' page still stored as real. Expect 0 rows.
--     If rows show here, tell Alexa; the fix does NOT touch them.
select pro.id as pro_id, pro.handle as pro_handle, pro.kind as pro_kind
  from public.profiles pro
 where pro.handle like 'seed-%'
   and pro.account_kind = 'real'
   and pro.handle not in ('seed-shawn-0251-pro', 'seed-alex-0003-pro', 'seed-skye-0252-pro')
 order by pro.handle;

-- C3. Count of the 3 pages still needing the fix (3 before, 0 after).
select count(*) as still_real
  from public.profiles pro
 where pro.handle in ('seed-shawn-0251-pro', 'seed-alex-0003-pro', 'seed-skye-0252-pro')
   and pro.account_kind = 'real';
