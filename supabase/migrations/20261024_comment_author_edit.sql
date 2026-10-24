-- Authors replace or remove a comment they wrote. Others cannot.
drop policy if exists "authors update their news comments" on public.news_story_comments;
create policy "authors update their news comments"
  on public.news_story_comments for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = news_story_comments.author_profile_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = news_story_comments.author_profile_id and p.user_id = auth.uid()));

drop policy if exists "authors delete their news comments" on public.news_story_comments;
create policy "authors delete their news comments"
  on public.news_story_comments for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = news_story_comments.author_profile_id and p.user_id = auth.uid()));

grant update, delete on public.news_story_comments to authenticated;

do $do$
begin
  if to_regclass('public.tower_post_comments') is null then return; end if;
  execute 'drop policy if exists "authors update their feed comments" on public.tower_post_comments';
  execute 'create policy "authors update their feed comments" on public.tower_post_comments for update to authenticated using (exists (select 1 from public.profiles p where p.id = author_profile_id and p.user_id = auth.uid())) with check (exists (select 1 from public.profiles p where p.id = author_profile_id and p.user_id = auth.uid()))';
  execute 'drop policy if exists "authors delete their feed comments" on public.tower_post_comments';
  execute 'create policy "authors delete their feed comments" on public.tower_post_comments for delete to authenticated using (exists (select 1 from public.profiles p where p.id = author_profile_id and p.user_id = auth.uid()))';
  execute 'grant update, delete on public.tower_post_comments to authenticated';
end
$do$;
