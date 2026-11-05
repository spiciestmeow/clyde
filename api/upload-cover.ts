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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { isAdminAuthenticated, setNoStore } from './_lib/auth.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setNoStore(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!isAdminAuthenticated(req as Parameters<typeof isAdminAuthenticated>[0])) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  // ── Validate body ──────────────────────────────────────────────────────────
  const body = req.body as Partial<UploadBody>;
  const { fileName, contentType, fileBase64 } = body ?? {};

  if (!fileName || typeof fileName !== 'string' || fileName.includes('/') || fileName.includes('..')) {
    return res.status(400).json({ error: 'Invalid fileName.' });
  }
  if (!contentType || typeof contentType !== 'string' || !contentType.startsWith('image/')) {
    return res.status(400).json({ error: 'Invalid contentType — must be an image/* MIME type.' });
  }
  if (!fileBase64 || typeof fileBase64 !== 'string') {
    return res.status(400).json({ error: 'Missing fileBase64.' });
  }

  // ── Size guard (10 MB max before base64 overhead) ─────────────────────────
  const buffer = Buffer.from(fileBase64, 'base64');
  if (buffer.length > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'File exceeds the 10 MB limit.' });
  }

  // ── Upload to R2 ───────────────────────────────────────────────────────────
  const bucket = process.env.R2_BUCKET_NAME ?? 'covers';
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');

  if (!publicBase) {
    return res.status(500).json({ error: 'R2_PUBLIC_URL is not configured.' });
  }

  try {
    const r2 = getR2();

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: fileName,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
      }),
    );

    const publicUrl = `${publicBase}/${fileName}`;
    return res.status(200).json({ publicUrl });
  } catch (err) {
    console.error('[upload-cover] R2 upload error:', err);
    return res.status(500).json({ error: 'Upload to R2 failed. Check server logs.' });
  }
}
