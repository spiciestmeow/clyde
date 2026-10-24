export type RecentlyViewedSeries = { slug: string; viewedAt: number };

export const RECENTLY_VIEWED_SERIES_KEY = 'vortex-recently-viewed-series';
export const RECENTLY_VIEWED_SERIES_UPDATED_EVENT = 'vortex-recently-viewed-series-updated';
const MAX_RECENT_SERIES = 12;

export function readRecentlyViewedSeries(): RecentlyViewedSeries[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_SERIES_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is RecentlyViewedSeries =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.slug === 'string' &&
        typeof item.viewedAt === 'number' &&
        Number.isFinite(item.viewedAt),
      )
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, MAX_RECENT_SERIES);
  } catch {
    return [];
  }
}

export function recordRecentlyViewedSeries(slug: string): void {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug || typeof window === 'undefined') return;

  const next = [
    { slug: normalizedSlug, viewedAt: Date.now() },
    ...readRecentlyViewedSeries().filter((item) => item.slug !== normalizedSlug),
  ].slice(0, MAX_RECENT_SERIES);

  try {
    localStorage.setItem(RECENTLY_VIEWED_SERIES_KEY, JSON.stringify(next));
  } catch {
    return;
  }

  window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_SERIES_UPDATED_EVENT, { detail: next }));
}
