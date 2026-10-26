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

After deploying the code, run the updated `supabase/series-catalog.sql` and `supabase/series-bookmarks.sql` in the Supabase SQL editor. The first restricts catalog writes to the configured admin email (update the email in the SQL policy if needed); the second installs the atomic bookmark function and its rate-limit table. These database changes are required for the corresponding protections and bookmark API to work.

## Build checks

```sh
npm run typecheck
npm run build
```

## Scope and external assets

This package contains the current homepage front end and its captured content data. It does not include the original site's backend, accounts, catalog API, or other server-side services. Many cover images and decorative assets are served from the Vortex Scans public image host, so their availability is controlled by that host.
