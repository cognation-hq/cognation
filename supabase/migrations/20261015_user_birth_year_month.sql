-- Birth year + month (never the full date). PM option B, 2026-10-14.
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Run order: 1 of 3.
-- Safe to re-run.
--
-- WHAT
--   public.user_birth: one private row per auth user with birth_year + birth_month.
--   - Only the owner can read their own row. anon and other users cannot.
--   - Nobody writes it directly; writes go through the signup trigger or
--     set_my_birth_month(), which both refuse ages under 13 (nothing is stored).
--   - Signup sends birth_year/birth_month in auth metadata; the trigger copies
--     them here and then strips them from auth.users metadata.
--   - Existing accounts have no row until they confirm a month in the app.
--
-- AGE RULE (when in doubt, younger)
--   cognation_user_age(uid) counts the birthday as not yet reached during the
--   birth month, so it can only under-count by one, never over-count.
--   No row => null; callers treat null as 13 (the youngest allowed account).
--
-- VERIFY AFTER
--   select has_table_privilege('anon','public.user_birth','select');           -- false
--   select count(*) from pg_policies where tablename = 'user_birth';           -- 1 (owner select)
--   select raw_user_meta_data ? 'birth_year' from auth.users limit 5;          -- false for new signups
--
-- ROLLBACK
--   drop trigger if exists store_birth_after_auth_signup on auth.users;
--   drop function if exists public.store_birth_for_new_user();
--   drop function if exists public.set_my_birth_month(int, int);
--   drop function if exists public.cognation_user_age(uuid);
--   drop table if exists public.user_birth;

create table if not exists public.user_birth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_year smallint not null check (birth_year between 1900 and 2100),
  birth_month smallint not null check (birth_month between 1 and 12),
  confirmed_at timestamptz not null default now()
);

alter table public.user_birth enable row level security;
revoke all on public.user_birth from anon, authenticated;
grant select on public.user_birth to authenticated;
drop policy if exists "owner reads own birth month" on public.user_birth;
create policy "owner reads own birth month"
on public.user_birth for select to authenticated using (user_id = auth.uid());

-- Conservative whole-year age from year + month (birthday counted only after the birth month ends).
create or replace function public.cognation_age_from_year_month(y int, m int, today date default current_date)
returns int
language sql
immutable
as $$
  select case
    when y is null or m is null then null
    else extract(year from today)::int - y - case when extract(month from today)::int <= m then 1 else 0 end
  end;
$$;

create or replace function public.cognation_user_age(uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select public.cognation_age_from_year_month(b.birth_year, b.birth_month)
  from public.user_birth b where b.user_id = uid;
$$;
revoke all on function public.cognation_user_age(uuid) from public, anon, authenticated;
grant execute on function public.cognation_user_age(uuid) to service_role;

-- Signup: copy year/month from metadata (13+ only), then strip it from auth metadata.
create or replace function public.store_birth_for_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  y int := nullif(new.raw_user_meta_data ->> 'birth_year', '')::int;
  m int := nullif(new.raw_user_meta_data ->> 'birth_month', '')::int;
begin
  if y is not null and m between 1 and 12
     and coalesce(public.cognation_age_from_year_month(y, m), -1) >= 13 then
    insert into public.user_birth (user_id, birth_year, birth_month)
    values (new.id, y, m)
    on conflict (user_id) do nothing;
  end if;
  if new.raw_user_meta_data ? 'birth_year' or new.raw_user_meta_data ? 'birth_month' then
    update auth.users
       set raw_user_meta_data = raw_user_meta_data - 'birth_year' - 'birth_month'
     where id = new.id;
  end if;
  return new;
exception when invalid_text_representation then
  update auth.users
     set raw_user_meta_data = raw_user_meta_data - 'birth_year' - 'birth_month'
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists store_birth_after_auth_signup on auth.users;
create trigger store_birth_after_auth_signup
after insert on auth.users
for each row execute procedure public.store_birth_for_new_user();

-- Existing accounts confirm their month once (owner only; under 13 stores nothing).
create or replace function public.set_my_birth_month(y int, m int)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if m is null or m not between 1 and 12 or y is null
     or coalesce(public.cognation_age_from_year_month(y, m), -1) < 13 then
    return false;
  end if;
  insert into public.user_birth (user_id, birth_year, birth_month)
  values (auth.uid(), y, m)
  on conflict (user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.set_my_birth_month(int, int) from public, anon;
grant execute on function public.set_my_birth_month(int, int) to authenticated;

comment on table public.user_birth is
  'Birth year + month only (never the full date). Owner-read only. Under-13 attempts store nothing.';
