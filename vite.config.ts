import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const root = path.dirname(fileURLToPath(import.meta.url));

function seriesReportDevMiddleware() {
  return async (request: any, response: any, next: any) => {
    const pathname = request.url ? new URL(request.url, 'http://localhost').pathname : '';
    if (pathname !== '/api/series-report') {
      next();
      return;
    }

    let rawBody = '';
    request.on('data', (chunk: Buffer) => {
      rawBody += chunk.toString();
      if (rawBody.length > 16_384) {
        response.statusCode = 413;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: 'Report request is too large.' }));
        request.destroy();
      }
    });
    request.on('end', async () => {
      if (response.writableEnded) return;

      let body: unknown = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        response.statusCode = 400;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: 'Invalid JSON request body.' }));
        return;
      }

      const apiResponse = {
        setHeader: response.setHeader.bind(response),
        status(code: number) {
          response.statusCode = code;
          return apiResponse;
        },
        json(payload: unknown) {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(payload));
        },
      };

      try {
        const { default: handler } = await import('./api/series-report.ts');
        await handler({ method: request.method, headers: request.headers, body } as any, apiResponse as any);
      } catch (error) {
        console.error('Series report dev API failed:', error);
        if (!response.writableEnded) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Reports are temporarily unavailable.' }));
        }
      }
    });
  };
}

function seriesFavoriteDevMiddleware() {
  return async (request: any, response: any, next: any) => {
    const pathname = request.url ? new URL(request.url, 'http://localhost').pathname : '';
    if (pathname !== '/api/series-favorite') {
      next();
      return;
    }

    let rawBody = '';
    request.on('data', (chunk: Buffer) => {
      rawBody += chunk.toString();
    });
    request.on('end', async () => {
      if (response.writableEnded) return;

      let body: unknown = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        response.statusCode = 400;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: 'Invalid JSON request body.' }));
        return;
      }

      const apiResponse = {
        setHeader: response.setHeader.bind(response),
        status(code: number) {
          response.statusCode = code;
          return apiResponse;
        },
        json(payload: unknown) {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(payload));
        },
      };

      try {
        const { default: handler } = await import('./api/series-favorite.ts');
        await handler({ method: request.method, headers: request.headers, body } as any, apiResponse as any);
      } catch (error) {
        console.error('Series favorite dev API failed:', error);
        if (!response.writableEnded) {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Favorites are temporarily unavailable.' }));
        }
      }
    });
  };
}

function syncSourcesDevPlugin() {
  return {
    name: 'sync-sources-dev-server',
    configureServer(server: any) {
      server.middlewares.use(seriesReportDevMiddleware());
      server.middlewares.use(seriesFavoriteDevMiddleware());
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/sync-direct-sources')) {
          try {
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                let parsed: any = {};
                if (body) {
                  try {
                    parsed = JSON.parse(body);
                  } catch {
                    // ignore
                  }
                }
                const { scrapeDirectSources } = await import('./api/sync-direct-sources.ts');
                const result = await scrapeDirectSources(parsed.sources || [], parsed.title || '');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, message: err?.message || 'Direct sync failed' }));
              }
            });
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, message: err?.message || 'Direct sync failed' }));
          }
          return;
        }

        if (req.url && req.url.startsWith('/api/sync-sources')) {
          try {
            const url = new URL(req.url, 'http://localhost');
            const title = url.searchParams.get('title') || '';
            if (!title.trim()) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Please provide a title' }));
              return;
            }
            const { fetchScanlationSources } = await import('./api/sync-sources.ts');
            const result = await fetchScanlationSources(title);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Sync failed' }));
          }
          return;
        }
        if (req.url && req.url.startsWith('/api/import-series')) {
          try {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', async () => {
              try {
                let parsed: any = {};
                if (body) {
                  try { parsed = JSON.parse(body); } catch {}
                }
                const url = new URL(req.url, 'http://localhost');
                const reqParam = parsed.url || url.searchParams.get('url') || '';
                const { default: handler } = await import('./api/import-series.ts');
                const mockReq = { method: req.method, url: req.url, body: { url: reqParam } };
                const mockRes = {
                  setHeader: res.setHeader.bind(res),
                  status(code: number) { res.statusCode = code; return mockRes; },
                  json(payload: any) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(payload));
                  },
                };
                await handler(mockReq as any, mockRes as any);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: err?.message || 'Import failed' }));
              }
            });
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err?.message || 'Import failed' }));
          }
          return;
        }

        next();
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(seriesReportDevMiddleware());
    },
  };
}

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, root, '');
  for (const key of [
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'DATABASE_URL',
    'SESSION_SECRET',
    'REPORT_RATE_LIMIT_SECRET',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (!process.env[key] && serverEnv[key]) process.env[key] = serverEnv[key];
  }

  return {
  root,
  base: '/',
  plugins: [
      react(),
      tailwindcss(),
      syncSourcesDevPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['clydee-logo.png', 'favicon.svg', 'robots.txt', 'nocover.jpg'],
        manifest: {
          name: 'Clydee',
          short_name: 'Clydee',
          description: 'Read comics, manga, manhua, and manhwa translated swiftly on Clydee.',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          orientation: 'portrait-primary',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Cache static assets (JS, CSS, fonts, images) with cache-first
          // Exclude large assets (logo, seasonal images) from precache - they're served normally
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/clydee-logo.png', '**/trick_pumpkin.webp', '**/pwa-*.png'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB
          runtimeCaching: [
            // Supabase API — network-first (always fresh data)
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 5, // 5 minutes
                },
                networkTimeoutSeconds: 10,
              },
            },
            // Cover images from external CDNs — stale-while-revalidate
            {
              urlPattern: /^https:\/\/(uploads\.mangadex\.org|cdn\.mangadex\.org)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'cover-image-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
              },
            },
            // Google Fonts — cache first
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
              },
            },
          ],
          // Show offline fallback page when navigation fails
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          skipWaiting: true,
          clientsClaim: true,
        },
        devOptions: {
          // Enable PWA in dev mode for testing
          enabled: true,
          type: 'module',
        },
      }),
    ],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/mangadex-covers': {
        target: 'https://uploads.mangadex.org/covers',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex-covers/, ''),
        headers: {
          Referer: 'https://mangadex.org',
        },
      },
      '/api/mangadex': {
        target: 'https://api.mangadex.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/mangadex-covers': {
        target: 'https://uploads.mangadex.org/covers',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex-covers/, ''),
        headers: {
          Referer: 'https://mangadex.org',
        },
      },
      '/api/mangadex': {
        target: 'https://api.mangadex.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex/, ''),
      },
    },
  },
  };
});
