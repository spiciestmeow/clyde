-- Run in Supabase SQL Editor to configure the covers storage bucket and upload policies.

-- 1. Create or ensure the 'covers' bucket exists as public
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

-- 2. Allow anyone to view cover images
drop policy if exists "Public read access for covers" on storage.objects;
create policy "Public read access for covers"
on storage.objects for select
to public
using (bucket_id = 'covers');

-- 3. Allow uploading images into the 'covers' bucket
drop policy if exists "Allow upload to covers" on storage.objects;
create policy "Allow upload to covers"
on storage.objects for insert
to authenticated, anon
with check (bucket_id = 'covers');

-- 4. Allow updating/overwriting existing covers in the bucket
drop policy if exists "Allow update to covers" on storage.objects;
create policy "Allow update to covers"
on storage.objects for update
to authenticated, anon
using (bucket_id = 'covers');
