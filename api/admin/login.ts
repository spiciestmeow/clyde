import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  setNoStore,
  type AdminApiRequest,
  type AdminApiResponse,
} from '../_lib/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVER_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'clydhex@gmail.com').trim().toLowerCase();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVER_KEY) {
    response.status(503).json({ error: 'Admin sign-in is not configured on the server.' });
    return;
  }

  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || password.length > 1024) {
    response.status(400).json({ error: 'Enter a valid email and password.' });
    return;
  }

  const realIpHeader = request.headers['x-real-ip'];
  const forwardedForHeader = request.headers['x-forwarded-for'];
  const requesterIp = (Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader) ||
    (!process.env.VERCEL ? (Array.isArray(forwardedForHeader) ? forwardedForHeader[0] : forwardedForHeader)?.split(',')[0]?.trim() : '') ||
    (!process.env.VERCEL ? 'local' : '');
  if (!requesterIp) {
    response.status(503).json({ error: 'Sign-in rate limiting is unavailable.' });
    return;
  }

  const rateLimitSecret = process.env.ADMIN_LOGIN_RATE_LIMIT_SECRET || SUPABASE_SERVER_KEY;
  const requesterHash = createHmac('sha256', rateLimitSecret).update(requesterIp).digest('hex');
  const serverClient = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, { auth: { persistSession: false } });
  const { data: attemptCount, error: limitError } = await serverClient.rpc('consume_admin_login_attempt', {
    p_requester_hash: requesterHash,
  });
  if (limitError) {
    console.error('Admin login rate limit is unavailable:', limitError.message);
    response.status(503).json({ error: 'Admin sign-in is temporarily unavailable.' });
    return;
  }
  if (Number(attemptCount) > LOGIN_MAX_ATTEMPTS) {
    response.setHeader('Retry-After', String(LOGIN_WINDOW_SECONDS));
    response.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    return;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session || data.user.email?.trim().toLowerCase() !== ADMIN_EMAIL) {
    response.status(401).json({ error: 'Sign in failed. Check your admin email and password.' });
    return;
  }

  const { error: clearError } = await serverClient.rpc('clear_admin_login_failures', {
    p_requester_hash: requesterHash,
  });
  if (clearError) console.error('Could not clear admin sign-in failures:', clearError.message);
  response.status(200).json({ session: data.session });
}

