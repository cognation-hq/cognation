-- Profiles: browser roles can't set account_kind or seed_fleet_id.
-- Held for Alexa to run in the Supabase SQL editor. Safe to re-run.
--
-- Why: "users update their own profiles" (20260924_cognation_social.sql) checks
-- only user_id = auth.uid(), and there are no column-level UPDATE grants or
-- guard triggers. A signed-in person can PATCH their own row to
-- account_kind = 'seed' / 'ops' (Demo badge, gets past the real/seed friend
-- block in send_friend_request) or claim a seed_fleet_id, which SeedOps
-- provisioning looks rows up by. The professional-profile INSERT policy has the
-- same gap.
--
-- What: a BEFORE INSERT OR UPDATE trigger. When the statement runs as the
-- browser roles (anon / authenticated), it rejects:
--   UPDATE that changes account_kind or seed_fleet_id;
--   INSERT with account_kind other than 'real' or a non-null seed_fleet_id.
-- service_role (SeedOps scripts), the SQL editor (postgres) and the
-- service_role-only SECURITY DEFINER SeedOps functions (which run as their
-- owner) are not affected. The signup trigger inserts with the defaults
-- ('real', null), so sign-up is not affected. Other profile edits (name,
-- handle, bio) are unchanged.
--
-- Verify after:
--   select tgname from pg_trigger
--    where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_lock_seed_columns';   -- 1 row
--   As a signed-in user (browser / REST with the user's JWT):
--     PATCH /rest/v1/profiles?id=eq.<own id>  {"account_kind":"seed"}   -> error 42501
--     PATCH /rest/v1/profiles?id=eq.<own id>  {"seed_fleet_id":"x"}     -> error 42501
--     PATCH /rest/v1/profiles?id=eq.<own id>  {"bio":"..."}             -> 200 (still works)
--
-- Rollback:
--   drop trigger if exists profiles_lock_seed_columns on public.profiles;
--   drop function if exists public.profiles_lock_seed_columns();

create or replace function public.profiles_lock_seed_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.account_kind is distinct from 'real'::public.cognation_account_kind
       or new.seed_fleet_id is not null then
      raise exception 'account_kind and seed_fleet_id are set by SeedOps only'
        using errcode = '42501';
    end if;
  elsif new.account_kind is distinct from old.account_kind
     or new.seed_fleet_id is distinct from old.seed_fleet_id then
    raise exception 'account_kind and seed_fleet_id are set by SeedOps only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_lock_seed_columns on public.profiles;
create trigger profiles_lock_seed_columns
before insert or update on public.profiles
for each row execute procedure public.profiles_lock_seed_columns();
