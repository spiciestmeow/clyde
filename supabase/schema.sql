-- Create the admin user first in Supabase Dashboard > Authentication > Users.
-- Replace the email below with the exact email used for that admin user.

create table if not exists public.site_settings (
  id text primary key check (id = 'global'),
  header_visibility jsonb not null default '{
    "home": true,
    "series": true,
    "shop": true,
    "community": true,
    "search": true,
    "bookmarks": true,
    "notifications": true,
    "theme": true,
    "account": true,
    "discord": true
  }'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id)
values ('global')
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings"
on public.site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Admin can update site settings" on public.site_settings;
create policy "Admin can update site settings"
on public.site_settings
for update
to authenticated
using (lower((select auth.jwt() ->> 'email')) = lower('clydhex@gmail.com'))
with check (lower((select auth.jwt() ->> 'email')) = lower('clydhex@gmail.com'));
