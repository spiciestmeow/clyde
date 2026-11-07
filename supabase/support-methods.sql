-- Donation "Support method" cards shown on /donate, managed in
-- Admin > Donation Supporters > Support Methods.
--
-- Stored in its own table (not in site_settings.header_visibility) so that sync jobs and
-- other admin saves that rewrite site_settings can never overwrite or wipe these methods.
--
-- Run this once in the Supabase SQL editor. Until it is run, /donate keeps showing the
-- built-in default methods and saving from the admin panel will show an error.
--
-- Replace the email below with the exact email of your admin user (same one used in schema.sql).

create table if not exists public.support_methods (
  id text primary key check (id = 'global'),
  methods jsonb not null default '[]'::jsonb
    check (jsonb_typeof(methods) = 'array' and octet_length(methods::text) <= 500000),
  updated_at timestamptz not null default now()
);

alter table public.support_methods enable row level security;

grant select on public.support_methods to anon, authenticated;
grant insert, update on public.support_methods to authenticated;

drop policy if exists "Anyone can read support methods" on public.support_methods;
create policy "Anyone can read support methods"
on public.support_methods
for select
to anon, authenticated
using (true);

drop policy if exists "Admin can insert support methods" on public.support_methods;
create policy "Admin can insert support methods"
on public.support_methods
for insert
to authenticated
with check (lower((select auth.jwt() ->> 'email')) = lower('clydhex@gmail.com'));

drop policy if exists "Admin can update support methods" on public.support_methods;
create policy "Admin can update support methods"
on public.support_methods
for update
to authenticated
using (lower((select auth.jwt() ->> 'email')) = lower('clydhex@gmail.com'))
with check (lower((select auth.jwt() ->> 'email')) = lower('clydhex@gmail.com'));

comment on table public.support_methods is
  'Support/payment method cards for the public /donate page (single row, id = global).';
