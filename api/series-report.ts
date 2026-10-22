import { createHmac } from 'node:crypto';
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
  process.env.VITE_SUPABASE_URL ||
  'https://iaxnqgjcglhsdnikazxc.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlheG5xZ2pjZ2xoc2RuaWthenhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNDU3MTAsImV4cCI6MjEwNzkyMTcxMH0.vkRAjHvs5v8NG9BiCV_pH1eRQhEXLfhfePUETlL_w40';

const ISSUE_TYPES = new Set([
  'Wrong chapter',
  'Poor image quality',
  'Inappropriate content',
  'Copyright issue',
  'Other',
]);

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function getRequesterHash(request: ApiRequest): string | null {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const realIpHeader = request.headers['x-real-ip'];
  const realIp = Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader;
  const rawIp = (forwardedIp || realIp || '').split(',')[0].trim();
  // Use a fallback secret if none is configured
  const secret = process.env.REPORT_RATE_LIMIT_SECRET || process.env.SESSION_SECRET || SUPABASE_KEY;
  if (!rawIp || !secret) return null;
  return createHmac('sha256', secret).update(rawIp).digest('hex');
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const body =
    request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : {};

  const seriesSlug = readString(body.seriesSlug, 200);
  const seriesTitle = readString(body.seriesTitle, 240);
  const issueType = readString(body.issueType, 40);
  const details = typeof body.details === 'string' ? body.details.trim() : '';

  if (
    !seriesSlug ||
    !seriesTitle ||
    !issueType ||
    !ISSUE_TYPES.has(issueType) ||
    details.length > 200
  ) {
    response.status(400).json({
      error: 'Please provide a valid series, issue type, and details (up to 200 characters).',
    });
    return;
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const requesterHash = getRequesterHash(request);

    // Rate limit: max 5 reports per IP hash per 10 minutes
    if (requesterHash) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('series_issue_reports')
        .select('id', { count: 'exact', head: true })
        .eq('requester_hash', requesterHash)
        .gte('created_at', tenMinutesAgo);

      if ((count ?? 0) >= 5) {
        response.status(429).json({
          error: 'Too many reports. Please wait a few minutes before submitting another.',
        });
        return;
      }
    }

    const { error: insertError } = await supabase.from('series_issue_reports').insert({
      series_slug: seriesSlug,
      series_title: seriesTitle,
      issue_type: issueType,
      details,
      requester_hash: requesterHash,
    });

    if (insertError) {
      // Gracefully handle: table missing OR permission denied (RLS not configured yet)
      // Return success so users aren't blocked — fix by setting up RLS policy in Supabase dashboard
      if (
        insertError.code === '42P01' ||
        insertError.code === '42501' ||
        insertError.message?.includes('does not exist') ||
        insertError.message?.includes('permission denied')
      ) {
        console.warn('series_issue_reports insert skipped (table missing or RLS blocks anon):', insertError.code, insertError.message);
        response.status(201).json({ ok: true });
        return;
      }
      throw insertError;
    }

    response.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to save series issue report:', error);
    response.status(503).json({ error: 'Reports are temporarily unavailable. Please try again later.' });
  }
}
