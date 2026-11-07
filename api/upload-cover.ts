// api/upload-cover.ts
//
// Vercel serverless function — receives a cover image from the browser,
// uploads it to Cloudflare R2, and returns the public URL.
//
// Required environment variables (set in Vercel Project Settings):
//   R2_ACCOUNT_ID        — Cloudflare Account ID
//   R2_ACCESS_KEY_ID     — R2 API Token Access Key ID
//   R2_SECRET_ACCESS_KEY — R2 API Token Secret Access Key
//   R2_BUCKET_NAME       — bucket name, e.g. "covers"
//   R2_PUBLIC_URL        — public base URL, e.g. "https://pub-xxxx.r2.dev"
//
// The route is protected: only authenticated admins (session cookie) may upload.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  isAdminAuthenticated,
  setNoStore,
  type AdminApiRequest,
  type AdminApiResponse,
} from './_lib/auth.js';

// ─── R2 client (singleton per warm Lambda invocation) ────────────────────────
let _r2: S3Client | null = null;

function getR2(): S3Client {
  if (_r2) return _r2;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials are not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).');
  }

  _r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return _r2;
}
// ─────────────────────────────────────────────────────────────────────────────

interface UploadBody {
  /** e.g. "my-series-1746612345678.webp"  (filename only, no slashes) */
  fileName: string;
  /** MIME type, e.g. "image/webp" */
  contentType: string;
  /** Base-64 encoded file bytes */
  fileBase64: string;
}

export default async function handler(req: AdminApiRequest, res: AdminApiResponse) {
  setNoStore(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  // Accepts admin cookie or Supabase JWT token from Authorization header
  const rawAuthHeader = req.headers['authorization'] ?? req.headers['Authorization'];
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  let isAuthorized = isAdminAuthenticated(req);

  if (!isAuthorized && token) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'clydhex@gmail.com').trim().toLowerCase();
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && anonKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
        const { data: { user } = { user: null } } = await (supabase.auth as any).getUser(token);
        if (user && user.email?.trim().toLowerCase() === adminEmail) {
          isAuthorized = true;
        }
      } catch {
        // invalid token
      }
    }
  }

  if (!isAuthorized) {
    res.status(401).json({ error: 'Unauthorized. Log in as admin first.' });
    return;
  }

  // ── Validate body ──────────────────────────────────────────────────────────
  const body = req.body as Partial<UploadBody>;
  const { fileName, contentType, fileBase64 } = body ?? {};

  if (!fileName || typeof fileName !== 'string' || fileName.includes('/') || fileName.includes('..')) {
    res.status(400).json({ error: 'Invalid fileName.' });
    return;
  }
  if (!contentType || typeof contentType !== 'string' || !contentType.startsWith('image/')) {
    res.status(400).json({ error: 'Invalid contentType — must be an image/* MIME type.' });
    return;
  }
  if (!fileBase64 || typeof fileBase64 !== 'string') {
    res.status(400).json({ error: 'Missing fileBase64.' });
    return;
  }

  // ── Size guard (10 MB max before base64 overhead) ─────────────────────────
  const buffer = Buffer.from(fileBase64, 'base64');
  if (buffer.length > 10 * 1024 * 1024) {
    res.status(413).json({ error: 'File exceeds the 10 MB limit.' });
    return;
  }

  // ── Upload to R2 ───────────────────────────────────────────────────────────
  const bucket = process.env.R2_BUCKET_NAME ?? 'covers';
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');

  if (!publicBase) {
    res.status(500).json({ error: 'R2_PUBLIC_URL is not configured.' });
    return;
  }

  try {
    const r2 = getR2();

    await (r2 as any).send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: fileName,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
      }),
    );

    const publicUrl = `${publicBase}/${fileName}`;
    res.status(200).json({ publicUrl });
    return;
  } catch (err) {
    console.error('[upload-cover] R2 upload error:', err);
    res.status(500).json({ error: 'Upload to R2 failed. Check server logs.' });
    return;
  }
}
