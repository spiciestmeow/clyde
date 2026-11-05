// scripts/migrate-supabase-to-r2.mjs
//
// Copies every file from the Supabase 'covers' bucket → Cloudflare R2 'covers' bucket.
// Supabase files are NEVER deleted. Safe to re-run (already-migrated files are skipped).
//
// Prerequisites:
//   npm install --save-dev @aws-sdk/client-s3 node-fetch
//
// Usage (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
//   $env:R2_ACCOUNT_ID             = "f4199af4b1d6207..."
//   $env:R2_ACCESS_KEY_ID          = "your-access-key-id"
//   $env:R2_SECRET_ACCESS_KEY      = "your-secret-access-key"
//   node scripts/migrate-supabase-to-r2.mjs

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL    = process.env.VITE_SUPABASE_URL ?? 'https://iaxnqgjcglhsdnikazxc.supabase.co';
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;    // ← service role key
const R2_ACCOUNT_ID   = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY   = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY   = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET       = process.env.R2_BUCKET_NAME ?? 'covers';
const SUPABASE_BUCKET = 'covers';
const SKIP_EXISTING   = true;   // set to false to overwrite already-migrated files
const CONCURRENCY     = 4;      // parallel uploads (keep low to avoid rate limits)
// ─────────────────────────────────────────────────────────────────────────────

function checkEnv() {
  const missing = [];
  if (!SUPABASE_KEY)   missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!R2_ACCOUNT_ID)  missing.push('R2_ACCOUNT_ID');
  if (!R2_ACCESS_KEY)  missing.push('R2_ACCESS_KEY_ID');
  if (!R2_SECRET_KEY)  missing.push('R2_SECRET_ACCESS_KEY');
  if (missing.length) {
    console.error('❌  Missing required environment variables:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
}

checkEnv();

// ── Quick connectivity check ──────────────────────────────────────────────────
console.log(`\n🔑  SUPABASE_URL       : ${SUPABASE_URL}`);
console.log(`🔑  SUPABASE_KEY length: ${SUPABASE_KEY?.length ?? 0} chars`);
console.log(`🔑  R2_ACCOUNT_ID      : ${R2_ACCOUNT_ID?.slice(0, 8)}...`);

try {
  const ping = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  console.log(`🌐  Supabase reachable : HTTP ${ping.status}\n`);
} catch (e) {
  console.error(`🌐  Supabase NOT reachable: ${e.message}`);
  console.error('    → Check your internet connection or firewall.\n');
  process.exit(1);
}
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

/** Recursively list all files in a Supabase storage bucket/folder. */
async function listAllFiles(bucket, prefix = '') {
  const files = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw new Error(`Supabase list error (prefix="${prefix}"): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) {
        // It's a real file (has an id)
        files.push(fullPath);
      } else {
        // It's a folder — recurse into it
        const sub = await listAllFiles(bucket, fullPath);
        files.push(...sub);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return files;
}

/** Returns true if the key already exists in R2. */
async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Download from Supabase via signed URL and upload to R2. */
async function migrateFile(filePath, index, total) {
  const tag = `[${index}/${total}]`;

  if (SKIP_EXISTING && await existsInR2(filePath)) {
    console.log(`⏭️   ${tag} Already in R2 — skipping: ${filePath}`);
    return 'skipped';
  }

  // Create a short-lived signed URL so private buckets also work
  const { data: signed, error: signErr } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(filePath, 120);

  if (signErr || !signed?.signedUrl) {
    console.error(`❌   ${tag} Signed URL failed: ${filePath} — ${signErr?.message ?? 'no URL'}`);
    return 'failed';
  }

  const response = await fetch(signed.signedUrl);
  if (!response.ok) {
    console.error(`❌   ${tag} Download failed (HTTP ${response.status}): ${filePath}`);
    return 'failed';
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: filePath,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));

  console.log(`✅   ${tag} Copied: ${filePath}  (${(buffer.length / 1024).toFixed(1)} KB)`);
  return 'copied';
}

/** Run tasks with a fixed concurrency limit. */
async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const index = i++;
      results[index] = await tasks[index]();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main() {
  console.log('\n🔍  Listing files in Supabase bucket "' + SUPABASE_BUCKET + '"…');
  const files = await listAllFiles(SUPABASE_BUCKET);

  if (files.length === 0) {
    console.log('⚠️   No files found in Supabase bucket. Nothing to migrate.');
    return;
  }

  console.log(`📦  Found ${files.length} file(s). Starting migration with concurrency=${CONCURRENCY}…\n`);

  const tasks = files.map((filePath, idx) =>
    () => migrateFile(filePath, idx + 1, files.length)
  );

  const results = await runWithConcurrency(tasks, CONCURRENCY);

  const copied  = results.filter(r => r === 'copied').length;
  const skipped = results.filter(r => r === 'skipped').length;
  const failed  = results.filter(r => r === 'failed').length;

  console.log('\n──────────────────────────────────────────');
  console.log('🎉  Migration finished!');
  console.log(`    ✅  Copied  : ${copied}`);
  console.log(`    ⏭️   Skipped : ${skipped}`);
  console.log(`    ❌  Failed  : ${failed}`);
  console.log('──────────────────────────────────────────');

  if (failed > 0) {
    console.warn(`\n⚠️   ${failed} file(s) failed. Re-run the script to retry them.`);
  }

  console.log('\n🛡️   Supabase files were NOT deleted — they are still safe.\n');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
