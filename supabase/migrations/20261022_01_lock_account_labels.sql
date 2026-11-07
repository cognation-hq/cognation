-- 01_lock_account_labels.sql  (TOP PRIORITY. NOT RUN. Alexa runs it in the Supabase SQL Editor.)
-- Self-contained: needs nothing else in this folder. Safe to run more than once.
--
-- What it does: browser roles (anon / authenticated) can no longer write
-- account_kind or seed_fleet_id on public.profiles.
--   * UPDATE: any change to either column is rejected with 'profile_label_locked'.
--   * INSERT: a new row must arrive with the defaults (account_kind 'real' or null,
--     no seed_fleet_id), or it is rejected the same way.
-- Not affected: service_role, postgres and the SQL Editor (no browser JWT role), so
-- SeedOps scripts and seed-pulse-sql/02 can still set labels. The app never writes
-- these two columns, so no normal profile save is affected.
--
-- Why a trigger and not a REVOKE: the browser roles hold table-level UPDATE/INSERT
-- (Supabase default; no migration revokes it), and revoking one column does not
-- override a table-level grant.
-- Name starts "profiles_a_" so it fires before "profiles_block_reserved_handle"
-- (Postgres fires same-timing row triggers in name order). That lets 02 fill in a
-- fleet owner's labels on a new Pro page after this check, on the server.
-- Idempotent: create or replace + drop trigger if exists.

create or replace function public.profiles_lock_account_labels()
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
  if jwt_role not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.account_kind is distinct from old.account_kind
       or new.seed_fleet_id is distinct from old.seed_fleet_id then
      raise exception 'profile_label_locked'
        using hint = 'account_kind and seed_fleet_id are set by Cognation, not by the account.';
    end if;
  elsif coalesce(new.account_kind::text, 'real') <> 'real'
        or coalesce(btrim(new.seed_fleet_id), '') <> '' then
    raise exception 'profile_label_locked'
      using hint = 'account_kind and seed_fleet_id are set by Cognation, not by the account.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_a_lock_account_labels on public.profiles;
create trigger profiles_a_lock_account_labels
before insert or update on public.profiles
for each row execute function public.profiles_lock_account_labels();
