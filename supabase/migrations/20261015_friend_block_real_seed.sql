-- Real <-> seed friend block, enforced everywhere (not only in send_friend_request).
-- NOT auto-run. Alexa runs this in the Supabase SQL editor. Safe to re-run.
--
-- WHY
--   20260924_cognation_social.sql:142 "users send requests" let a signed-in user
--   INSERT into friend_requests directly, skipping send_friend_request's
--   real/seed check (20261002_seedops_account_kind.sql). accept_friend_request
--   (20260924_cognation_social.sql:218) never checked account kind either.
--
-- RULE  real <-> real and non-real <-> non-real only (seed <-> seed stays allowed).
--       Kind = the user's personal profile account_kind; missing => 'real'.
--       'ops' counts as non-real, same as send_friend_request.
--
-- RUN IN THIS ORDER
--   STEP 0  Count existing mixed pairs (read-only). Note the numbers.
--           (The SQL editor shows only the last result, so the same count is
--           repeated as the final statement of this file.)
--   STEPS 1-4  Close the holes (policy, accept check, triggers).
--   STEP 5  Cleanup DELETE is commented out. Uncomment and run it only after
--           reading the STEP 0 counts.
--
-- VERIFY AFTER
--   select count(*) from pg_policies
--    where tablename = 'friend_requests' and policyname = 'users send requests';   -- 0
--   select tgname from pg_trigger where tgname in
--     ('friend_requests_block_real_seed', 'friendships_block_real_seed');          -- 2 rows
--   Re-run STEP 0 after STEP 5: both counts 0.
--   App: send + accept a real<->real request still works.
--
-- ROLLBACK
--   drop trigger if exists friend_requests_block_real_seed on public.friend_requests;
--   drop trigger if exists friendships_block_real_seed on public.friendships;
--   drop function if exists public.friend_pair_block_real_seed();
--   create policy "users send requests" on public.friend_requests
--     for insert with check (sender_user_id = auth.uid());
--   Re-run accept_friend_request from 20260924_cognation_social.sql to drop the kind check.
--   Deleted rows (STEP 5) are not restored.

-- Helper: is this user a real account?
create or replace function public.cognation_user_is_real(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.account_kind = 'real' from public.profiles p
      where p.user_id = uid and p.kind = 'personal' limit 1),
    true);
$$;
revoke all on function public.cognation_user_is_real(uuid) from public, anon, authenticated;

-- STEP 0: count mixed real<->non-real pairs (read-only) --------------------------
select
  (select count(*) from public.friend_requests r
    where public.cognation_user_is_real(r.sender_user_id)
       <> public.cognation_user_is_real(r.recipient_user_id)) as mixed_friend_requests,
  (select count(*) from public.friendships f
    where public.cognation_user_is_real(f.user_id)
       <> public.cognation_user_is_real(f.friend_user_id)) as mixed_friendship_rows;

-- STEP 1: requests only through send_friend_request ------------------------------
drop policy if exists "users send requests" on public.friend_requests;

-- STEP 2: accept_friend_request checks account kind ------------------------------
create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  request public.friend_requests;
  actor_name text;
begin
  select * into request from public.friend_requests
  where id = request_id and recipient_user_id = auth.uid() and status = 'pending'
  for update;
  if request.id is null then raise exception 'Friend request not found'; end if;
  if public.cognation_user_is_real(request.sender_user_id)
     <> public.cognation_user_is_real(request.recipient_user_id) then
    raise exception 'real_seed_friend_blocked';
  end if;
  update public.friend_requests set status = 'accepted', responded_at = now() where id = request.id;
  insert into public.friendships (user_id, friend_user_id)
  values (request.sender_user_id, request.recipient_user_id),
         (request.recipient_user_id, request.sender_user_id)
  on conflict do nothing;
  select display_name into actor_name from public.profiles
  where user_id = auth.uid() and kind = 'personal';
  insert into public.notifications (recipient_user_id, actor_user_id, type, body, resource_id)
  values (request.sender_user_id, auth.uid(), 'friend_request_accepted', actor_name || ' accepted your friend request.', request.id);
end;
$$;
grant execute on function public.accept_friend_request(uuid) to authenticated;

-- STEP 3: backstop triggers (any path, including service_role scripts) -----------
create or replace function public.friend_pair_block_real_seed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  a uuid;
  b uuid;
begin
  if tg_table_name = 'friend_requests' then
    a := new.sender_user_id; b := new.recipient_user_id;
    -- declining/cancelling an old mixed request is fine
    if tg_op = 'UPDATE' and new.status in ('declined', 'cancelled') then return new; end if;
  else
    a := new.user_id; b := new.friend_user_id;
  end if;
  if public.cognation_user_is_real(a) <> public.cognation_user_is_real(b) then
    raise exception 'real_seed_friend_blocked';
  end if;
  return new;
end;
$$;
revoke all on function public.friend_pair_block_real_seed() from public, anon, authenticated;

drop trigger if exists friend_requests_block_real_seed on public.friend_requests;
create trigger friend_requests_block_real_seed
before insert or update on public.friend_requests
for each row execute procedure public.friend_pair_block_real_seed();

drop trigger if exists friendships_block_real_seed on public.friendships;
create trigger friendships_block_real_seed
before insert or update on public.friendships
for each row execute procedure public.friend_pair_block_real_seed();

-- STEP 4: (nothing else; send_friend_request already blocks mixed pairs) ---------

-- STEP 5: CLEANUP — read the STEP 0 counts first. Then uncomment and run. --------
-- delete from public.friendships f
--  where public.cognation_user_is_real(f.user_id)
--     <> public.cognation_user_is_real(f.friend_user_id);
-- delete from public.friend_requests r
--  where public.cognation_user_is_real(r.sender_user_id)
--     <> public.cognation_user_is_real(r.recipient_user_id);

-- FINAL: same count as STEP 0, shown last so the SQL editor displays it.
select
  (select count(*) from public.friend_requests r
    where public.cognation_user_is_real(r.sender_user_id)
       <> public.cognation_user_is_real(r.recipient_user_id)) as mixed_friend_requests,
  (select count(*) from public.friendships f
    where public.cognation_user_is_real(f.user_id)
       <> public.cognation_user_is_real(f.friend_user_id)) as mixed_friendship_rows;
