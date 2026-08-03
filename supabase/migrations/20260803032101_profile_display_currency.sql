alter table public.profiles
  add column preferred_currency text not null default 'USD';

alter table public.profiles
  add constraint profiles_preferred_currency_format
  check (preferred_currency ~ '^[A-Z]{3}$');
