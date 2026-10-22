import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

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

function syncSourcesDevPlugin() {
  return {
    name: 'sync-sources-dev-server',
    configureServer(server: any) {
      server.middlewares.use(seriesReportDevMiddleware());
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
  plugins: [react(), tailwindcss(), syncSourcesDevPlugin()],
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
