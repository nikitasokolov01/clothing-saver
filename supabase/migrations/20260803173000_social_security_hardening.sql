create or replace function public.can_view_social_profile(target_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.social_profiles profile
    where profile.user_id = target_user_id
      and (
        not profile.is_private
        or (select auth.uid()) = target_user_id
        or exists (
          select 1
          from public.follows relationship
          where relationship.follower_id = (select auth.uid())
            and relationship.following_id = target_user_id
            and relationship.status = 'accepted'
        )
      )
  );
$$;

create index notifications_actor_id_idx
  on public.notifications (actor_id);

drop policy "People can read shared products" on public.products;
drop policy "Users can read their own products" on public.products;

create policy "Authenticated users can read accessible products"
  on public.products for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      public.can_view_social_profile(products.user_id)
      and exists (
        select 1
        from public.social_profiles profile
        where profile.user_id = products.user_id
          and (
            (products.collection = 'saved' and profile.share_saved)
            or (products.collection = 'closet' and profile.share_closet)
          )
      )
    )
  );

create policy "Anonymous users can read shared products"
  on public.products for select
  to anon
  using (
    public.can_view_social_profile(products.user_id)
    and exists (
      select 1
      from public.social_profiles profile
      where profile.user_id = products.user_id
        and (
          (products.collection = 'saved' and profile.share_saved)
          or (products.collection = 'closet' and profile.share_closet)
        )
    )
  );
