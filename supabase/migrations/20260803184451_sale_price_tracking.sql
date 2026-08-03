alter table public.products
  add column original_price_cents integer
    check (original_price_cents is null or original_price_cents >= 0),
  add column price_updated_at timestamptz;

alter table public.notifications
  alter column actor_id drop not null,
  add column product_id uuid references public.products(id) on delete cascade,
  add column old_price_cents integer check (old_price_cents is null or old_price_cents >= 0),
  add column new_price_cents integer check (new_price_cents is null or new_price_cents >= 0),
  add column currency text;

alter table public.notifications
  drop constraint notifications_type_check,
  add constraint notifications_type_check
    check (type in ('follow_request', 'follow_accepted', 'new_follower', 'price_drop')),
  add constraint notifications_payload_check check (
    (
      type = 'price_drop'
      and actor_id is null
      and product_id is not null
      and old_price_cents is not null
      and new_price_cents is not null
      and new_price_cents < old_price_cents
      and currency is not null
    )
    or (
      type <> 'price_drop'
      and actor_id is not null
      and product_id is null
      and old_price_cents is null
      and new_price_cents is null
      and currency is null
    )
  );

create index notifications_product_created_idx
  on public.notifications (product_id, created_at desc)
  where product_id is not null;

create table public.price_refresh_state (
  id boolean primary key default true check (id),
  locked_until timestamptz not null default '-infinity',
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_result jsonb not null default '{}'::jsonb
);

insert into public.price_refresh_state (id) values (true);

alter table public.price_refresh_state enable row level security;
revoke all on table public.price_refresh_state from public, anon, authenticated;
grant all on table public.price_refresh_state to service_role;

create or replace function private.prepare_product_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price_cents is distinct from old.price_cents then
    new.price_updated_at := now();

    if old.price_cents is not null
      and new.price_cents is not null
      and new.price_cents < old.price_cents then
      new.original_price_cents := greatest(
        coalesce(new.original_price_cents, 0),
        old.price_cents
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger prepare_product_price_change_before_update
before update of price_cents on public.products
for each row execute function private.prepare_product_price_change();

create or replace function private.create_price_drop_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collection = 'saved'
    and old.price_cents is not null
    and new.price_cents is not null
    and new.price_cents < old.price_cents then
    insert into public.notifications (
      user_id,
      actor_id,
      type,
      product_id,
      old_price_cents,
      new_price_cents,
      currency
    ) values (
      new.user_id,
      null,
      'price_drop',
      new.id,
      old.price_cents,
      new.price_cents,
      new.currency
    );
  end if;

  return new;
end;
$$;

create trigger create_price_drop_notification_after_update
after update of price_cents on public.products
for each row execute function private.create_price_drop_notification();

revoke all on function private.prepare_product_price_change() from public;
revoke all on function private.create_price_drop_notification() from public;
