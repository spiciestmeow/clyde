import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useIsAdmin(): { isAdmin: boolean; checkingAuth: boolean } {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const hasSession = Object.keys(sessionStorage).some(
          (k) => k.startsWith('sb-') && k.endsWith('-auth-token') && Boolean(sessionStorage.getItem(k)?.includes('access_token')),
        );
        return hasSession;
      } catch {
        return false;
      }
    }
    return false;
  });
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCheckingAuth(false);
      return;
    }

    let active = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setIsAdmin(Boolean(data.session));
        }
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setIsAdmin(Boolean(session));
        setCheckingAuth(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { isAdmin, checkingAuth };
}
