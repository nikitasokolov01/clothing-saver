create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  size_profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  canonical_url text not null,
  title text not null,
  brand text not null default '',
  retailer text not null,
  image_url text not null default '',
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'USD',
  category text not null default 'Other',
  selected_size text not null default '',
  selected_color text not null default '',
  stock_status text not null default 'unknown'
    check (stock_status in ('in-stock', 'out-of-stock', 'unknown')),
  sizes jsonb not null default '[]'::jsonb,
  colors jsonb,
  collection text not null default 'saved'
    check (collection in ('saved', 'closet')),
  purchased_at timestamptz,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_url)
);

create index products_user_collection_created_idx
  on public.products (user_id, collection, created_at desc);

alter table public.profiles enable row level security;
alter table public.products enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read their own products"
  on public.products for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own products"
  on public.products for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own products"
  on public.products for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own products"
  on public.products for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.products to authenticated;
revoke all on public.profiles from anon;
revoke all on public.products from anon;
