-- Tower post reactions shared across signed-in viewers.
-- Run this file in the Supabase SQL editor before Cloudflare Pages.
-- The app does not apply it.

create table public.tower_post_reactions (
  post_id uuid not null references public.tower_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  face text not null check (face in ('❤️', '👍', '😂', '😮', '😢', '🔥')),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id, face)
);

alter table public.tower_post_reactions enable row level security;

-- Same read as tower_posts: public, the author, or a friend of the author.
create policy "tower reactions follow post visibility"
on public.tower_post_reactions for select to authenticated
using (
  exists (
    select 1 from public.tower_posts
    where tower_posts.id = tower_post_reactions.post_id
      and (
        tower_posts.visibility = 'public'
        or exists (
          select 1 from public.profiles
          where profiles.id = tower_posts.author_profile_id
            and profiles.user_id = auth.uid()
        )
        or exists (
          select 1 from public.profiles
          join public.friendships on friendships.friend_user_id = profiles.user_id
          where profiles.id = tower_posts.author_profile_id
            and friendships.user_id = auth.uid()
        )
      )
  )
);

create policy "signed-in people add their own tower reaction"
on public.tower_post_reactions for insert to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_post_reactions.profile_id
      and profiles.user_id = auth.uid()
  )
);

create policy "signed-in people remove their own tower reaction"
on public.tower_post_reactions for delete to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = tower_post_reactions.profile_id
      and profiles.user_id = auth.uid()
  )
);

grant select, insert, delete on public.tower_post_reactions to authenticated;
