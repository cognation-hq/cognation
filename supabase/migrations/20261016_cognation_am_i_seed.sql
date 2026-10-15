-- cognation_am_i_seed — authenticated self check for ECHO friend shares (2026-10-15).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor.
-- Needs: public.cognation_user_is_real (20261015_friend_block_missing_profile.sql).
-- Safe to re-run.
--
-- WHAT
--   public.cognation_am_i_seed() → true when the signed-in user is NOT a real
--   account (seed, ops, or missing personal profile). Used by ECHO so seed
--   right-swipes never write friend shares, even when client profile fields
--   (accountKind / isSeed / seedFleetId / handle) are absent.
--   Fail-closed: signed-out → true (treat as seed / do not share).
--
-- VERIFY AFTER
--   select has_function_privilege('authenticated', 'public.cognation_am_i_seed()', 'execute'); -- true
--   -- as a real user: select public.cognation_am_i_seed(); -- false
--   -- as a seed:      select public.cognation_am_i_seed(); -- true
--
-- ROLLBACK
--   drop function if exists public.cognation_am_i_seed();

create or replace function public.cognation_am_i_seed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then true
    else not public.cognation_user_is_real(auth.uid())
  end;
$$;

revoke all on function public.cognation_am_i_seed() from public, anon;
grant execute on function public.cognation_am_i_seed() to authenticated;

comment on function public.cognation_am_i_seed() is
  'True when the caller is seed/ops/unknown (not real). Fail-closed when signed out. ECHO friend-share gate.';
