-- Run after series-catalog.sql in Supabase SQL Editor.
-- Tracks anonymous bookmark votes per series so a visitor can only increment favorites by 1.

create table if not exists public.series_bookmark_votes (
  series_slug text not null references public.series(slug) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (series_slug, visitor_id)
);

alter table public.series_bookmark_votes enable row level security;

-- Public readers cannot modify bookmark votes directly; only the server API with service role manages it.
revoke all on public.series_bookmark_votes from public, anon, authenticated;

-- Server-side, atomic vote changes and per-IP request limiting. The API passes
-- only an HMAC of the requester address, never the raw address.
create table if not exists public.series_bookmark_rate_limits (
  requester_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);
alter table public.series_bookmark_rate_limits enable row level security;
revoke all on public.series_bookmark_rate_limits from public, anon, authenticated;

create or replace function public.toggle_series_bookmark(
  p_series_slug text,
  p_visitor_id uuid,
  p_action text,
  p_requester_hash text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  series_id bigint;
  current_favorites text;
  current_count integer;
  already_voted boolean;
  next_count integer;
  requester_count integer;
begin
  if p_action not in ('bookmark', 'unbookmark') then
    raise exception 'Invalid bookmark action';
  end if;
  if p_visitor_id is null then
    raise exception 'A visitor ID is required';
  end if;

  if p_requester_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('bookmark-rate:' || p_requester_hash, 0));
    insert into public.series_bookmark_rate_limits (requester_hash, window_started_at, request_count)
      values (p_requester_hash, now(), 1)
      on conflict (requester_hash) do update set
        window_started_at = case
          when public.series_bookmark_rate_limits.window_started_at < now() - interval '10 minutes' then now()
          else public.series_bookmark_rate_limits.window_started_at
        end,
        request_count = case
          when public.series_bookmark_rate_limits.window_started_at < now() - interval '10 minutes' then 1
          else public.series_bookmark_rate_limits.request_count + 1
        end
      returning request_count into requester_count;
    if requester_count > 30 then
      raise exception 'Bookmark rate limit exceeded';
    end if;
  end if;

  select id, favorites into series_id, current_favorites
    from public.series where slug = p_series_slug for update;
  if series_id is null then
    raise exception 'Unknown series';
  end if;
  select exists (
    select 1 from public.series_bookmark_votes
    where series_slug = p_series_slug and visitor_id = p_visitor_id
  ) into already_voted;

  if p_action = 'bookmark' and not already_voted then
    insert into public.series_bookmark_votes (series_slug, visitor_id)
      values (p_series_slug, p_visitor_id) on conflict do nothing;
    already_voted := true;
  elsif p_action = 'unbookmark' and already_voted then
    delete from public.series_bookmark_votes
      where series_slug = p_series_slug and visitor_id = p_visitor_id;
    already_voted := false;
  else
    return coalesce(nullif(regexp_replace(coalesce(current_favorites, '0'), '[^0-9]', '', 'g'), '')::integer, 0);
  end if;

  current_count := coalesce(nullif(regexp_replace(coalesce(current_favorites, '0'), '[^0-9]', '', 'g'), '')::integer, 0);
  next_count := greatest(0, current_count + case when p_action = 'bookmark' then 1 else -1 end);
  update public.series set favorites = next_count::text, updated_at = now() where id = series_id;
  return next_count;
end;
$$;

revoke all on function public.toggle_series_bookmark(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.toggle_series_bookmark(text, uuid, text, text) to service_role;
