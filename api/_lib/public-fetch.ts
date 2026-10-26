import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 4000;

function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  const family = isIP(normalized);
  if (family === 4) {
    const octets = normalized.split('.').map(Number);
    const [a, b] = octets;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      (a === 255 && b === 255)
    );
  }
  if (family === 6) {
    // Only globally routable unicast IPv6 addresses (2000::/3) are accepted.
    return normalized.startsWith('2') || normalized.startsWith('3');
  }
  return false;
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: number }> {
  const unwrappedHost = hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(unwrappedHost);
  if (literalFamily) {
    if (!isPublicAddress(unwrappedHost)) throw new Error('Source URL resolves to a non-public address.');
    return { address: unwrappedHost, family: literalFamily };
  }

  const addresses = await lookup(unwrappedHost, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Source URL resolves to a non-public address.');
  }
  return { address: addresses[0].address, family: addresses[0].family };
}

function readLimitedBody(response: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_RESPONSE_BYTES) {
        response.destroy(new Error('Source response exceeded the 5 MB limit.'));
        return;
      }
      chunks.push(buffer);
    });
    response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    response.on('error', reject);
  });
}

function requestOnce(url: URL, address: string, family: number): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requestImpl(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VortexScans/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, resolve);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Source request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchPublicPage(input: string): Promise<{ ok: boolean; status: number; url: string; text: string }> {
  let currentUrl = new URL(input);
  for (let redirects = 0; ; redirects += 1) {
    if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS source URLs are allowed.');
    }
    if (currentUrl.username || currentUrl.password) throw new Error('Source URLs cannot include credentials.');

    const { address, family } = await resolvePublicAddress(currentUrl.hostname);
    const response = await requestOnce(currentUrl, address, family);
    const status = response.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location;
      response.destroy();
      if (!location || redirects >= MAX_REDIRECTS) throw new Error('Source URL redirected too many times.');
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    const text = await readLimitedBody(response);
    return { ok: status >= 200 && status < 300, status, url: currentUrl.toString(), text };
  }
}
