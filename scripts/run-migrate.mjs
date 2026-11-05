// scripts/run-migrate.mjs
// Wrapper that loads secrets from scripts/migrate.env then runs the migration.
// Usage: node scripts/run-migrate.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, 'migrate.env');

// Load the .env file and set each line as an env var
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = value;
  }
  console.log('✅  Loaded secrets from scripts/migrate.env\n');
} catch {
  console.error('❌  Could not read scripts/migrate.env');
  console.error('    Create it with your secrets — see scripts/migrate.env.example\n');
  process.exit(1);
}

// Now run the actual migration
await import('./migrate-supabase-to-r2.mjs');
