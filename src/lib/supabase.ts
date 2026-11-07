import { createClient } from '@supabase/supabase-js';

/** Cleans values pasted into hosting dashboards: wrapping quotes, spaces, trailing slashes, /rest/v1. */
function cleanEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/^["']+|["']+$/g, '').trim();
  return trimmed || undefined;
}

function cleanSupabaseUrl(value: string | undefined): string | undefined {
  const cleaned = cleanEnvValue(value);
  if (!cleaned) return undefined;
  return cleaned.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '').replace(/\/+$/, '');
}

export const supabaseUrl = cleanSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
export const supabaseAnonKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (typeof window !== 'undefined' && supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
  console.warn('VITE_SUPABASE_URL looks unusual:', supabaseUrl, '(expected https://<project-ref>.supabase.co)');
}

export const supabaseConfigReady = Boolean(supabaseUrl && supabaseAnonKey);

// Clean up any legacy Supabase auth tokens from localStorage to keep tokens out of persistent storage
if (typeof window !== 'undefined') {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export const supabase = supabaseConfigReady
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        detectSessionInUrl: true,
      },
    })
  : null;