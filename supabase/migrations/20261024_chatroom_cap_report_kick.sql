-- Topic chatrooms hold 100. Ten reports on one comment remove that author from that room only.
-- Not a site ban. Not a block. No calendar event. NOT auto-run.
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid = 'public.chat_rooms'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%max_members%'
  loop execute format('alter table public.chat_rooms drop constraint %I', c.conname); end loop;
end $$;
alter table public.chat_rooms add constraint chat_rooms_max_members_check
  check ((max_members is null and min_age >= 18) or (max_members between 2 and 100));
update public.chat_rooms set max_members = 100 where max_members is not null and slug in (
  '18-21','highschool','moms','tech-ai','speed-dating','21-plus','disability-help','mental-health',
  'military','lgbtq','public-policy','gamers','jobs','garage-sale','reality-shows','insurance');
create or replace function public.chatroom_kick_on_tenth_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; author uuid; room uuid;
begin
  select count(*)::int into n from public.chat_room_message_reports where message_id = new.message_id;
  if n < 10 then return new; end if;
  select author_user_id, room_id into author, room from public.chat_room_messages where id = new.message_id;
  if author is null then return new; end if;
  delete from public.chat_room_members where room_id = room and user_id = author;
  return new;
end $$;
revoke all on function public.chatroom_kick_on_tenth_report() from public, anon, authenticated;
drop trigger if exists chatroom_kick_on_tenth_report on public.chat_room_message_reports;
create trigger chatroom_kick_on_tenth_report
  after insert on public.chat_room_message_reports
  for each row execute procedure public.chatroom_kick_on_tenth_report();
