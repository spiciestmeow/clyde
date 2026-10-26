import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const SUPABASE_SERVER_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) {
    response.status(503).json({
      error: 'Supabase is not configured on the server.',
    });
    return;
  }

  const body =
    request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : {};

  const seriesSlug = typeof body.seriesSlug === 'string' ? body.seriesSlug.trim() : '';
  const action = body.action === 'unbookmark' ? 'unbookmark' : 'bookmark';
  const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim() : '';

  if (!seriesSlug) {
    response.status(400).json({ error: 'Missing series slug.' });
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) {
    response.status(400).json({ error: 'A valid visitor ID is required.' });
    return;
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, {
      auth: { persistSession: false },
    });

    const realIp = request.headers['x-real-ip'];
    const forwardedFor = request.headers['x-forwarded-for'];
    const rawIp = (Array.isArray(realIp) ? realIp[0] : realIp) ||
      (!process.env.VERCEL ? (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(',')[0]?.trim() : '') || '';
    if (process.env.VERCEL && !rawIp) {
      response.status(503).json({ error: 'Bookmark rate limiting is unavailable.' });
      return;
    }
    const rateLimitSecret = process.env.BOOKMARK_RATE_LIMIT_SECRET || process.env.SESSION_SECRET || SUPABASE_SERVER_KEY;
    const requesterHash = rawIp && rateLimitSecret
      ? createHmac('sha256', rateLimitSecret).update(rawIp).digest('hex')
      : null;

    const { data: favorites, error } = await supabase.rpc('toggle_series_bookmark', {
      p_series_slug: seriesSlug,
      p_visitor_id: visitorId,
      p_action: action,
      p_requester_hash: requesterHash,
    });
    if (error) {
      if (error.message.includes('rate limit')) {
        response.status(429).json({ error: 'Too many bookmark changes. Please try again later.' });
        return;
      }
      if (error.message.includes('Unknown series')) {
        response.status(404).json({ error: 'Series not found.' });
        return;
      }
      throw error;
    }

    response.status(200).json({ ok: true, favorites: Number(favorites) });
  } catch (error) {
    console.error('Failed to update series favorite:', error);
    response.status(500).json({ error: 'Failed to update favorite count.' });
  }
}
