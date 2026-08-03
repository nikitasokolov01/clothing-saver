alter table public.profiles
  add column full_name text not null default '',
  add column username text,
  add column sizing_preference text not null default 'mens'
    check (sizing_preference in ('mens', 'womens')),
  add column onboarding_completed boolean not null default false,
  add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_]{3,24}$');

create unique index profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;
