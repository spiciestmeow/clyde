import type { IncomingMessage, ServerResponse } from 'node:http';

interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

const TURNSTILE_SECRET =
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
  '0x4AAAAAAF0UX1Ig7xR1nJUg3wnX4t8B3_Y';

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

  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    response.status(400).json({ success: false, error: 'Missing Turnstile token.' });
    return;
  }

  try {
    const clientIp =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      undefined;

    const cfResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: TURNSTILE_SECRET,
        response: token,
        remoteip: clientIp,
      }),
    });

    const cfData = (await cfResponse.json()) as {
      success: boolean;
      'error-codes'?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (cfData.success) {
      response.status(200).json({ success: true });
    } else {
      response.status(400).json({
        success: false,
        error: 'Turnstile verification failed.',
        errorCodes: cfData['error-codes'],
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal verification error.';
    response.status(500).json({ success: false, error: message });
  }
}
