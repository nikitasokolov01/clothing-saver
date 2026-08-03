create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  full_name text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  is_private boolean not null default true,
  share_saved boolean not null default true,
  share_closet boolean not null default true,
  follower_count integer not null default 0 check (follower_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint social_profiles_bio_length check (char_length(bio) <= 240)
);

create unique index social_profiles_username_unique_idx
  on public.social_profiles (lower(username));

create table public.follows (
  follower_id uuid not null references public.social_profiles(user_id) on delete cascade,
  following_id uuid not null references public.social_profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, following_id),
  constraint follows_cannot_follow_self check (follower_id <> following_id)
);

create index follows_following_status_created_idx
  on public.follows (following_id, status, created_at desc);

create index follows_follower_status_created_idx
  on public.follows (follower_id, status, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.social_profiles(user_id) on delete cascade,
  actor_id uuid not null references public.social_profiles(user_id) on delete cascade,
  type text not null check (type in ('follow_request', 'follow_accepted', 'new_follower')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_not_self check (user_id <> actor_id)
);

create index notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create or replace function private.sync_social_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is null then
    return new;
  end if;

  insert into public.social_profiles (user_id, username, full_name, updated_at)
  values (new.user_id, lower(new.username), new.full_name, now())
  on conflict (user_id) do update
    set username = excluded.username,
        full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

create trigger sync_social_profile_after_profile_write
after insert or update of username, full_name on public.profiles
for each row execute function private.sync_social_profile();

insert into public.social_profiles (user_id, username, full_name, updated_at)
select user_id, lower(username), full_name, now()
from public.profiles
where username is not null
on conflict (user_id) do update
  set username = excluded.username,
      full_name = excluded.full_name,
      updated_at = now();

create or replace function private.prepare_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_private boolean;
begin
  select is_private into target_is_private
  from public.social_profiles
  where user_id = new.following_id;

  if target_is_private is null then
    raise exception 'Profile not found';
  end if;

  new.status := case when target_is_private then 'pending' else 'accepted' end;
  new.updated_at := now();
  new.accepted_at := case when new.status = 'accepted' then now() else null end;
  return new;
end;
$$;

create trigger prepare_follow_before_insert
before insert on public.follows
for each row execute function private.prepare_follow();

create or replace function private.prepare_follow_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'accepted';
  new.updated_at := now();
  new.accepted_at := coalesce(old.accepted_at, now());
  return new;
end;
$$;

create trigger prepare_follow_before_update
before update of status on public.follows
for each row execute function private.prepare_follow_acceptance();

create or replace function private.refresh_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_follower uuid := coalesce(new.follower_id, old.follower_id);
  changed_following uuid := coalesce(new.following_id, old.following_id);
begin
  update public.social_profiles
  set following_count = (
    select count(*)::integer
    from public.follows
    where follower_id = changed_follower and status = 'accepted'
  )
  where user_id = changed_follower;

  update public.social_profiles
  set follower_count = (
    select count(*)::integer
    from public.follows
    where following_id = changed_following and status = 'accepted'
  )
  where user_id = changed_following;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger refresh_follow_counts_after_write
after insert or update of status or delete on public.follows
for each row execute function private.refresh_follow_counts();

create or replace function private.create_follow_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, type)
    values (
      new.following_id,
      new.follower_id,
      case when new.status = 'pending' then 'follow_request' else 'new_follower' end
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    delete from public.notifications
    where user_id = new.following_id
      and actor_id = new.follower_id
      and type = 'follow_request';

    insert into public.notifications (user_id, actor_id, type)
    values (new.follower_id, new.following_id, 'follow_accepted');
    return new;
  end if;

  if tg_op = 'DELETE' and old.status = 'pending' then
    delete from public.notifications
    where user_id = old.following_id
      and actor_id = old.follower_id
      and type = 'follow_request';
  end if;

  return old;
end;
$$;

create trigger create_follow_notification_after_write
after insert or update of status or delete on public.follows
for each row execute function private.create_follow_notification();

create or replace function public.can_view_social_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
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

revoke all on function public.can_view_social_profile(uuid) from public;
grant execute on function public.can_view_social_profile(uuid) to anon, authenticated;
revoke all on function private.sync_social_profile() from public;
revoke all on function private.prepare_follow() from public;
revoke all on function private.prepare_follow_acceptance() from public;
revoke all on function private.refresh_follow_counts() from public;
revoke all on function private.create_follow_notification() from public;

alter table public.social_profiles enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

create policy "Anyone can read social profiles"
  on public.social_profiles for select
  to anon, authenticated
  using (true);

create policy "Users can update their social profile"
  on public.social_profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "People can read their own follow relationships"
  on public.follows for select
  to authenticated
  using ((select auth.uid()) = follower_id or (select auth.uid()) = following_id);

create policy "People can request follows"
  on public.follows for insert
  to authenticated
  with check ((select auth.uid()) = follower_id);

create policy "People can accept incoming requests"
  on public.follows for update
  to authenticated
  using ((select auth.uid()) = following_id and status = 'pending')
  with check ((select auth.uid()) = following_id and status = 'accepted');

create policy "People can remove their follow relationships"
  on public.follows for delete
  to authenticated
  using ((select auth.uid()) = follower_id or (select auth.uid()) = following_id);

create policy "People can read their notifications"
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "People can mark their notifications read"
  on public.notifications for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "People can delete their notifications"
  on public.notifications for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "People can read shared products"
  on public.products for select
  to anon, authenticated
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

grant usage on schema public to anon, authenticated;
grant select on table public.social_profiles to anon, authenticated;
grant update (bio, avatar_url, is_private, share_saved, share_closet, updated_at)
  on table public.social_profiles to authenticated;
grant select, delete on table public.follows to authenticated;
grant insert (follower_id, following_id) on table public.follows to authenticated;
grant update (status) on table public.follows to authenticated;
grant select, delete on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant select on table public.products to anon;
