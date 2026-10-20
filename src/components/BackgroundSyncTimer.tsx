import { useEffect, useState } from 'react';
import { Clock, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import './background-sync-timer.css';

interface BackgroundSyncTimerProps {
  onManualTriggerSuccess?: () => void;
}

export function BackgroundSyncTimer({ onManualTriggerSuccess }: BackgroundSyncTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number }>({
    minutes: 0,
    seconds: 0,
  });
  const [nextRunDate, setNextRunDate] = useState<Date>(new Date());
  const [isTriggeringNow, setIsTriggeringNow] = useState(false);
  const [triggerStatus, setTriggerStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Compute countdown to the top of the next hour (:00 UTC / local)
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      // Next run is at minute 0 of next hour
      const next = new Date(now);
      next.setHours(now.getHours() + 1, 0, 0, 0);
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
      const res = await fetch('/api/cron-sync-sources');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTriggerStatus({
          type: 'success',
          message: `Sync finished! Checked ${data.totalSeriesChecked || 0} series (${data.seriesUpdatedCount || 0} updated).`,
        });
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

  // Format date display like: "Tuesday, Oct 20, 2026 at 11:00 AM • your time"
  const formattedNextTime = nextRunDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const formattedNextDate = nextRunDate.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="bg-sync-timer-card">
      <div className="bg-sync-timer-header">
        <div className="bg-sync-timer-icon-wrap">
          <Clock size={18} className="bg-sync-timer-icon" />
        </div>
        <div className="bg-sync-timer-title-group">
          <h3 className="bg-sync-timer-title">Next Auto Chapter Sync</h3>
          <span className="bg-sync-timer-subtitle">Every 1 hour at :00 (UTC+0)</span>
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
        <span className="bg-sync-pill">
          <Zap size={13} />
          <span>Auto-checks MangaUpdates & Direct Source URLs</span>
        </span>
      </div>

      <div className="bg-sync-footer-time">
        <span>📅 {formattedNextDate} at {formattedNextTime}</span>
        <span className="bg-sync-timezone-note">• your time</span>
      </div>

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
