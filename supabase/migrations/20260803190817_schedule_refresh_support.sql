create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create policy "No direct access to refresh state"
  on public.price_refresh_state
  for all
  to anon, authenticated
  using (false)
  with check (false);
