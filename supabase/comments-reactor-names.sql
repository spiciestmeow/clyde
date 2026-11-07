-- Reactor names for the comment "Reactions" popover / dialog
-- Run this in your Supabase SQL Editor AFTER comments-reactions.sql.
--
-- Stores the display name (and optional avatar) a reader had when they reacted,
-- so the site can show "seiera, Rohit Malik and 27 others". Rows without a name
-- are shown as "N guests". The site keeps working if you skip this file; every
-- reaction is then listed under guests.

alter table public.series_comment_votes
  add column if not exists user_name text,
  add column if not exists user_avatar text;
