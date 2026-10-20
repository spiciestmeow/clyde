import { useEffect, useState } from 'react';
import { History, RefreshCw, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './sync-activity-logs.css';

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  totalChecked: number;
  updatedCount: number;
  updatedSeries: {
    title: string;
    previousChapter: string;
    newChapter: string;
    source?: string;
    time?: string;
  }[];
  logs?: string[];
}

export function SyncActivityLogs() {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('header_visibility')
        .eq('id', 'global')
        .maybeSingle();

      if (!error && data?.header_visibility) {
        const h = data.header_visibility as any;
        if (Array.isArray(h.sync_logs)) {
          setLogs(h.sync_logs);
          if (h.sync_logs.length > 0 && !expandedLogId) {
            setExpandedLogId(h.sync_logs[0].id);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatLogTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return {
        time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
        date: d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    } catch {
      return { time: iso, date: '' };
    }
  };

  return (
    <div className="sync-logs-panel">
      <div className="sync-logs-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sync-logs-icon-badge">
            <History size={16} />
          </div>
          <div>
            <h3 className="sync-logs-title">Auto Sync & Update Logs</h3>
            <span className="sync-logs-subtitle">
              Live history of automated background scrapers and chapter detections
            </span>
          </div>
        </div>
        <button
          type="button"
          className="sync-logs-refresh-btn"
          onClick={fetchLogs}
          disabled={isLoading}
          title="Refresh sync history"
        >
          <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {isLoading && logs.length === 0 ? (
        <div className="sync-logs-loading">
          <RefreshCw size={20} className="spin" />
          <span>Loading sync activity logs...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="sync-logs-empty">
          <History size={28} />
          <p>No background sync logs recorded yet.</p>
          <small>Runs from cron-job.org or the "Run Now" button will appear here in real-time.</small>
        </div>
      ) : (
        <div className="sync-logs-list">
          {logs.map((log) => {
            const { time, date } = formatLogTime(log.timestamp);
            const isExpanded = expandedLogId === log.id;
            const hasUpdates = (log.updatedCount || 0) > 0;

            return (
              <div
                key={log.id}
                className={`sync-log-card${hasUpdates ? ' has-updates' : ''}${isExpanded ? ' is-expanded' : ''}`}
              >
                <div
                  className="sync-log-summary-row"
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                >
                  <div className="sync-log-status-dot">
                    {hasUpdates ? <Zap size={14} /> : <CheckCircle2 size={14} />}
                  </div>

                  <div className="sync-log-meta">
                    <div className="sync-log-time-row">
                      <strong className="sync-log-time">{time}</strong>
                      <span className="sync-log-date">{date}</span>
                    </div>
                    <span className="sync-log-summary-text">
                      Checked {log.totalChecked || 9} series •{' '}
                      <span className={hasUpdates ? 'text-green' : 'text-muted'}>
                        {hasUpdates ? `${log.updatedCount} new chapter dropped!` : 'All titles up-to-date'}
                      </span>
                    </span>
                  </div>

                  {hasUpdates && (
                    <span className="sync-log-new-badge">
                      +{log.updatedCount} New
                    </span>
                  )}

                  <ChevronRight size={16} className={`sync-log-chevron${isExpanded ? ' is-rotated' : ''}`} />
                </div>

                {isExpanded && (
                  <div className="sync-log-details-area">
                    {hasUpdates && log.updatedSeries && log.updatedSeries.length > 0 && (
                      <div className="sync-log-updates-box">
                        <span className="sync-log-box-label">🚀 Newly Detected Chapters:</span>
                        <div className="sync-log-updates-grid">
                          {log.updatedSeries.map((u, idx: number) => (
                            <div key={idx} className="sync-log-update-item">
                              <span className="sync-log-item-title">{u.title}</span>
                              <span className="sync-log-item-ch">
                                Ch. {u.previousChapter || '0'} → <strong>Ch. {u.newChapter}</strong>
                              </span>
                              {u.source && (
                                <span className="sync-log-item-source">via {u.source}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {log.logs && log.logs.length > 0 && (
                      <div className="sync-log-console-box">
                        <span className="sync-log-box-label">Execution Details:</span>
                        <div className="sync-log-console-lines">
                          {log.logs.map((line: string, idx: number) => (
                            <div key={idx} className="sync-log-console-line">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
