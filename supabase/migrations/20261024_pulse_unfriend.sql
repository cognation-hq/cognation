-- Signed-in person can drop a friendship they are part of (both directions).
create function public.unfriend_user(other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or other_user_id is null or other_user_id = auth.uid() then
    raise exception 'Invalid friend';
  end if;
  delete from public.friendships
  where (user_id = auth.uid() and friend_user_id = other_user_id)
     or (user_id = other_user_id and friend_user_id = auth.uid());
end;
$$;

grant execute on function public.unfriend_user(uuid) to authenticated;
