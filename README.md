# Vortex Scans Homepage

Standalone React/Vite source package configured for Vercel.

## Run locally

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev
```

## Deploy to Vercel

1. Extract this folder and push it to a Git provider connected to Vercel.
2. Import the repository as a new Vercel project.
3. Keep the project root at this folder. Vercel uses `vercel.json` to run the build and publish `dist/`.

The frontend build does not need a separate API server. The Vercel API functions do need the runtime environment variables shown in `.env.example`; in particular, set `CRON_SECRET` and a server-only `SUPABASE_SERVICE_ROLE_KEY` (never prefix the service-role key with `VITE_`). Configure your scheduled caller to send `Authorization: Bearer <CRON_SECRET>`. The admin dashboard's manual sync uses a verified Supabase session and the `ADMIN_EMAIL` account.

After deploying the code, run `supabase/series-catalog.sql`, `supabase/series-bookmarks.sql`, and `supabase/admin-login-rate-limit.sql` in the Supabase SQL editor. The catalog script restricts catalog writes to the admin email (update the email in the SQL policy if needed); the bookmark script installs the atomic bookmark function and its rate-limit table; the login script installs the shared sign-in attempt counter. These database changes are required for the corresponding protections and APIs to work.

## Build checks

```sh
npm run typecheck
npm run build
```

## Supabase Database Migration Guide

Follow this guide whenever you need to migrate your database from one Supabase account/project to another without any data loss or downtime.

### Prerequisites

Install the PostgreSQL command-line tools (`pg_dump` and `psql`):
- **Windows**: Download from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) (during setup, you only need to select **Command Line Tools**).
- **macOS**: `brew install libpq && brew link --force libpq`
- **Linux**: `sudo apt install postgresql-client`

Find your database connection strings:
- Supabase Dashboard → **Project Settings** → **Database** → **Connection string** → **URI** (Session mode on port 5432).

---

### Step 1: Dump Old Database

Export all tables, rows, functions, triggers, sequences, and RLS policies into a backup file:

```powershell
pg_dump "postgresql://postgres:[OLD_DB_PASSWORD]@db.[OLD_PROJECT_REF].supabase.co:5432/postgres" `
  --schema=public `
  --no-owner `
  --no-acl `
  -f clydee-backup.sql
```

---

### Step 2: Restore into New Database

Restore the full schema and data into your new Supabase project:

```powershell
psql "postgresql://postgres:[NEW_DB_PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" `
  -f clydee-backup.sql
```

> **Note:** A notice saying `ERROR: schema "public" already exists` is normal and completely harmless — `pg_dump` tries to recreate the schema that Supabase creates by default.

---

### Step 3: Configure Storage (Covers Bucket)

`pg_dump` covers the `public` database schema, but Supabase file storage is managed separately.

To configure the storage bucket and its upload permissions:
1. Open the **SQL Editor** in your new Supabase dashboard.
2. Run the file [`supabase/storage-covers.sql`](./supabase/storage-covers.sql):
   ```sql
   -- Creates the 'covers' bucket and enables public viewing + upload permissions
   insert into storage.buckets (id, name, public)
   values ('covers', 'covers', true)
   on conflict (id) do update set public = true;

   drop policy if exists "Public read access for covers" on storage.objects;
   create policy "Public read access for covers"
   on storage.objects for select to public
   using (bucket_id = 'covers');

   drop policy if exists "Allow upload to covers" on storage.objects;
   create policy "Allow upload to covers"
   on storage.objects for insert to authenticated, anon
   with check (bucket_id = 'covers');

   drop policy if exists "Allow update to covers" on storage.objects;
   create policy "Allow update to covers"
   on storage.objects for update to authenticated, anon
   using (bucket_id = 'covers');
   ```

---

### Step 4: Recreate the Admin User

`pg_dump` intentionally does not migrate Supabase Auth credentials. Recreate your admin account:
1. New Supabase Dashboard → **Authentication** → **Users** → **Add user**.
2. Enter your admin email (e.g. `clydhex@gmail.com`) and choose a password.
3. Check **Auto Confirm User** and click **Create user**.

---

### Step 5: Update Environment Variables

Retrieve your API keys from **Project Settings** → **API** in the new Supabase dashboard.

1. Update `.env.local` for local development:
   ```env
   VITE_SUPABASE_URL=https://[NEW_PROJECT_REF].supabase.co
   VITE_SUPABASE_ANON_KEY=[NEW_ANON_KEY]
   SUPABASE_SERVICE_ROLE_KEY=[NEW_SERVICE_ROLE_KEY]
   ```
2. Update the same 3 variables in **Vercel** → **Project Settings** → **Environment Variables**.
3. Redeploy your project on Vercel.

---

### Step 6: Verification

Run these quick checks in the new project's **SQL Editor**:

```sql
-- 1. Check that series and notification counts match the old database
select count(*) as series_count from public.series;
select count(*) as notifications_count from public.notifications;

-- 2. Confirm the auto-increment sequence was preserved (prevents ID collisions on new series)
select last_value from public.series_id_seq;

-- 3. Confirm site settings (social links, visibility toggles) are loaded
select * from public.site_settings;
```

---

## Scope and external assets

This package contains the current homepage front end and its captured content data. It does not include the original site's backend, accounts, catalog API, or other server-side services. Many cover images and decorative assets are served from the Vortex Scans public image host, so their availability is controlled by that host.
