// api/admin/run-migration.ts
//
// One-time migration endpoint: copies all files from Supabase 'covers' → Cloudflare R2.
// Protected by admin session cookie — only you can trigger it.
// Call it from your browser after logging in as admin.
//
// GET  /api/admin/run-migration          → shows status / instructions
// POST /api/admin/run-migration          → runs the migration (streams progress as JSON lines)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { isAdminAuthenticated, setNoStore } from '../_lib/auth.js';

const SUPABASE_BUCKET = 'covers';
const SKIP_EXISTING   = true;

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
  return createClient(url, key);
}

function getR2() {
  const accountId      = process.env.R2_ACCOUNT_ID;
  const accessKeyId    = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured.');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function listAllFiles(supabase: ReturnType<typeof createClient>, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`List error (prefix="${prefix}"): ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        files.push(fullPath);
      } else {
        const sub = await listAllFiles(supabase, fullPath);
        files.push(...sub);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return files;
}

async function existsInR2(r2: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setNoStore(res);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isSecretBearer =
    cronSecret &&
    authHeader &&
    (authHeader === `Bearer ${cronSecret}` || authHeader === cronSecret);

  if (!isSecretBearer && !isAdminAuthenticated(req as Parameters<typeof isAdminAuthenticated>[0])) {
    return res.status(401).json({ error: 'Unauthorized. Provide valid Authorization header or log in as admin.' });
  }

  // ── GET: show instructions ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Send a POST request to this endpoint to start the migration.',
      warning: 'This copies all Supabase covers → R2. Supabase files are NOT deleted.',
      tip: 'Safe to run multiple times — already-migrated files are skipped.',
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  // ── POST: run migration ────────────────────────────────────────────────────
  const bucket = process.env.R2_BUCKET_NAME ?? 'covers';

  // Stream JSON-lines progress back to the client
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.status(200);

  const log = (obj: object) => res.write(JSON.stringify(obj) + '\n');

  try {
    const supabase = getSupabase();
    const r2 = getR2();

    log({ status: 'listing', message: 'Listing files in Supabase bucket…' });
    const files = await listAllFiles(supabase);
    log({ status: 'listed', total: files.length, message: `Found ${files.length} file(s).` });

    let copied = 0, skipped = 0, failed = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const index    = i + 1;

      if (SKIP_EXISTING && await existsInR2(r2, bucket, filePath)) {
        log({ status: 'skipped', index, total: files.length, file: filePath });
        skipped++;
        continue;
      }

      // Signed URL download from Supabase
      const { data: signed, error: signErr } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(filePath, 120);

      if (signErr || !signed?.signedUrl) {
        log({ status: 'failed', index, total: files.length, file: filePath, reason: signErr?.message ?? 'no signed URL' });
        failed++;
        continue;
      }

      const response = await fetch(signed.signedUrl);
      if (!response.ok) {
        log({ status: 'failed', index, total: files.length, file: filePath, reason: `HTTP ${response.status}` });
        failed++;
        continue;
      }

      const buffer      = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: filePath,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
      }));

      log({ status: 'copied', index, total: files.length, file: filePath, sizeKb: Math.round(buffer.length / 1024 * 10) / 10 });
      copied++;
    }

    log({
      status: 'done',
      copied,
      skipped,
      failed,
      message: '🎉 Migration complete! Supabase files were NOT deleted.',
    });

  } catch (err) {
    log({ status: 'error', message: String(err) });
  }

  res.end();
}
