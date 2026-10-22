-- Item 4: seed/ops accounts may give their own pages a "seed-" / "seed_" / "ops-" / "ops_"
-- handle again (e.g. a seed's Pro page seed-skye-0252-pro). Real members stay blocked.
-- NOT RUN. For PM review; Alexa runs it herself in the Supabase SQL Editor if approved.
--
-- Replaces public.profiles_block_reserved_handle() from 20261020_reserved_handle_prefix.sql.
-- Trigger 2 (create_profile_for_new_user, signup) is NOT changed: signup stays blocked
-- for everyone.
--
-- What changes, only for browser roles (anon / authenticated):
--   a. A new or changed reserved handle is allowed ONLY when the caller is signed in,
--      the row belongs to the caller (new.user_id = auth.uid()), and the caller's OWN
--      Personal page is fleet-labelled (account_kind 'seed'/'ops' or a seed_fleet_id).
--      Everyone else gets the same 'handle_reserved_prefix' error as today.
--   b. A NEW Professional page whose owner is fleet-labelled is stored with the owner's
--      account_kind and seed_fleet_id instead of the column default 'real'. That is the
--      root cause of #233 / #231 (3 seed Pro pages stored 'real'), so it cannot recur.
--      Only fills in a 'real' default; never touches real members' pages.
-- service_role / postgres (SeedOps scripts) are untouched: they return early as before.
-- Reads one row of public.profiles (security definer so RLS cannot hide the owner row).

create or replace function public.profiles_block_reserved_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  caller uuid := auth.uid();
  owner_kind public.cognation_account_kind;
  owner_fleet text;
  owner_is_fleet boolean := false;
begin
  if jwt_role not in ('anon', 'authenticated') then
    return new;
  end if;

  if jwt_role = 'authenticated' and caller is not null and new.user_id = caller then
    select p.account_kind, p.seed_fleet_id
      into owner_kind, owner_fleet
      from public.profiles p
     where p.user_id = caller and p.kind = 'personal'
     limit 1;
    owner_is_fleet := coalesce(owner_kind in ('seed', 'ops'), false)
                      or coalesce(btrim(owner_fleet), '') <> '';
  end if;

  if new.handle ~* '^(seed|ops)[-_]'
     and (tg_op = 'INSERT' or new.handle is distinct from old.handle)
     and not owner_is_fleet then
    raise exception 'handle_reserved_prefix'
      using hint = 'Handles can''t start with "seed-", "seed_", "ops-" or "ops_".';
  end if;

  if tg_op = 'INSERT' and new.kind = 'professional' and owner_is_fleet
     and coalesce(new.account_kind, 'real') = 'real' then
    new.account_kind := case when owner_kind in ('seed', 'ops') then owner_kind else 'seed' end;
    new.seed_fleet_id := coalesce(nullif(btrim(new.seed_fleet_id), ''), owner_fleet);
  end if;

  return new;
end;
$$;

-- Same trigger as 20261020 (re-created so the definition is in one place).
drop trigger if exists profiles_block_reserved_handle on public.profiles;
create trigger profiles_block_reserved_handle
before insert or update of handle on public.profiles
for each row execute function public.profiles_block_reserved_handle();


-- ---------------------------------------------------------------------------
-- Label lock (PM, Oct 22). Browser roles (anon / authenticated) cannot write
-- account_kind or seed_fleet_id on public.profiles:
--   * UPDATE: any change to either column is rejected ('profile_label_locked').
--   * INSERT: a new row must arrive with the defaults (account_kind 'real' or
--     null, no seed_fleet_id). A fleet owner's new Pro page still gets the
--     owner's labels, filled in by profiles_block_reserved_handle above from the
--     owner's own Personal row, never from what the browser sent.
-- service_role, postgres and the SQL editor (no browser JWT role) are unchanged,
-- so SeedOps scripts and seed-pulse-sql/02 can still set labels.
-- Why a trigger and not a column REVOKE: the browser roles hold table-level
-- UPDATE (Supabase default; no migration revokes it), and revoking one column
-- does not override a table-level grant. Swapping to a column allow-list would
-- risk breaking profile saves.
-- Name starts "profiles_a_" so it fires before "profiles_block_reserved_handle"
-- (Postgres fires same-timing row triggers in name order).
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
