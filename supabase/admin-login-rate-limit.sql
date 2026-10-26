-- Run in Supabase SQL Editor to enable shared admin login throttling.
-- The API stores only an HMAC of the requester IP, never the IP itself.

create table if not exists public.admin_login_rate_limits (
  requester_hash text primary key,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  blocked_until timestamptz
);
alter table public.admin_login_rate_limits
  add column if not exists blocked_until timestamptz;

alter table public.admin_login_rate_limits enable row level security;
revoke all on public.admin_login_rate_limits from public, anon, authenticated;

create or replace function public.get_admin_login_lockout_seconds(p_requester_hash text)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(ceil(extract(epoch from (blocked_until - now())))::integer, 0)
  from public.admin_login_rate_limits
  where requester_hash = p_requester_hash and blocked_until > now();
$$;

create or replace function public.record_admin_login_failure(p_requester_hash text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_window timestamptz;
  failure_count integer;
  current_block timestamptz;
  new_block timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('admin-login:' || p_requester_hash, 0));
  select window_started_at, failed_attempts, blocked_until
    into current_window, failure_count, current_block
    from public.admin_login_rate_limits
    where requester_hash = p_requester_hash
    for update;

  if not found then
    insert into public.admin_login_rate_limits (requester_hash, window_started_at, failed_attempts)
      values (p_requester_hash, now(), 1);
    return 0;
  end if;

  if current_block > now() then
    return ceil(extract(epoch from (current_block - now())))::integer;
  end if;

  if current_block is not null or current_window < now() - interval '15 minutes' then
    current_window := now();
    failure_count := 1;
    new_block := null;
  else
    failure_count := failure_count + 1;
    new_block := case when failure_count >= 5 then now() + interval '15 minutes' else null end;
  end if;

  update public.admin_login_rate_limits
    set window_started_at = current_window,
        failed_attempts = failure_count,
        blocked_until = new_block
    where requester_hash = p_requester_hash;

  return coalesce(ceil(extract(epoch from (new_block - now())))::integer, 0);
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

drop function if exists public.consume_admin_login_attempt(text);
drop function if exists public.is_admin_login_limited(text);
revoke all on function public.get_admin_login_lockout_seconds(text) from public, anon, authenticated;
revoke all on function public.record_admin_login_failure(text) from public, anon, authenticated;
revoke all on function public.clear_admin_login_failures(text) from public, anon, authenticated;
grant execute on function public.get_admin_login_lockout_seconds(text) to service_role;
grant execute on function public.record_admin_login_failure(text) to service_role;
grant execute on function public.clear_admin_login_failures(text) to service_role;
