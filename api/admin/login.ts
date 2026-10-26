import {
  createAdminSessionCookie,
  isAdminAuthConfigured,
  matchesAdminPassword,
  setNoStore,
  type AdminApiRequest,
  type AdminApiResponse,
} from '../_lib/auth.js';

const failedAttempts = new Map<string, { count: number; windowStartedAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export default async function handler(
  request: AdminApiRequest,
  response: AdminApiResponse,
): Promise<void> {
  setNoStore(response);
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!isAdminAuthConfigured()) {
    response.status(503).json({ error: 'Admin access is not configured.' });
    return;
  }

  const realIpHeader = request.headers['x-real-ip'];
  const forwardedForHeader = request.headers['x-forwarded-for'];
  const requesterIp = (Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader) ||
    (Array.isArray(forwardedForHeader) ? forwardedForHeader[0] : forwardedForHeader)?.split(',')[0]?.trim() ||
    'unknown';
  const now = Date.now();
  for (const [ip, entry] of failedAttempts) {
    if (now - entry.windowStartedAt >= LOGIN_WINDOW_MS) failedAttempts.delete(ip);
  }
  if (failedAttempts.size > 10_000) {
    const oldestKeys = [...failedAttempts.keys()].slice(0, 1_000);
    for (const ip of oldestKeys) failedAttempts.delete(ip);
  }
  const attempt = failedAttempts.get(requesterIp);
  if (attempt && now - attempt.windowStartedAt < LOGIN_WINDOW_MS && attempt.count >= LOGIN_MAX_ATTEMPTS) {
    response.setHeader('Retry-After', String(Math.ceil((LOGIN_WINDOW_MS - (now - attempt.windowStartedAt)) / 1000)));
    response.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
    return;
  }

  const body = request.body && typeof request.body === 'object'
    ? request.body as Record<string, unknown>
    : {};

  if (!matchesAdminPassword(body.password)) {
    if (!attempt || now - attempt.windowStartedAt >= LOGIN_WINDOW_MS) {
      failedAttempts.set(requesterIp, { count: 1, windowStartedAt: now });
    } else {
      attempt.count += 1;
      failedAttempts.set(requesterIp, attempt);
    }
    response.status(401).json({ error: 'Invalid password.' });
    return;
  }

  failedAttempts.delete(requesterIp);
  response.setHeader('Set-Cookie', createAdminSessionCookie());
  response.status(200).json({ authenticated: true });
}

