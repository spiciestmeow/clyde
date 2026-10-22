import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSeriesIssueReport } from './_lib/db.js';

interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

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
  const secret = process.env.REPORT_RATE_LIMIT_SECRET || process.env.SESSION_SECRET || process.env.DATABASE_URL;
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

  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
  const seriesSlug = readString(body.seriesSlug, 200);
  const seriesTitle = readString(body.seriesTitle, 240);
  const issueType = readString(body.issueType, 40);
  const details = typeof body.details === 'string' ? body.details.trim() : null;

  if (!seriesSlug || !seriesTitle || !issueType || !ISSUE_TYPES.has(issueType) || details === null || details.length > 200) {
    response.status(400).json({ error: 'Please provide a valid series, issue type, and details (up to 200 characters).' });
    return;
  }

  try {
    await createSeriesIssueReport({
      seriesSlug,
      seriesTitle,
      issueType,
      details,
      requesterHash: getRequesterHash(request),
    });
    response.status(201).json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'SERIES_REPORT_RATE_LIMIT') {
      response.status(429).json({ error: 'Too many reports. Please wait a few minutes before submitting another.' });
      return;
    }
    console.error('Failed to save series issue report:', error);
    response.status(503).json({ error: 'Reports are temporarily unavailable. Please try again later.' });
  }
}
