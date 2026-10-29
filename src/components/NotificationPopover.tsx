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
import {
  getBookmarkIntervals,
  isNotificationEligibleForUser,
  type BookmarkSubscriptionInterval,
} from '../lib/bookmarkNotifications';
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
const READ_AT_KEY = 'vortex-notification-read-at-v1';
const HIDDEN_IDS_KEY = 'vortex-notification-hidden-v1';
const NOTIFICATION_PAGE_SIZE = 50;
const DELETE_HOLD_DURATION_MS = 1200;
const DELETE_HOLD_ARM_TIMEOUT_MS = 3000;

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

function getStoredReadTimes(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(READ_AT_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

function storeReadTimes(times: Record<string, string>) {
  try { window.localStorage.setItem(READ_AT_KEY, JSON.stringify(times)); } catch { /* Storage may be unavailable. */ }
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

function notificationDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

function notificationTimestamp(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

const filters: { label: Filter; Icon: typeof Grid2X2 }[] = [
  { label: 'All', Icon: Grid2X2 },
  { label: 'Chapters', Icon: BookOpen },
  { label: 'Series', Icon: Layers3 },
];

type NotificationPopoverProps = { mode?: 'popover' | 'page' };

export default function NotificationPopover({ mode = 'popover' }: NotificationPopoverProps) {
  const [location, setLocation] = useLocation();
  const isPage = mode === 'page';
  const [open, setOpen] = useState(isPage);
  const [filter, setFilter] = useState<Filter>('All');
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getStoredIds(READ_IDS_KEY));
  const [readTimes, setReadTimes] = useState<Record<string, string>>(() => getStoredReadTimes());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getStoredIds(HIDDEN_IDS_KEY));
  const [bookmarkIntervals, setBookmarkIntervals] = useState<Record<string, BookmarkSubscriptionInterval[]>>(() => getBookmarkIntervals());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [deleteHoldState, setDeleteHoldState] = useState<'idle' | 'armed' | 'holding' | 'deleting'>('idle');
  const [deleteHoldProgress, setDeleteHoldProgress] = useState(0);
  const [confirmDeleteRead, setConfirmDeleteRead] = useState(false);
  const deleteHoldIntervalRef = useRef<number | null>(null);
  const deleteHoldTimeoutRef = useRef<number | null>(null);
  const deleteHoldArmTimeoutRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listIsLoading = isLoading || refreshing;

  const lastLoadedAtRef = useRef<number>(0);
  const knownCoversRef = useRef<Map<number, string>>(new Map());

  useEffect(() => () => {
    if (deleteHoldIntervalRef.current !== null) window.clearInterval(deleteHoldIntervalRef.current);
    if (deleteHoldTimeoutRef.current !== null) window.clearTimeout(deleteHoldTimeoutRef.current);
    if (deleteHoldArmTimeoutRef.current !== null) window.clearTimeout(deleteHoldArmTimeoutRef.current);
  }, []);

  // Keep the badge and unread styling in sync if the header is recreated during
  // client-side navigation, or if another tab marks notifications as read.
  useEffect(() => {
    const refreshReadState = () => {
      setReadIds(getStoredIds(READ_IDS_KEY));
      setReadTimes(getStoredReadTimes());
    };
    window.addEventListener('vortex-notification-read-change', refreshReadState);
    window.addEventListener('storage', refreshReadState);
    return () => {
      window.removeEventListener('vortex-notification-read-change', refreshReadState);
      window.removeEventListener('storage', refreshReadState);
    };
  }, []);

  // Keep bookmarked series in sync so future chapter updates appear
  useEffect(() => {
    const refreshBookmarks = () => setBookmarkIntervals(getBookmarkIntervals());
    window.addEventListener('vortex-bookmarks-change', refreshBookmarks);
    window.addEventListener('storage', refreshBookmarks);
    return () => {
      window.removeEventListener('vortex-bookmarks-change', refreshBookmarks);
      window.removeEventListener('storage', refreshBookmarks);
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
        .limit(NOTIFICATION_PAGE_SIZE);
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
      setHasOlder(notifications.length === NOTIFICATION_PAGE_SIZE);
    } finally {
      if (showInitialLoading) setIsLoading(false);
    }
  }, []);

  const loadOlderNotifications = async () => {
    if (!supabase || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const offset = items.length;
      const { data, error } = await supabase
        .from('notifications')
        .select('id, category, series_id, series_title, series_slug, series_cover, message, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + NOTIFICATION_PAGE_SIZE - 1);
      if (error) {
        console.error('Could not load older notifications:', error.message);
        return;
      }

      const older = (data ?? []) as NotificationRow[];
      const missingCoverIds = [...new Set(
        older
          .filter((item) => !item.series_cover?.trim() && !knownCoversRef.current.has(item.series_id))
          .map((item) => item.series_id),
      )];
      if (missingCoverIds.length > 0) {
        const { data: series } = await supabase.from('series').select('id, cover').in('id', missingCoverIds);
        (series ?? []).forEach((item) => {
          if (item.cover) knownCoversRef.current.set(item.id, item.cover);
        });
      }

      setItems((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return current.concat(older
          .filter((item) => !knownIds.has(item.id))
          .map((item) => ({
            ...item,
            series_cover: item.series_cover?.trim() || knownCoversRef.current.get(item.series_id) || '',
          })));
      });
      setHasOlder(older.length === NOTIFICATION_PAGE_SIZE);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Initial load once on mount so the bell badge has the initial count.
  // We do NOT poll continuously in the background to prevent eating Supabase log ingestion and egress.
  useEffect(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  // Refresh when user actively opens the notification popover if older than 60 seconds
  useEffect(() => {
    if (open && Date.now() - lastLoadedAtRef.current > 60_000) {
      void loadNotifications(false);
    }
  }, [open, loadNotifications]);

  // Only show chapter updates for series the user has bookmarked within their subscription intervals.
  // Past chapters published before bookmarking do not show up.
  // Unbookmarking preserves already-received chapters but stops future updates.
  // New series notifications are global and shown to everyone.
  const eligibleItems = useMemo(() => {
    return items.filter((item) =>
      isNotificationEligibleForUser(item.category, item.series_slug, item.created_at, bookmarkIntervals),
    );
  }, [items, bookmarkIntervals]);

  const visibleItems = useMemo(
    () => eligibleItems.filter((item) => !hiddenIds.has(item.id) && (filter === 'All' || item.category === filter)),
    [filter, hiddenIds, eligibleItems],
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayItems = visibleItems.filter((item) => Date.parse(item.created_at) >= todayStart.getTime());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const earlierThisWeekItems = visibleItems.filter((item) => {
    const timestamp = Date.parse(item.created_at);
    return timestamp >= weekStart.getTime() && timestamp < todayStart.getTime();
  });
  const olderItems = visibleItems.filter((item) => Date.parse(item.created_at) < weekStart.getTime());
  const unreadCount = eligibleItems.filter((item) => !hiddenIds.has(item.id) && !readIds.has(item.id)).length;
  const visibleUnreadCount = visibleItems.filter((item) => !readIds.has(item.id)).length;
  const visibleReadCount = visibleItems.length - visibleUnreadCount;
  const unreadCountsByCategory = useMemo(() => ({
    Chapters: eligibleItems.filter((item) => item.category === 'Chapters' && !hiddenIds.has(item.id) && !readIds.has(item.id)).length,
    Series: eligibleItems.filter((item) => item.category === 'Series' && !hiddenIds.has(item.id) && !readIds.has(item.id)).length,
  }), [eligibleItems, hiddenIds, readIds]);

  const saveReadIds = (next: Set<string>, nextReadTimes: Record<string, string>) => {
    storeIds(READ_IDS_KEY, next);
    storeReadTimes(nextReadTimes);
    setReadIds(next);
    setReadTimes(nextReadTimes);
    window.dispatchEvent(new Event('vortex-notification-read-change'));
  };

  const markRead = (id: string) => {
    const next = new Set(readIds);
    next.add(id);
    const nextReadTimes = { ...readTimes, [id]: readTimes[id] || new Date().toISOString() };
    saveReadIds(next, nextReadTimes);
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

  const showNotificationSuccessToast = (message: string) => {
    toast({
      description: (
        <span className="notification-read-toast__content">
          <CircleCheck aria-hidden="true" className="notification-read-toast__icon" size={18} />
          <span>{message}</span>
        </span>
      ),
      className: 'notification-read-toast',
    });
  };

  const markAllRead = () => {
    const next = new Set(readIds);
    const nextReadTimes = { ...readTimes };
    const markedAt = new Date().toISOString();
    const unreadItems = eligibleItems.filter((item) => !hiddenIds.has(item.id) && !next.has(item.id));
    unreadItems.forEach((item) => {
      next.add(item.id);
      nextReadTimes[item.id] = markedAt;
    });
    saveReadIds(next, nextReadTimes);
    if (unreadItems.length > 0) showNotificationSuccessToast('All notifications marked as read');
  };

  const markVisibleCategoryRead = () => {
    const next = new Set(readIds);
    const nextReadTimes = { ...readTimes };
    const markedAt = new Date().toISOString();
    const unreadItems = visibleItems.filter((item) => !next.has(item.id));
    unreadItems.forEach((item) => {
      next.add(item.id);
      nextReadTimes[item.id] = markedAt;
    });
    saveReadIds(next, nextReadTimes);
    if (unreadItems.length > 0) {
      showNotificationSuccessToast(filter === 'All' ? 'All notifications marked as read' : 'Category notifications marked as read');
    }
  };

  const deleteVisibleRead = () => {
    const readItems = visibleItems.filter((item) => readIds.has(item.id));
    if (!readItems.length) return 0;
    setHiddenIds((current) => {
      const next = new Set(current);
      readItems.forEach((item) => next.add(item.id));
      storeIds(HIDDEN_IDS_KEY, next);
      return next;
    });
    return readItems.length;
  };

  const showDeletedReadToast = (deletedCount: number) => {
    if (deletedCount < 1) return;
    showNotificationSuccessToast(`${deletedCount} read notification${deletedCount === 1 ? '' : 's'} deleted`);
  };

  const cancelDeleteHold = () => {
    if (deleteHoldIntervalRef.current !== null) {
      window.clearInterval(deleteHoldIntervalRef.current);
      deleteHoldIntervalRef.current = null;
    }
    setDeleteHoldProgress(0);
    setDeleteHoldState((current) => {
      if (current !== 'holding') return current;
      if (deleteHoldArmTimeoutRef.current !== null) window.clearTimeout(deleteHoldArmTimeoutRef.current);
      deleteHoldArmTimeoutRef.current = window.setTimeout(() => {
        deleteHoldArmTimeoutRef.current = null;
        setDeleteHoldState('idle');
      }, DELETE_HOLD_ARM_TIMEOUT_MS);
      return 'armed';
    });
  };

  const beginDeleteHold = () => {
    if (!isPage || deleteHoldState !== 'armed') return;
    if (deleteHoldArmTimeoutRef.current !== null) {
      window.clearTimeout(deleteHoldArmTimeoutRef.current);
      deleteHoldArmTimeoutRef.current = null;
    }
    const startedAt = Date.now();
    setDeleteHoldState('holding');
    deleteHoldIntervalRef.current = window.setInterval(() => {
      const progress = Math.min(100, ((Date.now() - startedAt) / DELETE_HOLD_DURATION_MS) * 100);
      setDeleteHoldProgress(progress);
      if (progress < 100) return;

      if (deleteHoldIntervalRef.current !== null) {
        window.clearInterval(deleteHoldIntervalRef.current);
        deleteHoldIntervalRef.current = null;
      }
      setDeleteHoldState('deleting');
      deleteHoldTimeoutRef.current = window.setTimeout(() => {
        deleteHoldTimeoutRef.current = null;
        const deletedCount = deleteVisibleRead();
        setDeleteHoldProgress(0);
        setDeleteHoldState('idle');
        showDeletedReadToast(deletedCount);
      }, 280);
    }, 24);
  };

  const renderDeleteReadButton = (mobile = false) => {
    const label = deleteHoldState === 'deleting'
      ? 'Deleting…'
      : deleteHoldState === 'holding'
        ? 'Keep holding…'
        : deleteHoldState === 'armed'
          ? 'Hold to delete'
          : 'Delete read';
    const className = isPage
      ? `notification-delete-hold${deleteHoldState !== 'idle' ? ` is-${deleteHoldState}` : ''}${mobile ? ' notification-delete-hold--mobile' : ''}`
      : undefined;

    return (
      <button
        type="button"
        className={className}
        data-notification-action="delete-read"
        aria-label={label}
        title={label}
        aria-pressed={isPage ? deleteHoldState === 'armed' || deleteHoldState === 'holding' : undefined}
        onClick={isPage ? () => {
          if (deleteHoldState === 'idle') {
            setDeleteHoldState('armed');
            deleteHoldArmTimeoutRef.current = window.setTimeout(() => {
              deleteHoldArmTimeoutRef.current = null;
              setDeleteHoldState('idle');
            }, DELETE_HOLD_ARM_TIMEOUT_MS);
          }
        } : () => setConfirmDeleteRead(true)}
        onPointerDown={isPage ? (event) => {
          if (deleteHoldState !== 'armed') return;
          event.currentTarget.setPointerCapture(event.pointerId);
          beginDeleteHold();
        } : undefined}
        onPointerUp={isPage ? cancelDeleteHold : undefined}
        onPointerCancel={isPage ? cancelDeleteHold : undefined}
        onKeyDown={isPage ? (event) => {
          if ((event.key === ' ' || event.key === 'Enter') && deleteHoldState === 'armed' && !event.repeat) {
            event.preventDefault();
            beginDeleteHold();
          }
        } : undefined}
        onKeyUp={isPage ? (event) => {
          if (event.key === ' ' || event.key === 'Enter') cancelDeleteHold();
        } : undefined}
        style={isPage && deleteHoldState === 'holding'
          ? { background: `linear-gradient(90deg, rgba(var(--accent-rgb), .2) ${deleteHoldProgress}%, transparent ${deleteHoldProgress}%)` }
          : undefined}
      >
        <Trash2 size={mobile ? 16 : 18} />
        <span>{label}</span>
      </button>
    );
  };

  const refresh = async () => {
    if (refreshing) return;
    const startedAt = Date.now();
    const previousLoadedAt = lastLoadedAtRef.current;
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
    if (!isPage && lastLoadedAtRef.current !== previousLoadedAt) {
      showNotificationSuccessToast('Notifications refreshed');
    }
  };

  const renderItems = (group: NotificationRow[]) => group.map((item) => {
    const unread = !readIds.has(item.id);
    const timestamp = unread ? item.created_at : readTimes[item.id] || item.created_at;
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
          <span className="notification-item__headline">
            <span className="notification-item__kind">
              {unread && <span className="notification-item__inline-dot" aria-hidden="true" />}
              {item.category === 'Chapters' ? 'New chapter' : 'New series added'}
            </span>
            <time className="notification-item__date notification-item__date--inline" dateTime={timestamp}>{notificationTimestamp(timestamp)}</time>
          </span>
          <span className="notification-item__summary">
            <span className="notification-item__text"><strong>{item.series_title}</strong></span>
            <span className="notification-item__preview">{item.message}</span>
          </span>
          <span className="notification-item__age">{relativeAge(item.created_at)}</span>
        </span>
        {isPage && (
          <time className="notification-item__date notification-item__date--side" dateTime={timestamp}>{notificationTimestamp(timestamp)}</time>
        )}
        {(isPage || unread) && (
          <span className={`notification-item__unread-dot${unread ? '' : ' is-read'}`} aria-label={unread ? 'Unread' : 'Read'} />
        )}
      </button>
    );
  });

  useEffect(() => {
    if (!open || isPage) return;
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
  }, [open, isPage]);

  useEffect(() => {
    if (!open || isPage || !window.matchMedia('(max-width: 680px)').matches) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousHtmlOverflow = html.style.overflow;

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;
      html.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open, isPage]);

  const renderFilters = (className: string) => (
    <nav className={className} aria-label="Filter notifications">
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
          {(label === 'All' ? unreadCount : unreadCountsByCategory[label]) > 0 && (
            <span className="notification-filters__count">
              {label === 'All' ? unreadCount : unreadCountsByCategory[label]}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className={`notification-center${isPage ? ' notification-center--page' : ''}`} ref={rootRef}>
      {!isPage && <button
        type="button"
        className={`icon-pill notification-trigger${open || location.split('?')[0] === '/notifications' ? ' is-open' : ''}`}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        onClick={() => {
          if (location.split('?')[0] === '/notifications') {
            void loadNotifications();
            return;
          }
          if (window.matchMedia('(max-width: 680px)').matches) {
            setLocation('/notifications');
            return;
          }
          setOpen((value) => !value);
          void loadNotifications();
        }}
      >
        <Bell size={18} fill={open || location.split('?')[0] === '/notifications' ? 'currentColor' : 'none'} />
        {unreadCount > 0 && <span className="notification-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>}

      {isPage && (
        <aside className="notification-page-sidebar" aria-label="Notification categories">
          {renderFilters('notification-filters notification-page-sidebar__filters')}
        </aside>
      )}

      {(open || isPage) && (
        <section className={`notification-panel${isPage ? ' notification-panel--page' : ''}`} role={isPage ? 'region' : 'dialog'} aria-label="Notifications">
          <header className="notification-panel__header">
            <div className="notification-panel__heading">
              <h2>
                <span className="notification-panel__desktop-title">
                  {isPage && filter !== 'All' ? `${filter} notifications` : 'Notifications'}
                </span>
                <span className="notification-panel__mobile-title">
                  {filter === 'All' ? 'Notifications' : `${filter} notifications`}
                </span>
                {!isPage && !listIsLoading && visibleItems.length === 0 && (
                  <span className="notification-panel__desktop-empty-status">You’re all caught up</span>
                )}
              </h2>
              {(isPage ? visibleUnreadCount > 0 : listIsLoading || visibleUnreadCount > 0) && (
                <span className="notification-panel__unread-count">
                  {visibleUnreadCount}
                  {!isPage && <span className="notification-panel__unread-label">unread</span>}
                </span>
              )}
            </div>
            <div className="notification-panel__actions">
              {visibleReadCount > 0 && (
                renderDeleteReadButton()
              )}
              {(isPage || visibleUnreadCount > 0) && (
                <button
                  type="button"
                  aria-label="Mark all as read"
                  title="Mark all as read"
                  onClick={markAllRead}
                  disabled={visibleUnreadCount === 0}
                >
                  {isPage ? <CircleCheck size={19} /> : <CheckCheck size={19} />}
                  <span>Mark all as read</span>
                </button>
              )}
              <button type="button" aria-label="Refresh notifications" title="Refresh notifications" onClick={() => void refresh()}>
                <RefreshCw className={refreshing ? 'is-refreshing' : ''} size={18} />
              </button>
            </div>
            <div className="notification-panel__mobile-actions">
              {visibleReadCount > 0 && (
                renderDeleteReadButton(true)
              )}
              <button type="button" onClick={markVisibleCategoryRead} disabled={visibleUnreadCount === 0}>
                {isPage ? <CircleCheck size={16} /> : <CheckCheck size={16} />}
                <span>{filter === 'All' ? 'Mark all as read' : 'Mark category as read'}</span>
              </button>
            </div>
          </header>

          {!isPage && confirmDeleteRead && (
            <div className="notification-delete-confirmation" role="alertdialog" aria-label="Confirm deleting read notifications">
              <span>Delete all read notifications? This can’t be undone.</span>
              <div className="notification-delete-confirmation__actions">
                <button type="button" onClick={() => setConfirmDeleteRead(false)}>Cancel</button>
                <button
                  type="button"
                  className="notification-delete-confirmation__delete"
                  onClick={() => {
                    const deletedCount = deleteVisibleRead();
                    setConfirmDeleteRead(false);
                    showDeletedReadToast(deletedCount);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {!isPage && renderFilters('notification-filters')}
          {isPage && renderFilters('notification-filters notification-page-mobile-filters')}

          <div className="notification-list" aria-live="polite" aria-busy={listIsLoading}>
            {listIsLoading ? <NotificationLoadingSkeleton /> : (
              <>
                {todayItems.length > 0 && <div className="notification-list__section">Today</div>}
                {renderItems(todayItems)}
                {earlierThisWeekItems.length > 0 && <div className="notification-list__section">Earlier this week</div>}
                {renderItems(earlierThisWeekItems)}
                {olderItems.length > 0 && <div className="notification-list__section">Earlier</div>}
                {renderItems(olderItems)}
                {hasOlder && (
                  <button
                    type="button"
                    className="notification-load-older"
                    onClick={() => void loadOlderNotifications()}
                    disabled={loadingOlder}
                  >
                    <RefreshCw className={loadingOlder ? 'is-refreshing' : ''} size={14} />
                    {loadingOlder ? 'Loading older notifications…' : 'Load older notifications'}
                  </button>
                )}
                {!visibleItems.length && (
                  <div className="notification-empty">
                    <span className="notification-empty__icon" aria-hidden="true">
                      <Bell size={20} />
                    </span>
                    <span className="notification-empty__title">
                      {isPage ? 'No notifications yet' : 'You’re all caught up'}
                    </span>
                    <span className="notification-empty__subtitle">
                      {isPage ? "When you get notifications, they'll show up here" : 'No new notifications'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {!isPage && <button type="button" className="notification-panel__footer" onClick={() => {
            setOpen(false);
            setLocation('/notifications');
          }}>
            See more notifications
          </button>}
        </section>
      )}

    </div>
  );
}
