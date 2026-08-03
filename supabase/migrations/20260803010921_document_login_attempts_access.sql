create policy "No direct access to login attempts"
  on public.username_login_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);
