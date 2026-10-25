import type { IncomingMessage, ServerResponse } from 'node:http';
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

  if (!seriesSlug) {
    response.status(400).json({ error: 'Missing series slug.' });
    return;
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, {
      auth: { persistSession: false },
    });

    // 1. Fetch current series
    const { data: currentSeries, error: fetchError } = await supabase
      .from('series')
      .select('id, favorites')
      .eq('slug', seriesSlug)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!currentSeries) {
      response.status(404).json({ error: 'Series not found.' });
      return;
    }

    const currentCount = parseInt(String(currentSeries.favorites || '0').replace(/[^\d]/g, ''), 10) || 0;
    const newCount = action === 'bookmark' ? currentCount + 1 : Math.max(0, currentCount - 1);

    // 2. Update series table
    const { error: updateError } = await supabase
      .from('series')
      .update({
        favorites: String(newCount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentSeries.id);

    if (updateError) throw updateError;

    response.status(200).json({ ok: true, favorites: newCount });
  } catch (error) {
    console.error('Failed to update series favorite:', error);
    response.status(500).json({ error: 'Failed to update favorite count.' });
  }
}
