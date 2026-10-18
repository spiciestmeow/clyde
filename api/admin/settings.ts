import {
  isAdminAuthenticated,
  setNoStore,
  type AdminApiRequest,
  type AdminApiResponse,
} from '../_lib/auth.js';
import {
  getSiteSettings,
  parseHeaderVisibility,
  saveSiteSettings,
} from '../_lib/db.js';

export default async function handler(
  request: AdminApiRequest,
  response: AdminApiResponse,
): Promise<void> {
  setNoStore(response);

  if (request.method === 'GET') {
    try {
      response.status(200).json(await getSiteSettings());
    } catch (error) {
      console.error('Failed to load site settings:', error);
      response.status(503).json({ error: 'Site settings are unavailable.' });
    }
    return;
  }

  if (request.method === 'PUT') {
    if (!isAdminAuthenticated(request)) {
      response.status(401).json({ error: 'Admin sign-in required.' });
      return;
    }

    const body = request.body && typeof request.body === 'object'
      ? request.body as Record<string, unknown>
      : {};
    const headerVisibility = parseHeaderVisibility(body.headerVisibility);
    if (!headerVisibility) {
      response.status(400).json({ error: 'Invalid header visibility settings.' });
      return;
    }

    try {
      response.status(200).json(await saveSiteSettings(headerVisibility));
    } catch (error) {
      console.error('Failed to save site settings:', error);
      response.status(503).json({ error: 'Site settings could not be saved.' });
    }
    return;
  }

  response.setHeader('Allow', 'GET, PUT');
  response.status(405).json({ error: 'Method not allowed.' });
}

