-- Run in Supabase SQL Editor to enable shared admin login throttling.
-- The API stores only an HMAC of the requester IP, never the IP itself.

create table if not exists public.admin_login_rate_limits (
  requester_hash text primary key,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0
);

alter table public.admin_login_rate_limits enable row level security;
revoke all on public.admin_login_rate_limits from public, anon, authenticated;

create or replace function public.consume_admin_login_attempt(p_requester_hash text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare attempt_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('admin-login:' || p_requester_hash, 0));
  insert into public.admin_login_rate_limits (requester_hash, window_started_at, failed_attempts)
    values (p_requester_hash, now(), 1)
    on conflict (requester_hash) do update set
      window_started_at = case
        when public.admin_login_rate_limits.window_started_at < now() - interval '15 minutes' then now()
        else public.admin_login_rate_limits.window_started_at
      end,
      failed_attempts = case
        when public.admin_login_rate_limits.window_started_at < now() - interval '15 minutes' then 1
        else public.admin_login_rate_limits.failed_attempts + 1
      end
    returning failed_attempts into attempt_count;
  return attempt_count;
end;
$$;

create or replace function public.clear_admin_login_failures(p_requester_hash text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.admin_login_rate_limits where requester_hash = p_requester_hash;
$$;

drop function if exists public.is_admin_login_limited(text);
drop function if exists public.record_admin_login_failure(text);
revoke all on function public.consume_admin_login_attempt(text) from public, anon, authenticated;
revoke all on function public.clear_admin_login_failures(text) from public, anon, authenticated;
grant execute on function public.consume_admin_login_attempt(text) to service_role;
grant execute on function public.clear_admin_login_failures(text) to service_role;
