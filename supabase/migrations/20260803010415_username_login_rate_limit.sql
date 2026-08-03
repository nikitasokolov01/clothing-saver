create table public.username_login_attempts (
  attempt_key text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1
);

alter table public.username_login_attempts enable row level security;
revoke all on table public.username_login_attempts from anon, authenticated;
grant all on table public.username_login_attempts to service_role;

create or replace function public.allow_username_login_attempt(p_attempt_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_allowed boolean;
begin
  insert into public.username_login_attempts (attempt_key)
  values (p_attempt_key)
  on conflict (attempt_key) do update
    set window_started_at = case
          when username_login_attempts.window_started_at < now() - interval '15 minutes' then now()
          else username_login_attempts.window_started_at
        end,
        attempts = case
          when username_login_attempts.window_started_at < now() - interval '15 minutes' then 1
          else username_login_attempts.attempts + 1
        end
  returning attempts <= 10 into is_allowed;

  return is_allowed;
end;
$$;

revoke all on function public.allow_username_login_attempt(text) from public, anon, authenticated;
grant execute on function public.allow_username_login_attempt(text) to service_role;
