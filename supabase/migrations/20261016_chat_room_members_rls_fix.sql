-- Fix: chat_room_members RLS 42P17 "infinite recursion detected in policy".
-- NOT auto-run. Alexa runs this herself in the Supabase SQL editor. Safe to re-run.
--
-- Cause: the SELECT policy on chat_room_members checked membership with a
-- subquery on chat_room_members itself, so Postgres re-applied the same policy
-- forever (42P17). The chat_room_messages policy used the same subquery.
--
-- Fix: a SECURITY DEFINER helper reads membership without RLS, for the calling
-- user only (auth.uid()). Both policies call it. No data changes. Same rules:
-- you see members and messages only in rooms you belong to.
--
-- Needs: 20261015_chat_rooms.sql and 20261015_chat_room_message_reports.sql
--        (messages.hidden_at), block_users_related, cognation_viewer_can_see.
--
-- VERIFY AFTER (as a signed-in member in the app, or via the API):
--   GET /rest/v1/chat_room_members?select=room_id,user_id&limit=1  -> 200, not 42P17
--   select public.is_chat_room_member('<room uuid>');               -- false in SQL editor (no auth.uid())
--
-- ROLLBACK: re-apply the two policies from 20261015_chat_rooms.sql /
--   20261015_chat_room_message_reports.sql, then
--   drop function if exists public.is_chat_room_member(uuid);

create or replace function public.is_chat_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_chat_room_member(uuid) from public, anon;
grant execute on function public.is_chat_room_member(uuid) to authenticated;

drop policy if exists "chat room members readable to fellow members" on public.chat_room_members;
create policy "chat room members readable to fellow members"
on public.chat_room_members for select to authenticated
using (public.is_chat_room_member(room_id));

drop policy if exists "chat room messages readable to members" on public.chat_room_messages;
create policy "chat room messages readable to members"
on public.chat_room_messages for select to authenticated
using (
  public.is_chat_room_member(room_id)
  and public.cognation_viewer_can_see(rating)
  and not public.block_users_related(auth.uid(), author_user_id)
  and hidden_at is null
);
