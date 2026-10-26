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
grant select on public.series_bookmark_votes to anon, authenticated;
