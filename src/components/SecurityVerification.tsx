import React, { useEffect, useState, useCallback } from 'react';
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

export default function SecurityVerification() {
  const [isVerified, setIsVerified] = useState<boolean>(() => hasValidSecurityClearance());
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [hostname, setHostname] = useState('clydee');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostname(window.location.hostname || 'clydee');
    }
  }, []);

  // Check clearance on visibility / focus or idle return
  useEffect(() => {
    const checkClearance = () => {
      if (!hasValidSecurityClearance()) {
        setIsVerified(false);
        setVerificationSuccess(false);
        setFadingOut(false);
      }
    };

    window.addEventListener('focus', checkClearance);
    const interval = setInterval(checkClearance, 60 * 1000); // Check once a minute

    return () => {
      window.removeEventListener('focus', checkClearance);
      clearInterval(interval);
    };
  }, []);

  const handleSuccess = useCallback((token: string) => {
    if (!token) return;
    refreshSecurityClearance();
    setVerificationSuccess(true);

    // Give a brief moment to show "Verification successful" before smoothly dismissing
    setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => {
        setIsVerified(true);
      }, 350);
    }, 700);
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
        zIndex: 999999,
        background: 'var(--bg, #0d0d11)',
        color: 'var(--text, #f4f4f5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        transition: 'opacity 0.35s ease, visibility 0.35s ease',
        opacity: fadingOut ? 0 : 1,
        fontFamily: "'Gotham Pro', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        className="security-verification-card"
        style={{
          maxWidth: '540px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 800,
            margin: 0,
            color: 'var(--text, #ffffff)',
            letterSpacing: '-0.5px',
          }}
        >
          {hostname}
        </h1>

        <h2
          style={{
            fontSize: 'clamp(18px, 2.5vw, 22px)',
            fontWeight: 650,
            margin: '4px 0 0',
            color: 'var(--text, #ffffff)',
          }}
        >
          Performing security verification
        </h2>

        <p
          style={{
            fontSize: '14px',
            lineHeight: 1.5,
            color: 'var(--muted, #94a3b8)',
            margin: '0 0 12px',
            maxWidth: '460px',
          }}
        >
          This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.
        </p>

        <div style={{ minHeight: '65px', margin: '8px 0' }}>
          <CloudflareTurnstile
            onSuccess={handleSuccess}
            theme="auto"
          />
        </div>

        {verificationSuccess && (
          <p
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#22c55e',
              margin: '6px 0 0',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            Verification successful. Waiting for {hostname} to respond..
          </p>
        )}

        <div
          style={{
            marginTop: '32px',
            fontSize: '11px',
            color: 'var(--muted, #64748b)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            alignItems: 'center',
          }}
        >
          <span>Performance and Security by Cloudflare</span>
        </div>
      </div>
    </div>
  );
}
