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
  process.env.VITE_SUPABASE_URL;

// Use a server-only key; never fall back to the browser's anon key here.
const SUPABASE_SERVER_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ISSUE_TYPES = new Set([
  // Series-specific
  'Wrong chapter',
  'Poor image quality',
  'Inappropriate content',
  'Copyright issue',
  // Homepage / general
  'General Issue',
  'Website Bug',
  'Something Not Working',
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
  const secret =
    process.env.REPORT_RATE_LIMIT_SECRET ||
    process.env.SESSION_SECRET ||
    SUPABASE_SERVER_KEY;
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

  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) {
    response.status(503).json({
      error: 'Report submission is not configured. Please try again later.',
    });
    return;
  }

  const body =
    request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : {};

  const seriesSlug = readString(body.seriesSlug, 200);
  const seriesTitle = readString(body.seriesTitle, 240);
  const issueType = readString(body.issueType, 60);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  const source = body.source === 'homepage' ? 'homepage' : 'series';

  if (
    !issueType ||
    !ISSUE_TYPES.has(issueType) ||
    details.length > 5000 ||
    title.length > 120
  ) {
    response.status(400).json({
      error: 'Please provide a valid issue type and details.',
    });
    return;
  }

  // Series reports require seriesSlug + seriesTitle
  if (source === 'series' && (!seriesSlug || !seriesTitle)) {
    response.status(400).json({
      error: 'Please provide a valid series, issue type, and details (up to 200 characters).',
    });
    return;
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, {
      auth: { persistSession: false },
    });

    const requesterHash = getRequesterHash(request);

    // Rate limit: max 5 reports per IP hash per 10 minutes
    if (requesterHash) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabase
        .from('series_issue_reports')
        .select('id', { count: 'exact', head: true })
        .eq('requester_hash', requesterHash)
        .gte('created_at', tenMinutesAgo);

      if (countError) throw countError;

      if ((count ?? 0) >= 5) {
        response.status(429).json({
          error: 'Too many reports. Please wait a few minutes before submitting another.',
        });
        return;
      }
    }

    const { error: insertError } = await supabase.from('series_issue_reports').insert({
      ...(seriesSlug ? { series_slug: seriesSlug } : {}),
      ...(seriesTitle ? { series_title: seriesTitle } : {}),
      issue_type: issueType,
      ...(title ? { title } : {}),
      details,
      source,
      requester_hash: requesterHash,
    });

    if (insertError) throw insertError;

    response.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to save series issue report:', error);
    response.status(503).json({ error: 'Reports are temporarily unavailable. Please try again later.' });
  }
}
