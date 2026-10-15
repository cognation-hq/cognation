-- P0 dating kill switch (2026-10-15). NOT auto-run. Alexa runs this in the
-- Supabase SQL editor. Safe to re-run.
--
-- WHY
--   Seeds aged 13 and 17 reached dating (client read every seed as 28).
--   Dating today has no server tables: candidates are built in the browser from
--   public.profiles bios. This adds ONE server flag every dating RPC must check,
--   plus a fail-closed candidate RPC that returns nothing while the flag is off.
--
-- FLIP BACK (only after a SeedOps recheck):
--   update public.cognation_app_flags set enabled = true where key = 'dating';

create table if not exists public.cognation_app_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.cognation_app_flags enable row level security;
revoke all on public.cognation_app_flags from anon, authenticated;

insert into public.cognation_app_flags (key, enabled) values ('dating', false)
on conflict (key) do update set enabled = false, updated_at = now();

create or replace function public.cognation_dating_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enabled from public.cognation_app_flags where key = 'dating'), false);
$$;
revoke all on function public.cognation_dating_enabled() from public;
grant execute on function public.cognation_dating_enabled() to authenticated;

-- Candidate pool: empty while dating is off. (20261016_dating_age_gate.sql
-- replaces the body with the real 18+ seed-only pool, still flag-gated.)
create or replace function public.dating_candidates(p_limit int default 50)
returns table (id uuid, handle text, display_name text, bio text, seed_fleet_id text, age int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.cognation_dating_enabled() then
    return;
  end if;
  return;
end;
$$;
revoke all on function public.dating_candidates(int) from public;
grant execute on function public.dating_candidates(int) to authenticated;

-- VERIFY AFTER
--   select public.cognation_dating_enabled();   -- false
--   select count(*) from public.dating_candidates(50);  -- 0
