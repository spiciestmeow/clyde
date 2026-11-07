-- Tighter security for comments
-- Run this in your Supabase SQL Editor AFTER comments.sql (and comment-reports.sql).
--
-- comments.sql lets anyone update or delete any comment (using (true)). The site only
-- SHOWS Edit / Delete to the right people, but the API itself was open. This file locks it:
--
--   read    : anyone
--   insert  : guests (as 'Reader', no account) and logged-in users (as themselves only);
--             nobody can post pre-pinned comments or fake upvote counts
--   edit    : logged-in author only, and only the text (content) can change
--   delete  : the logged-in author, or the admin
--
-- The admin is identified by email, same as site_settings in schema.sql.
-- Change the email below if yours is different.
--
-- Not changed: voting. Guests have no account, so a vote is tied to a random id kept in the
-- browser. Someone determined could still spam votes. Fixing that needs sign-in or an
-- Edge Function; say so if you want it.

-- 1. Remove the old wide-open policies --------------------------------------------------
drop policy if exists "Authenticated users and guests can insert comments" on public.series_comments;
drop policy if exists "Users or admins can delete their own comments" on public.series_comments;
drop policy if exists "Users or admins can update comments" on public.series_comments;

-- 2. Insert: guests as Reader, logged-in users as themselves, no faked counts -----------
drop policy if exists "Guests and users can post comments" on public.series_comments;
create policy "Guests and users can post comments"
  on public.series_comments for insert
  to anon, authenticated
  with check (
    is_pinned = false
    and upvotes = 0
    and downvotes = 0
    and (
      (user_id is null and user_role = 'Reader')
      or (user_id is not null and user_id = (select auth.uid()))
    )
  );

-- 3. Update: the logged-in author only (the admin edits through the dashboard) ----------
drop policy if exists "Authors can edit their own comments" on public.series_comments;
create policy "Authors can edit their own comments"
  on public.series_comments for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Only the text can be changed through the API (not counts, pin, role or author).
-- The vote-count trigger in comments.sql is security definer, so it still updates counts.
revoke update on public.series_comments from anon, authenticated;
grant update (content) on public.series_comments to authenticated;

-- Keep updated_at fresh when a comment is edited
create or replace function public.touch_comment_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_comment_updated_at on public.series_comments;
create trigger trg_comment_updated_at
before update on public.series_comments
for each row execute function public.touch_comment_updated_at();

-- 4. Delete: the logged-in author, or the admin -----------------------------------------
drop policy if exists "Authors or admin can delete comments" on public.series_comments;
create policy "Authors or admin can delete comments"
  on public.series_comments for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or lower((select auth.jwt() ->> 'email')) = lower('clydhex@gmail.com')
  );
