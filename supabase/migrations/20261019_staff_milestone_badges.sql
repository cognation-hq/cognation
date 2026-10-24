-- Staff milestone badges. Not auto-run. No admin site and no mail vendor.
-- Staff: Supabase Auth app_metadata.staff = true, then sign in again.
-- The page opens mailto (same path as contact.html). Nothing is sent until that mail is sent.

create table if not exists public.milestone_awards (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 48),
  created_by uuid not null default auth.uid(),
  applied_at timestamptz
);

alter table public.milestone_awards enable row level security;
revoke all on public.milestone_awards from anon, authenticated;

create or replace function public.cognation_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'staff') = 'true', false);
$$;
revoke all on function public.cognation_is_staff() from public, anon;
grant execute on function public.cognation_is_staff() to authenticated;

create or replace function public.staff_award_milestone(recipient_email text, title text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare uid uuid; tid text; aid uuid;
begin
  if not public.cognation_is_staff() then raise exception 'not_staff'; end if;
  tid := left(btrim(coalesce(title, '')), 48);
  if tid = '' then raise exception 'title'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(recipient_email)) limit 1;
  if uid is null then raise exception 'no_user'; end if;
  insert into public.milestone_awards (recipient_id, title) values (uid, tid) returning id into aid;
  return aid;
end;
$$;
revoke all on function public.staff_award_milestone(text, text) from public, anon;
grant execute on function public.staff_award_milestone(text, text) to authenticated;

create or replace function public.apply_milestone(award_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare t text;
begin
  update public.milestone_awards
     set applied_at = coalesce(applied_at, now())
   where id = award_id and recipient_id = auth.uid()
   returning title into t;
  return t;
end;
$$;
revoke all on function public.apply_milestone(uuid) from public, anon;
grant execute on function public.apply_milestone(uuid) to authenticated;

create or replace function public.applied_milestones_for_profile(p_profile_id uuid)
returns table (id uuid, title text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.title
  from public.milestone_awards a
  join public.profiles p on p.user_id = a.recipient_id
  where p.id = p_profile_id and a.applied_at is not null
  order by a.applied_at desc
  limit 8;
$$;
revoke all on function public.applied_milestones_for_profile(uuid) from public, anon;
grant execute on function public.applied_milestones_for_profile(uuid) to anon, authenticated;
