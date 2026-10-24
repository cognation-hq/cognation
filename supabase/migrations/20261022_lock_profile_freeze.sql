-- 20261022_lock_profile_freeze.sql  (PRIORITY. NOT RUN. Alexa runs it in the Supabase SQL Editor.)
-- Run 00_check_freeze_lock_readonly.sql (box: /workspace/freeze-lock-sql/) first and after.
-- Needs: 20261016_investigator_review.sql (adds frozen_at / freeze_reason and
-- am_i_cognation_investigator). The guard below stops with a clear message if it is missing.
-- Safe to run more than once (create or replace + drop trigger if exists).
--
-- The hole: the owner UPDATE policy on public.profiles ("user_id = auth.uid()") has no
-- column limit, and the browser roles hold table-level UPDATE. So a frozen member could
-- PATCH their own Personal row with frozen_at = null and undo an Investigator freeze.
--
-- What it does (same shape as 20261022_01_lock_account_labels.sql):
--   * Browser roles (anon / authenticated) can no longer change frozen_at or freeze_reason.
--     UPDATE: any change to either column is rejected with 'profile_freeze_locked'.
--     INSERT: a new row must arrive unfrozen (both null), or it is rejected the same way.
--   * Not affected:
--       - service_role, postgres and the SQL Editor (no browser JWT role).
--       - The Investigator path: investigator_decide(... 'confirm_illegal' ...) and
--         investigator_incident_takedown(...). Those are security-definer functions, so
--         inside them current_user is the function owner, not 'authenticated', and they
--         already check am_i_cognation_investigator(). This trigger allows the change only
--         when BOTH hold, so a direct API PATCH (current_user = authenticated) is always
--         rejected, even for an Investigator.
--   * The app never writes these two columns, so no normal profile save is affected.
-- Why a trigger and not a REVOKE: revoking one column does not override the browser
-- roles' table-level UPDATE grant (Supabase default; no migration revokes it).
-- The trigger function is NOT security definer on purpose: it must see the caller's
-- current_user to tell a direct PATCH from the Investigator functions.
-- Changes no rows. No removals.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'frozen_at'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'freeze_reason'
  ) or to_regprocedure('public.am_i_cognation_investigator()') is null then
    raise exception 'freeze_lock_needs_investigator_review'
      using hint = 'Run 20261016_investigator_review.sql first (adds frozen_at, freeze_reason, am_i_cognation_investigator).';
  end if;
end
$$;

create or replace function public.profiles_lock_freeze_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  -- Server: service_role, postgres, SQL Editor.
  if jwt_role not in ('anon', 'authenticated') then
    return new;
  end if;
  -- Investigator path: inside a security-definer server function, called by an Investigator.
  if current_user not in ('anon', 'authenticated')
     and public.am_i_cognation_investigator() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.frozen_at is distinct from old.frozen_at
       or new.freeze_reason is distinct from old.freeze_reason then
      raise exception 'profile_freeze_locked'
        using hint = 'frozen_at and freeze_reason are set by Cognation review, not by the account.';
    end if;
  elsif new.frozen_at is not null or new.freeze_reason is not null then
    raise exception 'profile_freeze_locked'
      using hint = 'frozen_at and freeze_reason are set by Cognation review, not by the account.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_a_lock_freeze_columns on public.profiles;
create trigger profiles_a_lock_freeze_columns
before insert or update on public.profiles
for each row execute function public.profiles_lock_freeze_columns();
