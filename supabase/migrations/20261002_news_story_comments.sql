-- News story comments shared across signed-in people. One level. No reply parent.
-- Apply in the Supabase SQL editor before the live check.

create table public.news_story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id text not null check (char_length(story_id) between 1 and 120),
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index news_story_comments_story_created_idx
  on public.news_story_comments (story_id, created_at desc);

create table public.news_story_comment_reactions (
  comment_id uuid not null references public.news_story_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  face text not null check (face in ('❤️', '👍', '😂', '😮', '😢')),
  primary key (comment_id, profile_id, face)
);

alter table public.news_story_comments enable row level security;
alter table public.news_story_comment_reactions enable row level security;

create policy "signed-in people read news comments"
  on public.news_story_comments for select to authenticated using (true);

create policy "signed-in people post as their own profile"
  on public.news_story_comments for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = news_story_comments.author_profile_id
        and profiles.user_id = auth.uid()
    )
  );

create policy "signed-in people read news comment reactions"
  on public.news_story_comment_reactions for select to authenticated using (true);

create policy "signed-in people add their own reaction"
  on public.news_story_comment_reactions for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = news_story_comment_reactions.profile_id
        and profiles.user_id = auth.uid()
    )
  );

create policy "signed-in people remove their own reaction"
  on public.news_story_comment_reactions for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = news_story_comment_reactions.profile_id
        and profiles.user_id = auth.uid()
    )
  );

grant select, insert on public.news_story_comments to authenticated;
grant select, insert, delete on public.news_story_comment_reactions to authenticated;
