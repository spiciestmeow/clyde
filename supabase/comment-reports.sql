-- Comment reports (from the "..." menu on each comment)
-- Run this in your Supabase SQL Editor AFTER comments.sql.
--
-- Anyone can submit a report, but nobody can read them through the public API:
-- there is deliberately no select policy. Read the reports in the Supabase
-- dashboard (Table Editor) or with the service role key.
-- The site keeps working if you skip this file; reports are then only kept in
-- the reader's own browser.

create table if not exists public.series_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.series_comments(id) on delete cascade,
  series_slug text not null,
  reason text check (reason is null or char_length(reason) <= 500),
  reporter_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_series_comment_reports_comment
  on public.series_comment_reports (comment_id);

alter table public.series_comment_reports enable row level security;

drop policy if exists "Anyone can report a comment" on public.series_comment_reports;
create policy "Anyone can report a comment"
  on public.series_comment_reports for insert
  to anon, authenticated
  with check (true);
