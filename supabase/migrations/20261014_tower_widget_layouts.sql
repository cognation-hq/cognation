-- Tower widget layouts: one saved layout row per profile. A profile is already one
-- page (kind = personal | professional), so profile_id = one row per profile per page.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- layout jsonb: { "<widgetId>": { "x": n, "y": n, "z": n, "tilt": n }, ... }
--   Same shape as the web widgetLayout. Free x/y (no grid format).
--
-- RLS
--   read : anyone who can see the profile (the policy checks the profile through
--          profiles' own RLS/grants, so it follows profile visibility).
--   write: only the profile's owner (profiles.user_id = auth.uid()).

create table if not exists public.tower_widget_layouts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.tower_widget_layouts enable row level security;

drop policy if exists "tower layouts readable with profile" on public.tower_widget_layouts;
create policy "tower layouts readable with profile"
on public.tower_widget_layouts for select
using (exists (select 1 from public.profiles p where p.id = tower_widget_layouts.profile_id));

drop policy if exists "tower layouts owner insert" on public.tower_widget_layouts;
create policy "tower layouts owner insert"
on public.tower_widget_layouts for insert
with check (exists (select 1 from public.profiles p where p.id = tower_widget_layouts.profile_id and p.user_id = auth.uid()));

drop policy if exists "tower layouts owner update" on public.tower_widget_layouts;
create policy "tower layouts owner update"
on public.tower_widget_layouts for update
using (exists (select 1 from public.profiles p where p.id = tower_widget_layouts.profile_id and p.user_id = auth.uid()))
with check (exists (select 1 from public.profiles p where p.id = tower_widget_layouts.profile_id and p.user_id = auth.uid()));

drop policy if exists "tower layouts owner delete" on public.tower_widget_layouts;
create policy "tower layouts owner delete"
on public.tower_widget_layouts for delete
using (exists (select 1 from public.profiles p where p.id = tower_widget_layouts.profile_id and p.user_id = auth.uid()));

grant select on public.tower_widget_layouts to anon, authenticated;
grant insert, update, delete on public.tower_widget_layouts to authenticated;

create or replace function public.touch_tower_widget_layout()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tower_widget_layouts_touch on public.tower_widget_layouts;
create trigger tower_widget_layouts_touch
before update on public.tower_widget_layouts
for each row execute function public.touch_tower_widget_layout();

-- VERIFY (expect: table exists, rls = true, 4 policies)
--   select relrowsecurity from pg_class where oid = 'public.tower_widget_layouts'::regclass;
--   select policyname, cmd from pg_policies where tablename = 'tower_widget_layouts' order by 1;
--   -- as anon (SQL editor: set role anon;) a select works, an insert fails:
--   -- set role anon; select count(*) from public.tower_widget_layouts; reset role;
--
-- ROLLBACK (drops saved layouts; browsers keep their localStorage copy)
--   drop trigger if exists tower_widget_layouts_touch on public.tower_widget_layouts;
--   drop function if exists public.touch_tower_widget_layout();
--   drop table if exists public.tower_widget_layouts;
