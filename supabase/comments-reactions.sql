-- Comment reactions (like / love / happy / wow / sad / angry)
-- Run this in your Supabase SQL Editor AFTER comments.sql.
--
-- Each reaction is still stored as one upvote (vote = 1) so the existing
-- upvote-count trigger keeps working. The new column just remembers WHICH
-- reaction the reader picked.

alter table public.series_comment_votes
  add column if not exists reaction text not null default 'like';

alter table public.series_comment_votes
  drop constraint if exists series_comment_votes_reaction_check;

alter table public.series_comment_votes
  add constraint series_comment_votes_reaction_check
  check (reaction in ('like', 'love', 'happy', 'wow', 'sad', 'angry'));

create index if not exists idx_series_comment_votes_reaction
  on public.series_comment_votes (comment_id, reaction);
