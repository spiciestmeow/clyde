export type BookmarkSubscriptionInterval = {
  bookmarkedAt: number;
  unbookmarkedAt?: number;
};

export const BOOKMARKS_STORAGE_KEY = 'vortex-series-bookmarks';
export const BOOKMARK_INTERVALS_KEY = 'vortex-bookmark-intervals-v1';
export const BOOKMARKS_CHANGED_EVENT = 'vortex-bookmarks-change';

export function getBookmarkIntervals(): Record<string, BookmarkSubscriptionInterval[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BOOKMARK_INTERVALS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const intervals: Record<string, BookmarkSubscriptionInterval[]> =
      typeof parsed === 'object' && parsed !== null ? parsed : {};

    // Auto-migrate legacy bookmarks that might not have intervals recorded yet
    const rawBookmarks = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (rawBookmarks) {
      const legacyList = JSON.parse(rawBookmarks);
      if (Array.isArray(legacyList)) {
        let changed = false;
        const now = Date.now();
        for (const item of legacyList) {
          if (typeof item === 'string') {
            const slug = item.replace(/^\/series\//, '').replace(/\/$/, '').trim().toLowerCase();
            if (slug && (!intervals[slug] || intervals[slug].length === 0)) {
              intervals[slug] = [{ bookmarkedAt: now }];
              changed = true;
            }
          }
        }
        if (changed) {
          try {
            window.localStorage.setItem(BOOKMARK_INTERVALS_KEY, JSON.stringify(intervals));
          } catch {
            // storage unavailable
          }
        }
      }
    }

    return intervals;
  } catch {
    return {};
  }
}

export function recordBookmarkEvent(seriesSlug: string, action: 'bookmark' | 'unbookmark'): void {
  if (typeof window === 'undefined') return;
  const slug = seriesSlug.replace(/^\/series\//, '').replace(/\/$/, '').trim().toLowerCase();
  if (!slug) return;

  const now = Date.now();
  const all = getBookmarkIntervals();
  const intervals = Array.isArray(all[slug]) ? [...all[slug]] : [];

  if (action === 'bookmark') {
    const last = intervals[intervals.length - 1];
    // Only open a new interval if not already active
    if (!last || last.unbookmarkedAt) {
      intervals.push({ bookmarkedAt: now });
    }
  } else {
    // Unbookmark: close the active interval
    const last = intervals[intervals.length - 1];
    if (last && !last.unbookmarkedAt) {
      last.unbookmarkedAt = now;
    }
  }

  all[slug] = intervals;
  try {
    window.localStorage.setItem(BOOKMARK_INTERVALS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable
  }
}

export function isNotificationEligibleForUser(
  category: 'Series' | 'Chapters',
  seriesSlug: string,
  notificationCreatedAt: string,
  allIntervals: Record<string, BookmarkSubscriptionInterval[]>,
): boolean {
  // New series notifications are global and shown to everyone
  if (category === 'Series') return true;

  if (category === 'Chapters') {
    const slug = (seriesSlug || '').replace(/^\/series\//, '').replace(/\/$/, '').trim().toLowerCase();
    const intervals = allIntervals[slug];
    if (!intervals || intervals.length === 0) return false;

    const notifMs = Date.parse(notificationCreatedAt);
    if (!Number.isFinite(notifMs)) return false;

    // Check if the notification was published during any subscription window:
    // published AFTER bookmarkedAt AND (still subscribed OR published BEFORE unbookmarkedAt)
    return intervals.some((interval) => {
      if (notifMs < interval.bookmarkedAt) return false;
      if (interval.unbookmarkedAt && notifMs > interval.unbookmarkedAt) return false;
      return true;
    });
  }

  return true;
}
