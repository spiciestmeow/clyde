import {
  createAdminSessionCookie,
  isAdminAuthConfigured,
  matchesAdminPassword,
  setNoStore,
  type AdminApiRequest,
  type AdminApiResponse,
} from '../_lib/auth.js';

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

  const body = request.body && typeof request.body === 'object'
    ? request.body as Record<string, unknown>
    : {};

  if (!matchesAdminPassword(body.password)) {
    response.status(401).json({ error: 'Invalid password.' });
    return;
  }

  response.setHeader('Set-Cookie', createAdminSessionCookie());
  response.status(200).json({ authenticated: true });
}

