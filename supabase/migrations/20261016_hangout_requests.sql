-- Tower calendar "Book": a visitor asks the Tower owner for a hangout at an open time.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Safe to re-run.
-- Needs 20261016_user_blocks.sql (block_users_related) and public.profiles (id, user_id).
--
-- RULES
--   - Signed-in visitors only; never on your own Tower.
--   - Blocked either way: refused quietly (same error as a bad profile).
--   - One request per visitor per Tower per date+time.
--   - Owner reads requests sent to them; the requester reads their own.
--   - No direct insert/update/delete: only through request_hangout().
--
-- VERIFY AFTER
--   select has_table_privilege('anon','public.hangout_requests','select'); -- false
--   select has_function_privilege('anon','public.request_hangout(uuid,date,text)','execute'); -- false
--
-- ROLLBACK
--   drop function if exists public.request_hangout(uuid, date, text);
--   drop table if exists public.hangout_requests;

create table if not exists public.hangout_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  slot_date date not null,
  slot_time text not null check (slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (requester_user_id, profile_id, slot_date, slot_time),
  check (owner_user_id <> requester_user_id)
);
create index if not exists hangout_requests_owner_idx on public.hangout_requests (owner_user_id, slot_date);
alter table public.hangout_requests enable row level security;
revoke all on public.hangout_requests from anon, authenticated;
grant select on public.hangout_requests to authenticated;
drop policy if exists "owner or requester reads hangout requests" on public.hangout_requests;
create policy "owner or requester reads hangout requests"
on public.hangout_requests for select to authenticated
using (owner_user_id = auth.uid() or requester_user_id = auth.uid());

create or replace function public.request_hangout(p_profile_id uuid, p_date date, p_time text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
  new_id uuid;
begin
  if me is null then raise exception 'sign in required'; end if;
  if p_time is null or p_time !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_date is null or p_date < current_date then raise exception 'bad date'; end if;
  select user_id into owner from public.profiles where id = p_profile_id;
  if owner is null or owner = me or public.block_users_related(me, owner) then
    raise exception 'not available';
  end if;
  insert into public.hangout_requests (profile_id, owner_user_id, requester_user_id, slot_date, slot_time)
  values (p_profile_id, owner, me, p_date, p_time)
  on conflict (requester_user_id, profile_id, slot_date, slot_time) do update set status = public.hangout_requests.status
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.request_hangout(uuid, date, text) from public, anon, authenticated;
grant execute on function public.request_hangout(uuid, date, text) to authenticated;
