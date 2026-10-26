import { useEffect, useState } from 'react';
import { Clock, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './background-sync-timer.css';

interface BackgroundSyncTimerProps {
  onManualTriggerSuccess?: () => void;
}

export function BackgroundSyncTimer({ onManualTriggerSuccess }: BackgroundSyncTimerProps) {
  // The schedule itself is configured externally in cron-job.org.
  const intervalMinutes = 15;

  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number }>({
    minutes: 0,
    seconds: 0,
  });
  const [nextRunDate, setNextRunDate] = useState<Date>(new Date());
  const [lastSyncResult, setLastSyncResult] = useState<{
    time: string;
    message: string;
  } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bg_sync_last_result');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return null;
  });

  const [isTriggeringNow, setIsTriggeringNow] = useState(false);
  const [triggerStatus, setTriggerStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Show an approximate next run for the configured 15-minute external schedule.
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const currentMinutes = now.getMinutes();
      const currentSeconds = now.getSeconds();
      const currentMs = now.getMilliseconds();

      const step = intervalMinutes;
      const nextTargetMin = Math.ceil((currentMinutes + (currentSeconds > 0 || currentMs > 0 ? 0.001 : 0)) / step) * step;

      const next = new Date(now);
      if (nextTargetMin >= 60) {
        next.setHours(now.getHours() + 1, nextTargetMin % 60, 0, 0);
      } else {
        next.setMinutes(nextTargetMin, 0, 0);
      }

      setNextRunDate(next);

      const diffMs = Math.max(0, next.getTime() - now.getTime());
      const totalSec = Math.floor(diffMs / 1000);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;

      setTimeLeft({ minutes: m, seconds: s });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRunNow = async () => {
    if (isTriggeringNow) return;
    setIsTriggeringNow(true);
    setTriggerStatus(null);
    try {
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) {
        throw new Error('Admin sign-in required to run a manual sync.');
      }
      const res = await fetch('/api/cron-sync-sources', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const msg = `Checked ${data.totalSeriesChecked || 0} series (${data.seriesUpdatedCount || 0} updated).`;
        setTriggerStatus({
          type: 'success',
          message: `Sync finished! ${msg}`,
        });
        const resultObj = {
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          message: msg,
        };
        setLastSyncResult(resultObj);
        if (typeof window !== 'undefined') {
          localStorage.setItem('bg_sync_last_result', JSON.stringify(resultObj));
        }
        if (onManualTriggerSuccess) {
          onManualTriggerSuccess();
        }
      } else {
        setTriggerStatus({
          type: 'error',
          message: data?.message || 'Background sync failed to run.',
        });
      }
    } catch (err: any) {
      setTriggerStatus({
        type: 'error',
        message: err?.message || 'Network error triggering sync.',
      });
    } finally {
      setIsTriggeringNow(false);
    }
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  const formattedNextTime = nextRunDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
  const formattedNextDate = nextRunDate.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className={`bg-sync-timer-card${isTriggeringNow ? ' is-syncing-active' : ''}`}>
      <div className="bg-sync-timer-header">
        <div className={`bg-sync-timer-icon-wrap${isTriggeringNow ? ' is-pulsing' : ''}`}>
          {isTriggeringNow ? (
            <RefreshCw size={18} className="spin" />
          ) : (
            <Clock size={18} className="bg-sync-timer-icon" />
          )}
        </div>
        <div className="bg-sync-timer-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 className="bg-sync-timer-title">
              {isTriggeringNow ? 'Manual Sync Running...' : 'Next Auto Chapter Sync'}
            </h3>
            {isTriggeringNow && (
              <span className="bg-sync-live-badge">
                <span className="bg-sync-live-dot" /> LIVE SYNC
              </span>
            )}
          </div>
          <div className="bg-sync-schedule-note">
            <span>Schedule managed in cron-job.org · every 15 minutes</span>
          </div>
        </div>
        <button
          type="button"
          className="bg-sync-run-now-btn"
          onClick={handleRunNow}
          disabled={isTriggeringNow}
          title="Run background chapter scraper now"
        >
          <RefreshCw size={14} className={isTriggeringNow ? 'spin' : ''} />
          <span>{isTriggeringNow ? 'Syncing...' : 'Run Now'}</span>
        </button>
      </div>

      <div className="bg-sync-digits-grid">
        <div className="bg-sync-digit-box">
          <span className="bg-sync-digit-num">00</span>
          <span className="bg-sync-digit-label">HOURS</span>
        </div>
        <div className="bg-sync-digit-box">
          <span className="bg-sync-digit-num">{pad(timeLeft.minutes)}</span>
          <span className="bg-sync-digit-label">MIN</span>
        </div>
        <div className="bg-sync-digit-box">
          <span className="bg-sync-digit-num">{pad(timeLeft.seconds)}</span>
          <span className="bg-sync-digit-label">SEC</span>
        </div>
      </div>

      <div className="bg-sync-pill-status">
        {isTriggeringNow ? (
          <span className="bg-sync-pill is-syncing">
            <RefreshCw size={13} className="spin" />
            <span>Scanning MangaUpdates & Direct Source URLs for new chapters...</span>
          </span>
        ) : (
          <span className="bg-sync-pill">
            <Zap size={13} />
            <span>Auto-checks MangaUpdates & Direct Source URLs</span>
          </span>
        )}
      </div>

      <div className="bg-sync-footer-time">
        {isTriggeringNow ? (
          <span style={{ color: '#38bdf8' }}>⚡ Manual background sync is running</span>
        ) : (
          <>
            <span>📅 Approx. next 15-minute run: <strong>{formattedNextTime}</strong></span>
            <span className="bg-sync-timezone-note">({formattedNextDate})</span>
          </>
        )}
      </div>

      {lastSyncResult && !triggerStatus && !isTriggeringNow && (
        <div className="bg-sync-last-run-info">
          <span>✓ Last manual sync at {lastSyncResult.time}: {lastSyncResult.message}</span>
        </div>
      )}

      {triggerStatus && (
        <div className={`bg-sync-feedback-toast is-${triggerStatus.type}`}>
          {triggerStatus.type === 'success' ? <CheckCircle2 size={15} /> : <Clock size={15} />}
          <span>{triggerStatus.message}</span>
          <button
            type="button"
            className="bg-sync-toast-dismiss"
            onClick={() => setTriggerStatus(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
