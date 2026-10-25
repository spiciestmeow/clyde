import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCheck,
  Grid2X2,
  RefreshCw,
  Layers3,
  Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import './notification-popover.css';

type NotificationCategory = 'Chapters' | 'Series';
type Filter = 'All' | NotificationCategory;

type NotificationRow = {
  id: string;
  category: NotificationCategory;
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
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getStoredIds(READ_IDS_KEY));
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getStoredIds(HIDDEN_IDS_KEY));
  const [refreshing, setRefreshing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, category, series_title, series_slug, series_cover, message, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Could not load notifications:', error.message);
      return;
    }
    setItems((data ?? []) as NotificationRow[]);
  }, []);

  useEffect(() => {
    void loadNotifications();
    const intervalId = window.setInterval(() => void loadNotifications(), 15_000);
    const handleFocus = () => void loadNotifications();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadNotifications]);

  const visibleItems = useMemo(
    () => items.filter((item) => !hiddenIds.has(item.id) && (filter === 'All' || item.category === filter)),
    [filter, hiddenIds, items],
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayItems = visibleItems.filter((item) => Date.parse(item.created_at) >= todayStart.getTime());
  const earlierItems = visibleItems.filter((item) => Date.parse(item.created_at) < todayStart.getTime());
  const unreadCount = items.filter((item) => !hiddenIds.has(item.id) && !readIds.has(item.id)).length;

  const markRead = (id: string) => setReadIds((current) => {
    const next = new Set(current);
    next.add(id);
    storeIds(READ_IDS_KEY, next);
    return next;
  });

  const markAllRead = () => setReadIds((current) => {
    const next = new Set(current);
    items.filter((item) => !hiddenIds.has(item.id)).forEach((item) => next.add(item.id));
    storeIds(READ_IDS_KEY, next);
    return next;
  });

  const clearNotifications = () => setHiddenIds((current) => {
    const next = new Set(current);
    items.forEach((item) => next.add(item.id));
    storeIds(HIDDEN_IDS_KEY, next);
    return next;
  });

  const refresh = async () => {
    setRefreshing(true);
    try { await loadNotifications(); } finally { setRefreshing(false); }
  };

  const renderItems = (group: NotificationRow[]) => group.map((item) => {
    const unread = !readIds.has(item.id);
    return (
      <button
        type="button"
        className={`notification-item${unread ? ' is-unread' : ''}`}
        key={item.id}
        onClick={() => markRead(item.id)}
      >
        <span className={`notification-item__thumbnail category-${item.category.toLowerCase()}`} aria-hidden="true">
          {item.series_cover ? <img src={item.series_cover} alt="" /> : (
            <span className="notification-item__thumbnail-fallback">
              {item.category === 'Chapters' ? <BookOpen size={19} /> : <Grid2X2 size={19} />}
            </span>
          )}
          {unread && <span className="notification-item__type-badge">
            {item.category === 'Chapters' ? <BookOpen size={12} /> : <Layers3 size={12} />}
          </span>}
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

          <div className="notification-list" aria-live="polite">
            {todayItems.length > 0 && <div className="notification-list__section">Today</div>}
            {renderItems(todayItems)}
            {earlierItems.length > 0 && <div className="notification-list__section">Earlier</div>}
            {renderItems(earlierItems)}
            {!visibleItems.length && (
              <p className="notification-empty">You’re all caught up.</p>
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
