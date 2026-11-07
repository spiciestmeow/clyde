-- Auto Sync & Update Logs shown in Admin > Auto Sync & Update Logs.
--
-- Stored in its own table (not in site_settings.header_visibility) so that admin dashboard
-- saves, which rewrite the whole site_settings.header_visibility JSON, can never wipe the
-- sync history.
--
-- Run this once in the Supabase SQL editor. Until it is run, the cron job and the admin panel
-- keep using the legacy location (site_settings.header_visibility.sync_logs), so nothing breaks.
-- It is safe to run more than once.
--
-- The cron job writes with SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS, so no write policy
-- is needed for it. Only the public read policy is required for the admin panel.

create table if not exists public.sync_logs (
  id text primary key check (id = 'global'),
  logs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(logs) = 'array' and octet_length(logs::text) <= 500000),
  updated_at timestamptz not null default now()
);

alter table public.sync_logs enable row level security;

grant select on public.sync_logs to anon, authenticated;
grant select, insert, update on public.sync_logs to service_role;

drop policy if exists "Anyone can read sync logs" on public.sync_logs;
create policy "Anyone can read sync logs"
on public.sync_logs
for select
to anon, authenticated
using (true);

-- One-time carry-over of the existing history from the legacy location, so nothing is lost.
-- Does nothing if there is no legacy history or if this table already has a row.
insert into public.sync_logs (id, logs)
select 'global', s.header_visibility -> 'sync_logs'
from public.site_settings s
where s.id = 'global'
  and jsonb_typeof(s.header_visibility -> 'sync_logs') = 'array'
on conflict (id) do nothing;

comment on table public.sync_logs is
  'Recent auto-sync run history for the admin panel (single row, id = global).';
