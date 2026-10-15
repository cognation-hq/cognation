-- Dating 18+ server gate (2026-10-15). NOT auto-run. Alexa runs this in the
-- Supabase SQL editor AFTER 20261016_dating_off.sql and
-- 20261016_seed_birth_backfill.sql. Safe to re-run. Does NOT turn dating on.
--
-- ROOT CAUSE
--   The client gated dating on member_age from auth user_metadata / the local
--   profile cache. Seed metadata held a stale member_age = 28, so every seed
--   read as 28 and 13/17-year-old seeds passed the 18+ check. The real age is
--   in public.user_birth (year + month), read by public.cognation_user_age().
--
-- WHAT
--   public.dating_candidates(): fail-closed 18+ candidate pool.
--     - dating flag off               -> nothing
--     - viewer age unknown or < 18    -> nothing
--     - viewer not a seed             -> nothing (seed<->seed only during beta)
--     - candidates: seeds only, age KNOWN and >= 18, never the viewer
--   public.cognation_dating_age_ok(uuid): 18+ with known age (for any future
--   dating table RLS: `using (public.cognation_dating_age_ok(auth.uid()))`).

create or replace function public.cognation_dating_age_ok(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.cognation_user_age(p_user) >= 18, false);
$$;
revoke all on function public.cognation_dating_age_ok(uuid) from public;
grant execute on function public.cognation_dating_age_ok(uuid) to authenticated;

create or replace function public.dating_candidates(p_limit int default 50)
returns table (id uuid, handle text, display_name text, bio text, seed_fleet_id text, age int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
begin
  if v_viewer is null then return; end if;
  if not public.cognation_dating_enabled() then return; end if;
  if not public.cognation_dating_age_ok(v_viewer) then return; end if;
  if not exists (
    select 1 from public.profiles vp
     where vp.user_id = v_viewer and vp.kind = 'personal' and vp.account_kind = 'seed'
  ) then
    return;  -- real users: no seed candidates; real<->real dating not in beta
  end if;

  return query
  select p.id, p.handle, p.display_name, p.bio, p.seed_fleet_id,
         public.cognation_user_age(p.user_id)::int
    from public.profiles p
   where p.kind = 'personal'
     and p.account_kind = 'seed'
     and p.user_id is not null
     and p.user_id <> v_viewer
     and public.cognation_user_age(p.user_id) is not null
     and public.cognation_user_age(p.user_id) >= 18
   order by p.seed_fleet_id
   limit least(greatest(coalesce(p_limit, 50), 1), 250);
end;
$$;
revoke all on function public.dating_candidates(int) from public;
grant execute on function public.dating_candidates(int) to authenticated;

-- VERIFY AFTER (dating flag still off -> every call returns 0 rows)
--   select count(*) from public.dating_candidates(250);   -- 0 while off
-- With the flag on in a test session as an 18+ seed:
--   select count(*) from public.dating_candidates(250) where age < 18 or age is null;  -- 0

-- Access age: missing/unreadable birth year counts as 13 (no dating, no 18+/MA)
-- but is NOT under-13 (no block; the one-time birth ask at sign-in stays).
-- There is no stored default age 28 in SQL; it lived in seed auth metadata
-- (member_age), which no server gate reads.
create or replace function public.cognation_access_age(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.cognation_user_age(p_user), 13)::int;
$$;
revoke all on function public.cognation_access_age(uuid) from public;
grant execute on function public.cognation_access_age(uuid) to authenticated;
