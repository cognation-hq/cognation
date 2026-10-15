-- Admin-only, read-only "View as seed (demo)" preview of ECHO + PULSE.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Safe to re-run.
-- Needs 20261015_tower_auto_rate.sql (rating) and 20261015_friend_block_real_seed.sql.
--
-- WHAT
--   - public.cognation_admins: server-side allowlist by auth user id (no emails).
--     RLS on, no policies, no grants: nobody can read or edit it from the app.
--   - am_i_cognation_admin(): true only for allowlisted callers.
--   - admin_seed_preview(fleet_id): STABLE (cannot write). Admin only. Returns the
--     seed's PULSE ring (seed friends + links among them) and an ECHO list (posts
--     by the seed and its seed friends, G/PG/PG-13 only). Only non-real accounts
--     are ever returned. No emails, no user ids. Nothing is written as the seed
--     and Alexa's account / friend graph is untouched.
--
-- ONE-TIME SETUP (Alexa): add your own user id (Supabase dashboard > Authentication
-- > Users > your row > User UID). Do not paste an email here.
--   insert into public.cognation_admins (user_id) values ('<your-user-uid>')
--   on conflict do nothing;
--
-- VERIFY AFTER
--   select has_table_privilege('authenticated', 'public.cognation_admins', 'select');      -- false
--   select has_function_privilege('anon', 'public.admin_seed_preview(text)', 'execute');   -- false
--   From the site signed in as a non-admin: rpc admin_seed_preview -> error 'not_admin'.
--
-- ROLLBACK
--   drop function if exists public.admin_seed_preview(text);
--   drop function if exists public.am_i_cognation_admin();
--   drop table if exists public.cognation_admins;

create table if not exists public.cognation_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.cognation_admins enable row level security;
revoke all on public.cognation_admins from anon, authenticated;

create or replace function public.am_i_cognation_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.cognation_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.am_i_cognation_admin() from public, anon;
grant execute on function public.am_i_cognation_admin() to authenticated;

create or replace function public.admin_seed_preview(fleet_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  seed public.profiles;
  out jsonb;
begin
  if not public.am_i_cognation_admin() then
    raise exception 'not_admin';
  end if;
  select * into seed from public.profiles p
   where p.seed_fleet_id = admin_seed_preview.fleet_id
     and p.kind = 'personal'
     and p.account_kind <> 'real'
   limit 1;
  if seed.id is null then raise exception 'unknown_seed'; end if;

  with friends as (
    select pf.id, pf.user_id, pf.handle, pf.display_name
    from public.friendships f
    join public.profiles pf on pf.user_id = f.friend_user_id and pf.kind = 'personal'
    where f.user_id = seed.user_id
      and pf.account_kind <> 'real'
    order by pf.handle
    limit 24
  ),
  links as (
    select a.id as a_id, b.id as b_id
    from public.friendships ff
    join friends a on a.user_id = ff.user_id
    join friends b on b.user_id = ff.friend_user_id
    where ff.user_id < ff.friend_user_id
  ),
  posts as (
    select t.id, t.body, t.created_at, t.rating, pa.handle as author_handle, pa.display_name as author_name
    from public.tower_posts t
    join public.profiles pa on pa.id = t.author_profile_id
    where pa.account_kind <> 'real'
      and (pa.user_id = seed.user_id or pa.user_id in (select user_id from friends))
      and t.rating in ('G', 'PG', 'PG-13')
    order by t.created_at desc
    limit 50
  )
  select jsonb_build_object(
    'seed', jsonb_build_object('profile_id', seed.id, 'handle', seed.handle,
                               'display_name', seed.display_name, 'fleet_id', seed.seed_fleet_id),
    'pulse', jsonb_build_object(
      'people', coalesce((select jsonb_agg(jsonb_build_object('profile_id', id, 'handle', handle, 'display_name', display_name)) from friends), '[]'::jsonb),
      'links', coalesce((select jsonb_agg(jsonb_build_array(a_id, b_id)) from links), '[]'::jsonb)),
    'echo', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'body', body, 'created_at', created_at,
                      'rating', rating, 'author_handle', author_handle, 'author_name', author_name)) from posts), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;
revoke all on function public.admin_seed_preview(text) from public, anon;
grant execute on function public.admin_seed_preview(text) to authenticated;
