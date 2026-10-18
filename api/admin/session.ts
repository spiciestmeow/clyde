import {
  isAdminAuthenticated,
  setNoStore,
  type AdminApiRequest,
  type AdminApiResponse,
} from '../_lib/auth.js';

export default async function handler(
  request: AdminApiRequest,
  response: AdminApiResponse,
): Promise<void> {
  setNoStore(response);
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  response.status(200).json({
    authenticated: isAdminAuthenticated(request),
  });
}

