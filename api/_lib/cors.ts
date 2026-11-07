import type { IncomingMessage, ServerResponse } from 'node:http';

export interface CorsOptions {
  methods?: string[];
  allowedHeaders?: string[];
}

/**
 * Checks if the request origin matches allowed domains:
 * - Same origin / non-browser requests (null origin)
 * - Localhost dev server (e.g. http://localhost:5173, http://localhost:3000, 127.0.0.1)
 * - Any Vercel deployment for this project (*.vercel.app)
 * - Explicit production site URL if configured in SITE_URL or VERCEL_PROJECT_PRODUCTION_URL
 */
export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    // Allow local development servers
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    // Allow all Vercel deployments (production + preview branch URLs)
    if (hostname.endsWith('.vercel.app')) {
      return true;
    }

    // Allow configured custom domain in SITE_URL
    if (process.env.SITE_URL) {
      try {
        const siteUrl = new URL(process.env.SITE_URL);
        if (hostname === siteUrl.hostname.toLowerCase()) {
          return true;
        }
      } catch {
        if (origin === process.env.SITE_URL) return true;
      }
    }

    // Allow Vercel production domain if set
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL.toLowerCase();
      if (hostname === prodHost || hostname === `www.${prodHost}`) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Sets tight CORS headers allowing only authorized Clydee origins.
 * Returns true if the request was an OPTIONS preflight and has been handled.
 */
export function handleCors(
  request: IncomingMessage,
  response: ServerResponse,
  options: CorsOptions = {}
): boolean {
  const originHeader = request.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (origin && isAllowedOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }

  const methods = options.methods ?? ['GET', 'POST', 'OPTIONS'];
  response.setHeader('Access-Control-Allow-Methods', methods.join(', '));

  const headers = options.allowedHeaders ?? ['Content-Type', 'Authorization'];
  response.setHeader('Access-Control-Allow-Headers', headers.join(', '));

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return true;
  }

  return false;
}
