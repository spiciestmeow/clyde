import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'vortex_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface AdminApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface AdminApiResponse {
  setHeader(name: string, value: string | string[]): void;
  status(code: number): AdminApiResponse;
  json(body: unknown): void;
}

interface SessionPayload {
  role: 'admin';
  expiresAt: number;
}

function readHeader(request: AdminApiRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function readCookie(request: AdminApiRequest, name: string): string | undefined {
  const cookieHeader = readHeader(request, 'cookie');
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

function signature(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function equalStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_PASSWORD.length >= 12 &&
      process.env.SESSION_SECRET &&
      process.env.SESSION_SECRET.length >= 32,
  );
}

export function matchesAdminPassword(candidate: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== 'string' || candidate.length > 1024) return false;
  return equalStrings(candidate, expected);
}

export function createAdminSessionCookie(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }

  const payload: SessionPayload = {
    role: 'admin',
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${encodedPayload}.${signature(encodedPayload, secret)}`;
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearAdminSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function isAdminAuthenticated(request: AdminApiRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  const token = readCookie(request, COOKIE_NAME);
  if (!secret || secret.length < 32 || !token) return false;

  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;

  const encodedPayload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!equalStrings(suppliedSignature, signature(encodedPayload, secret))) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<SessionPayload>;
    return payload.role === 'admin' &&
      typeof payload.expiresAt === 'number' &&
      payload.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function setNoStore(response: AdminApiResponse): void {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
}

    