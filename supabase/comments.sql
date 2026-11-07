-- Comments and Discussion System for Series (Asura Scans inspired)
-- Run this in your Supabase SQL Editor.

create table if not exists public.series_comments (
  id uuid primary key default gen_random_uuid(),
  series_slug text not null,
  user_id uuid references auth.users(id) on delete cascade,
  user_name text not null default 'Reader',
  user_avatar text,
  user_role text not null default 'Reader',
  parent_id uuid references public.series_comments(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 3000),
  is_spoiler boolean not null default false,
  is_pinned boolean not null default false,
  type text not null default 'comment' check (type in ('comment', 'review')),
  rating numeric(3, 1) check (rating is null or (rating >= 1.0 and rating <= 10.0)),
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for speedy series comment fetching
create index if not exists idx_series_comments_slug on public.series_comments (series_slug, created_at desc);
create index if not exists idx_series_comments_parent on public.series_comments (parent_id);
create index if not exists idx_series_comments_user on public.series_comments (user_id);

-- Votes table for tracking upvotes and downvotes per user
create table if not exists public.series_comment_votes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.series_comments(id) on delete cascade,
  user_id text not null,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists idx_series_comment_votes_comment on public.series_comment_votes (comment_id);

-- Enable RLS
alter table public.series_comments enable row level security;
alter table public.series_comment_votes enable row level security;

-- Policies for series_comments
drop policy if exists "Anyone can read comments" on public.series_comments;
create policy "Anyone can read comments"
  on public.series_comments for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users and guests can insert comments" on public.series_comments;
create policy "Authenticated users and guests can insert comments"
  on public.series_comments for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users or admins can delete their own comments" on public.series_comments;
create policy "Users or admins can delete their own comments"
  on public.series_comments for delete
  to anon, authenticated
  using (true);

drop policy if exists "Users or admins can update comments" on public.series_comments;
create policy "Users or admins can update comments"
  on public.series_comments for update
  to anon, authenticated
  using (true);

-- Policies for series_comment_votes
drop policy if exists "Anyone can read votes" on public.series_comment_votes;
create policy "Anyone can read votes"
  on public.series_comment_votes for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can vote" on public.series_comment_votes;
create policy "Anyone can vote"
  on public.series_comment_votes for all
  to anon, authenticated
  using (true)
  with check (true);

-- Function and trigger to auto-update upvotes/downvotes counts on comment
create or replace function public.update_comment_vote_counts()
returns trigger as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.comment_id, old.comment_id);
  update public.series_comments
  set
    upvotes = coalesce((select count(*) from public.series_comment_votes where comment_id = target_id and vote = 1), 0),
    downvotes = coalesce((select count(*) from public.series_comment_votes where comment_id = target_id and vote = -1), 0)
  where id = target_id;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_comment_vote_counts on public.series_comment_votes;
create trigger trg_comment_vote_counts
after insert or update or delete on public.series_comment_votes
for each row execute function public.update_comment_vote_counts();
