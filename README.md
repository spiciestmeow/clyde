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

No environment variables or separate API server are required for this front-end build.

## Build checks

```sh
npm run typecheck
npm run build
```

## Scope and external assets

This package contains the current homepage front end and its captured content data. It does not include the original site's backend, accounts, catalog API, or other server-side services. Many cover images and decorative assets are served from the Vortex Scans public image host, so their availability is controlled by that host.
