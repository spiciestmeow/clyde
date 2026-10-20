import { useEffect, useState } from 'react';
import { Clock, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import './background-sync-timer.css';

interface BackgroundSyncTimerProps {
  onManualTriggerSuccess?: () => void;
}

export function BackgroundSyncTimer({ onManualTriggerSuccess }: BackgroundSyncTimerProps) {
  // Interval in minutes (from your cron-job.org setting: every 15 minutes at :00, :15, :30, :45)
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

      // Next block boundary
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
    <div className="bg-sync-timer-card">
      <div className="bg-sync-timer-header">
        <div className="bg-sync-timer-icon-wrap">
          <Clock size={18} className="bg-sync-timer-icon" />
        </div>
        <div className="bg-sync-timer-title-group">
          <h3 className="bg-sync-timer-title">Next Auto Chapter Sync</h3>
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
        <span>📅 Next scheduled run: <strong>{formattedNextTime}</strong></span>
        <span className="bg-sync-timezone-note">({formattedNextDate})</span>
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
