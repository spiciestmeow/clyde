import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCheck,
  CircleCheck,
  Grid2X2,
  RefreshCw,
  Layers3,
  Trash2,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { supabase } from '../lib/supabase';
import { toast } from '../hooks/use-toast';
import NotificationLoadingSkeleton from './NotificationLoadingSkeleton';
import './notification-popover.css';

type NotificationCategory = 'Chapters' | 'Series';
type Filter = 'All' | NotificationCategory;

type NotificationRow = {
  id: string;
  category: NotificationCategory;
  series_id: number;
  series_title: string;
  series_slug: string;
  series_cover: string | null;
  message: string;
  created_at: string;
};

const READ_IDS_KEY = 'vortex-notification-read-v1';
const HIDDEN_IDS_KEY = 'vortex-notification-hidden-v1';

function getStoredIds(key: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function storeIds(key: string, ids: Set<string>) {
  try { window.localStorage.setItem(key, JSON.stringify([...ids])); } catch { /* Storage may be unavailable. */ }
}

function relativeAge(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

const filters: { label: Filter; Icon: typeof Grid2X2 }[] = [
  { label: 'All', Icon: Grid2X2 },
  { label: 'Chapters', Icon: BookOpen },
  { label: 'Series', Icon: Layers3 },
];

export default function NotificationPopover() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getStoredIds(READ_IDS_KEY));
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getStoredIds(HIDDEN_IDS_KEY));
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listIsLoading = isLoading || refreshing;

  const lastLoadedAtRef = useRef<number>(0);
  const knownCoversRef = useRef<Map<number, string>>(new Map());

  // Keep the badge and unread styling in sync if the header is recreated during
  // client-side navigation, or if another tab marks notifications as read.
  useEffect(() => {
    const refreshReadState = () => setReadIds(getStoredIds(READ_IDS_KEY));
    window.addEventListener('vortex-notification-read-change', refreshReadState);
    window.addEventListener('storage', refreshReadState);
    return () => {
      window.removeEventListener('vortex-notification-read-change', refreshReadState);
      window.removeEventListener('storage', refreshReadState);
    };
  }, []);

  const loadNotifications = useCallback(async (showInitialLoading = false) => {
    if (showInitialLoading) setIsLoading(true);
    try {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('notifications')
        .select('id, category, series_id, series_title, series_slug, series_cover, message, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('Could not load notifications:', error.message);
        return;
      }

      lastLoadedAtRef.current = Date.now();
      const notifications = (data ?? []) as NotificationRow[];
      const missingCoverIds = [...new Set(
        notifications
          .filter((item) => !item.series_cover?.trim() && !knownCoversRef.current.has(item.series_id))
          .map((item) => item.series_id),
      )];

      // Notifications keep a cover snapshot, but older rows may have an empty snapshot.
      // Resolve those once and cache in memory to prevent repeated DB queries.
      if (missingCoverIds.length > 0) {
        const { data: series } = await supabase
          .from('series')
          .select('id, cover')
          .in('id', missingCoverIds);
        (series ?? []).forEach((item) => {
          if (item.cover) knownCoversRef.current.set(item.id, item.cover);
        });
      }

      setItems(notifications.map((item) => ({
        ...item,
        series_cover: item.series_cover?.trim() || knownCoversRef.current.get(item.series_id) || '',
      })));
    } finally {
      if (showInitialLoading) setIsLoading(false);
    }
  }, []);

  // Initial load once on mount, with a gentle 5-minute background check only when tab is visible
  useEffect(() => {
    void loadNotifications(true);

    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadNotifications(false);
    }, 5 * 60 * 1000); // 5 minutes (reduced from aggressive 15s polling to save egress/logs)

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadNotifications]);

  // Refresh when user actively opens the notification popover if older than 60 seconds
  useEffect(() => {
    if (open && Date.now() - lastLoadedAtRef.current > 60_000) {
      void loadNotifications(false);
    }
  }, [open, loadNotifications]);

  const visibleItems = useMemo(
    () => items.filter((item) => !hiddenIds.has(item.id) && (filter === 'All' || item.category === filter)),
    [filter, hiddenIds, items],
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayItems = visibleItems.filter((item) => Date.parse(item.created_at) >= todayStart.getTime());
  const earlierItems = visibleItems.filter((item) => Date.parse(item.created_at) < todayStart.getTime());
  const unreadCount = items.filter((item) => !hiddenIds.has(item.id) && !readIds.has(item.id)).length;

  const saveReadIds = (next: Set<string>) => {
    storeIds(READ_IDS_KEY, next);
    setReadIds(next);
    window.dispatchEvent(new Event('vortex-notification-read-change'));
  };

  const markRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    saveReadIds(next);
  };

  const openNotification = (item: NotificationRow) => {
    const wasUnread = !readIds.has(item.id);
    if (wasUnread) markRead(item.id);
    setOpen(false);
    if (wasUnread) {
      toast({
        description: (
          <span className="notification-read-toast__content">
            <CircleCheck aria-hidden="true" className="notification-read-toast__icon" size={18} />
            <span>Marked as read</span>
          </span>
        ),
        className: 'notification-read-toast',
      });
    }
    if (item.series_slug) setLocation(`/series/${encodeURIComponent(item.series_slug)}`);
  };

  const markAllRead = () => {
    const next = new Set(readIds);
    items.filter((item) => !hiddenIds.has(item.id)).forEach((item) => next.add(item.id));
    saveReadIds(next);
  };

  const clearNotifications = () => setHiddenIds((current) => {
    const next = new Set(current);
    items.forEach((item) => next.add(item.id));
    storeIds(HIDDEN_IDS_KEY, next);
    return next;
  });

  const refresh = async () => {
    if (refreshing) return;
    const startedAt = Date.now();
    setRefreshing(true);
    try {
      await loadNotifications(true);
    } finally {
      // Keep the skeleton visible long enough to read, even when the request
      // returns from cache almost immediately.
      const remaining = 450 - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      }
      setRefreshing(false);
    }
  };

  const renderItems = (group: NotificationRow[]) => group.map((item) => {
    const unread = !readIds.has(item.id);
    return (
      <button
        type="button"
        className={`notification-item${unread ? ' is-unread' : ''}`}
        key={item.id}
        onClick={() => openNotification(item)}
      >
        <span className={`notification-item__thumbnail category-${item.category.toLowerCase()}`} aria-hidden="true">
          {item.series_cover ? <img src={item.series_cover} alt="" /> : (
            <span className="notification-item__thumbnail-fallback">
              {item.category === 'Chapters' ? <BookOpen size={19} /> : <Grid2X2 size={19} />}
            </span>
          )}
          <span className="notification-item__type-badge">
            {item.category === 'Chapters' ? <BookOpen size={12} /> : <Layers3 size={12} />}
          </span>
        </span>
        <span className="notification-item__copy">
          <span className="notification-item__text"><strong>{item.series_title}</strong> {item.message}</span>
          <span className="notification-item__age">{relativeAge(item.created_at)}</span>
        </span>
        {unread && <span className="notification-item__unread-dot" aria-label="Unread" />}
      </button>
    );
  });

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className={`icon-pill notification-trigger${open ? ' is-open' : ''}`}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((value) => !value);
          void loadNotifications();
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-panel" role="dialog" aria-label="Notifications">
          <header className="notification-panel__header">
            <div className="notification-panel__heading">
              <h2>Notifications</h2>
              <span>{unreadCount} unread</span>
            </div>
            <div className="notification-panel__actions">
              <button type="button" aria-label="Mark all as read" title="Mark all as read" onClick={markAllRead}>
                <CheckCheck size={19} />
              </button>
              <button type="button" aria-label="Clear notifications" title="Clear notifications" onClick={clearNotifications}>
                <Trash2 size={18} />
              </button>
              <button type="button" aria-label="Refresh notifications" title="Refresh notifications" onClick={() => void refresh()}>
                <RefreshCw className={refreshing ? 'is-refreshing' : ''} size={18} />
              </button>
            </div>
          </header>

          <nav className="notification-filters" aria-label="Filter notifications">
            {filters.map(({ label, Icon }) => (
              <button
                type="button"
                key={label}
                className={filter === label ? 'is-active' : ''}
                aria-pressed={filter === label}
                onClick={() => setFilter(label)}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="notification-list" aria-live="polite" aria-busy={listIsLoading}>
            {listIsLoading ? <NotificationLoadingSkeleton /> : (
              <>
                {todayItems.length > 0 && <div className="notification-list__section">Today</div>}
                {renderItems(todayItems)}
                {earlierItems.length > 0 && <div className="notification-list__section">Earlier</div>}
                {renderItems(earlierItems)}
                {!visibleItems.length && (
                  <div className="notification-empty">
                    <span className="notification-empty__icon" aria-hidden="true">
                      <Bell size={20} />
                    </span>
                    <span className="notification-empty__title">You’re all caught up</span>
                    <span className="notification-empty__subtitle">No new notifications</span>
                  </div>
                )}
              </>
            )}
          </div>

          <button type="button" className="notification-panel__footer" onClick={() => setOpen(false)}>
            See all notifications
          </button>
        </section>
      )}
    </div>
  );
}
