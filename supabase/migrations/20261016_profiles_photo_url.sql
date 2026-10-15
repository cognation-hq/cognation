-- PULSE Tower picture circles: server photo field on profiles.
-- NOT auto-run. Alexa runs this in the Supabase SQL Editor.
-- Owner writes their own photo URL; everyone can read it (same as display_name).
-- Safe to run twice.

alter table public.profiles
  add column if not exists photo_url text;

alter table public.profiles
  drop constraint if exists profiles_photo_url_https;
alter table public.profiles
  add constraint profiles_photo_url_https
  check (
    photo_url is null
    or (char_length(photo_url) <= 500 and photo_url ~ '^https://[^\s"''<>()]+$')
  );

-- Public read of the new column (table-level SELECT was revoked in 20261007_profiles_hide_email).
grant select (photo_url) on public.profiles to anon, authenticated;

-- Owner write: the existing RLS policy "users update their own profiles"
-- (user_id = auth.uid()) already limits UPDATE rows to the owner.
grant update (photo_url) on public.profiles to authenticated;
