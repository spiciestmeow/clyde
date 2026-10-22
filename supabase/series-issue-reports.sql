-- Series issue reports are inserted by the server-side API using a Supabase secret key.
-- Keep direct client access disabled so public users cannot bypass API validation.
create table if not exists public.series_issue_reports (
  id bigint generated always as identity primary key,
  series_slug text not null check (char_length(series_slug) between 1 and 200),
  series_title text not null check (char_length(series_title) between 1 and 240),
  issue_type text not null check (issue_type in (
    'Wrong chapter',
    'Poor image quality',
    'Inappropriate content',
    'Copyright issue',
    'Other'
  )),
  details text not null default '' check (char_length(details) <= 200),
  requester_hash text check (requester_hash is null or requester_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists series_issue_reports_requester_created_idx
  on public.series_issue_reports (requester_hash, created_at desc)
  where requester_hash is not null;

create index if not exists series_issue_reports_created_idx
  on public.series_issue_reports (created_at desc);

alter table public.series_issue_reports enable row level security;
revoke all on public.series_issue_reports from anon, authenticated;

comment on table public.series_issue_reports is
  'Series page issue reports submitted through the server-side API.';
