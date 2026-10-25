-- Run once in the Supabase SQL editor after series-catalog.sql.
-- This records notifications only for events that happen after this migration;
-- existing series and chapters are intentionally not backfilled.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  category text not null check (category in ('Series', 'Chapters')),
  series_id bigint not null,
  series_slug text not null,
  series_title text not null,
  series_cover text not null default '',
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;

revoke insert, update, delete on public.notifications from anon, authenticated;
grant select on public.notifications to anon, authenticated;

drop policy if exists "Public can read notifications" on public.notifications;
create policy "Public can read notifications"
  on public.notifications for select
  to anon, authenticated
  using (true);

create or replace function public.notify_new_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only titles explicitly marked for the New releases tab should create a
  -- Series notification. Also allow a regular title to become eligible if
  -- the admin later enables the New series toggle.
  if lower(coalesce(new.facts->>'is_new', 'false')) <> 'true' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if lower(coalesce(old.facts->>'is_new', 'false')) = 'true' then
      return new;
    end if;
  end if;

  insert into public.notifications (
    event_key, category, series_id, series_slug, series_title, series_cover, message
  ) values (
    'series:' || new.id::text,
    'Series',
    new.id,
    new.slug,
    new.title,
    coalesce(new.cover, ''),
    'New series is now available to read'
  )
  on conflict (event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists series_notification_after_insert on public.series;
create trigger series_notification_after_insert
  after insert on public.series
  for each row execute function public.notify_new_series();

drop trigger if exists series_notification_after_new_enabled on public.series;
create trigger series_notification_after_new_enabled
  after update of facts on public.series
  for each row execute function public.notify_new_series();

create or replace function public.notify_new_series_chapter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_chapter_text text;
  new_chapter_text text;
  old_chapter_number numeric;
  new_chapter_number numeric;
begin
  -- Prefer the explicit latest chapter field; fall back to the first catalog
  -- chapter title for older rows that do not have that field yet.
  old_chapter_text := coalesce(
    substring(coalesce(old.facts->>'latest_chapter_number', '') from '([0-9]+([.][0-9]+)?)'),
    substring(coalesce(old.chapters->0->>'title', '') from '([0-9]+([.][0-9]+)?)')
  );
  new_chapter_text := coalesce(
    substring(coalesce(new.facts->>'latest_chapter_number', '') from '([0-9]+([.][0-9]+)?)'),
    substring(coalesce(new.chapters->0->>'title', '') from '([0-9]+([.][0-9]+)?)')
  );

  -- A first-time baseline is not a chapter release. Notify only when both
  -- records have a numeric value and the new value is strictly higher.
  if old_chapter_text is null or new_chapter_text is null then
    return new;
  end if;

  old_chapter_number := old_chapter_text::numeric;
  new_chapter_number := new_chapter_text::numeric;
  if new_chapter_number <= old_chapter_number then
    return new;
  end if;

  insert into public.notifications (
    event_key, category, series_id, series_slug, series_title, series_cover, message
  ) values (
    'chapter:' || new.id::text || ':' || new_chapter_number::text,
    'Chapters',
    new.id,
    new.slug,
    new.title,
    coalesce(new.cover, ''),
    'Chapter ' || new_chapter_number::text || ' is now available'
  )
  on conflict (event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists series_chapter_notification_after_update on public.series;
create trigger series_chapter_notification_after_update
  after update of facts on public.series
  for each row execute function public.notify_new_series_chapter();
