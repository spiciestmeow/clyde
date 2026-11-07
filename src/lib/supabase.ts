import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

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