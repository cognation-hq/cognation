-- Reserved handle prefixes: "seed-", "seed_", "ops-" and "ops_" belong to SeedOps accounts only.
-- NOT auto-run. Alexa runs this herself in the Supabase SQL Editor.
--
-- Client checks (js/handle-reserved.js) stop real members in the UI. This is the
-- server backstop for anyone calling the API directly.
--
-- SeedOps keeps working:
--   * seedops_upsert_fleet_profile / provision_* run as service_role (rpc) or as
--     postgres (SQL Editor). Neither is a browser role, so trigger 1 lets them
--     through, and session_user is not supabase_auth_admin, so trigger 2 does too.
--   * scripts/seedops-bind-auth.mjs creates a new auth user with a NEUTRAL
--     handle (fleet_<id>), so trigger 2 never sees a reserved handle from it,
--     then sets the seed-/ops- handle with a service_role PATCH on profiles,
--     which trigger 1 lets through. No app_metadata check is needed.
--
-- Case-insensitive. Only blocks a NEW reserved handle: an unchanged existing
-- handle (a seed editing its bio, or a legacy row) is left alone.

-- 1. Browser roles (anon / authenticated) cannot insert or change a profile to a
--    reserved handle. Covers PATCH /profiles (handle edit) and POST /profiles
--    (new professional page).
create or replace function public.profiles_block_reserved_handle()
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
  if new.handle ~* '^(seed|ops)[-_]'
     and (tg_op = 'INSERT' or new.handle is distinct from old.handle) then
    raise exception 'handle_reserved_prefix'
      using hint = 'Handles can''t start with "seed-", "seed_", "ops-" or "ops_".';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_reserved_handle on public.profiles;
create trigger profiles_block_reserved_handle
before insert or update of handle on public.profiles
for each row execute function public.profiles_block_reserved_handle();

-- 2. Neither public signup (/auth/v1/signup) nor Admin API user creation (both
--    run as supabase_auth_admin) can put a reserved handle on a new profile
--    through user metadata. scripts/seedops-bind-auth.mjs creates users with a
--    neutral handle and sets the fleet handle afterwards (see the header).
--    Same body as 20261007_profiles_hide_email.sql, plus the reserved check.
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
  if supplied_handle ~* '^(seed|ops)[-_]'
     and session_user = 'supabase_auth_admin' then
    raise exception 'handle_reserved_prefix';
  end if;
  insert into public.profiles (user_id, kind, handle, display_name)
  values (new.id, 'personal', supplied_handle, left(coalesce(supplied_name, 'Member'), 80));
  return new;
end;
$$;
