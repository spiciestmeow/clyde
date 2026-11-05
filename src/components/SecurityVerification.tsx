import React, { useEffect, useState, useCallback, useId } from 'react';
import CloudflareTurnstile from './CloudflareTurnstile';

const CLEARANCE_STORAGE_KEY = 'clydee_cf_clearance_ts';
// 30 minutes clearance window (industry standard for scanlators like Mistscans / Asura)
const CLEARANCE_DURATION_MS = 30 * 60 * 1000;

export function hasValidSecurityClearance(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(CLEARANCE_STORAGE_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < CLEARANCE_DURATION_MS;
  } catch {
    return false;
  }
}

export function refreshSecurityClearance(): void {
  try {
    localStorage.setItem(CLEARANCE_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors
  }
}

function generateRayId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default function SecurityVerification() {
  const [isVerified, setIsVerified] = useState<boolean>(() => hasValidSecurityClearance());
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [hostname, setHostname] = useState('clyde-s1lk.vercel.app');
  const [rayId] = useState(() => generateRayId());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostname(window.location.hostname || 'clyde-s1lk.vercel.app');
    }
  }, []);

  // Check clearance on tab return or idle
  useEffect(() => {
    const checkClearance = () => {
      if (!hasValidSecurityClearance()) {
        setIsVerified(false);
        setVerificationSuccess(false);
        setFadingOut(false);
      }
    };

    window.addEventListener('focus', checkClearance);
    const interval = setInterval(checkClearance, 60 * 1000);

    return () => {
      window.removeEventListener('focus', checkClearance);
      clearInterval(interval);
    };
  }, []);

  const handleSuccess = useCallback(async (token: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) {
        // Server rejected the token — Turnstile widget will auto-reset; do nothing
        return;
      }
    } catch {
      // Network error: gracefully degrade so users aren't permanently locked out
    }
    refreshSecurityClearance();
    setVerificationSuccess(true);

    setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => {
        setIsVerified(true);
      }, 300);
    }, 600);
  }, []);

  if (isVerified) {
    return null;
  }

  return (
    <div
      className={`security-verification-overlay ${fadingOut ? 'is-fading-out' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999999,
        backgroundColor: '#ffffff',
        color: '#111827',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 'clamp(24px, 5vw, 64px) clamp(20px, 6vw, 80px)',
        transition: 'opacity 0.3s ease',
        opacity: fadingOut ? 0 : 1,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Main Content matching Cloudflare / Mistscans */}
      <div
        style={{
          maxWidth: '680px',
          width: '100%',
          margin: '40px auto 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          textAlign: 'left',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(26px, 3.5vw, 36px)',
            fontWeight: 700,
            color: '#111827',
            margin: '0 0 16px',
            lineHeight: 1.2,
            letterSpacing: '-0.3px',
          }}
        >
          {hostname}
        </h1>

        <h2
          style={{
            fontSize: 'clamp(18px, 2.2vw, 22px)',
            fontWeight: 600,
            color: '#1f2937',
            margin: '0 0 12px',
            lineHeight: 1.3,
          }}
        >
          Performing security verification
        </h2>

        <p
          style={{
            fontSize: '14.5px',
            lineHeight: 1.6,
            color: '#4b5563',
            margin: '0 0 24px',
            maxWidth: '560px',
          }}
        >
          This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.
        </p>

        {/* Turnstile Widget */}
        <div style={{ margin: '8px 0 20px', minHeight: '65px' }}>
          <CloudflareTurnstile
            onSuccess={handleSuccess}
            theme="light"
            size="normal"
          />
        </div>

        {verificationSuccess && (
          <p
            style={{
              fontSize: '15px',
              fontWeight: 500,
              color: '#111827',
              margin: '8px 0 0',
            }}
          >
            Verification successful. Waiting for {hostname} to respond..
          </p>
        )}
      </div>

      {/* Cloudflare Footer matching Mistscans */}
      <div
        style={{
          width: '100%',
          textAlign: 'center',
          fontSize: '12px',
          color: '#6b7280',
          lineHeight: 1.6,
          marginTop: 'auto',
          paddingTop: '32px',
          borderTop: '1px solid #f3f4f6',
        }}
      >
        <div>Ray ID: {rayId}</div>
        <div style={{ marginTop: '2px' }}>
          Performance and Security by{' '}
          <a
            href="https://www.cloudflare.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#2563eb', textDecoration: 'none' }}
          >
            Cloudflare
          </a>{' '}
          •{' '}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#2563eb', textDecoration: 'none' }}
          >
            Privacy
          </a>
        </div>
      </div>
    </div>
  );
}
