import { useEffect, useState } from 'react';
import { Clock, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import './background-sync-timer.css';

interface BackgroundSyncTimerProps {
  onManualTriggerSuccess?: () => void;
}

export function BackgroundSyncTimer({ onManualTriggerSuccess }: BackgroundSyncTimerProps) {
  // Interval in minutes (from your cron-job.org setting: default 15 minutes)
  const [intervalMinutes, setIntervalMinutes] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bg_sync_interval_min');
      return saved ? parseInt(saved, 10) || 15 : 15;
    }
    return 15;
  });

  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number }>({
    minutes: 0,
    seconds: 0,
  });
  const [nextRunDate, setNextRunDate] = useState<Date>(new Date());
  const [isSyncInProgress, setIsSyncInProgress] = useState(false);
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

  // Calculate the next execution time based on intervalMinutes (:00, :15, :30, :45 for 15m)
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

      // When the countdown hits 00:00 (first 30 seconds after the minute marks),
      // show the animated "Syncing in progress" state
      const isWindowSyncing = totalSec <= 1 || (currentMinutes % step === 0 && currentSeconds <= 25);
      setIsSyncInProgress(isWindowSyncing);

      setTimeLeft({ minutes: m, seconds: s });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [intervalMinutes]);

  const handleIntervalChange = (mins: number) => {
    setIntervalMinutes(mins);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bg_sync_interval_min', String(mins));
    }
  };

  const handleRunNow = async () => {
    if (isTriggeringNow) return;
    setIsTriggeringNow(true);
    setTriggerStatus(null);
    try {
      const res = await fetch('/api/cron-sync-sources');
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
    <div className={`bg-sync-timer-card${isSyncInProgress ? ' is-syncing-active' : ''}`}>
      <div className="bg-sync-timer-header">
        <div className={`bg-sync-timer-icon-wrap${isSyncInProgress ? ' is-pulsing' : ''}`}>
          {isSyncInProgress ? (
            <RefreshCw size={18} className="spin" />
          ) : (
            <Clock size={18} className="bg-sync-timer-icon" />
          )}
        </div>
        <div className="bg-sync-timer-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 className="bg-sync-timer-title">
              {isSyncInProgress ? 'Background Sync Running Now...' : 'Next Auto Chapter Sync'}
            </h3>
            {isSyncInProgress && (
              <span className="bg-sync-live-badge">
                <span className="bg-sync-live-dot" /> LIVE SYNC
              </span>
            )}
          </div>
          <div className="bg-sync-interval-picker">
            <span>Runs via cron-job.org every</span>
            <select
              value={intervalMinutes}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              className="bg-sync-select-interval"
              title="Set interval to match your cron-job.org schedule"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className="bg-sync-run-now-btn"
          onClick={handleRunNow}
          disabled={isTriggeringNow || isSyncInProgress}
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
        {isSyncInProgress ? (
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
        {isSyncInProgress ? (
          <span style={{ color: '#38bdf8' }}>⚡ Auto background job is running right now</span>
        ) : (
          <>
            <span>📅 Next scheduled run: <strong>{formattedNextTime}</strong></span>
            <span className="bg-sync-timezone-note">({formattedNextDate})</span>
          </>
        )}
      </div>

      {lastSyncResult && !triggerStatus && !isSyncInProgress && (
        <div className="bg-sync-last-run-info">
          <span>✓ Last sync at {lastSyncResult.time}: {lastSyncResult.message}</span>
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
