import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Activity, ArrowDownUp, ArrowLeft, ArrowUpRight, Bell, BookOpen, Bookmark, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Eye, Flag, Heart, List, Maximize2, MessageSquare, MessageSquareText, PenLine, Rows3, Search, Share2, Square, Star, Trash2, TriangleAlert, Type, X, ZoomIn } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '../hooks/use-toast';
import {
  cacheSeriesCatalog,
  getCachedSeriesCatalog,
  incrementSeriesViews,
  getSiteSearchHighlights,
  searchSiteCatalog,
  getSeriesRecommendations,
  SERIES_CATALOG_QUERY_KEY,
  DEFAULT_SERIES_COVER,
  type SeriesRecommendation,
  type SeriesCatalogResponse,
  type SeriesRecord,
} from '../lib/seriesCatalog';
import assets from '../../clone-data/asset-references.json';
import angryReactionIcon from '../assets/reactions/angry.webp';
import cryReactionIcon from '../assets/reactions/cry.webp';
import laughReactionIcon from '../assets/reactions/laugh.webp';
import likeReactionIcon from '../assets/reactions/like.webp';
import loveReactionIcon from '../assets/reactions/love.webp';
import wowReactionIcon from '../assets/reactions/wow.webp';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import SiteSearch from '../components/SiteSearch';
import SeriesNotFound from '../components/SeriesNotFound';
import { SeriesReportIssue } from '../components/SeriesReportIssue';
import { Shareable } from '../components/Shareable';
import { useThemeMode } from '../hooks/useThemeMode';
import { useSeriesDetail } from '../hooks/useSeriesDetail';
import { DEFAULT_SERIES_PAGE_VISIBILITY, SITE_SETTINGS_UPDATED_EVENT, getCachedSiteSettings, getSiteSettings } from '../lib/siteSettings';
import { formatScanlatorSeriesUrl } from '../lib/scanlatorLinks';
import { getEarlyBirdSource, getWinningChapterSource, releaseTimestamp } from '../lib/sourcePriority';
import { recordRecentlyViewedSeries } from '../lib/recentlyViewedSeries';
import { recordBookmarkEvent } from '../lib/bookmarkNotifications';
import {
  getAnonymousVisitorId,
  loadSeriesReactionState,
  loadSeriesSourceReactionState,
  toggleSeriesReaction,
  toggleSeriesSourceReaction,
  type SeriesReactionCounts,
  type SeriesReactionKey,
} from '../lib/seriesReactions';
import '../series-detail.css';
import '../series-data-status.css';

type Recommendation = { title: string; href: string; cover: string; rating: string | null; chapterCount: number };
type ReactionKey = SeriesReactionKey;
type ReactionCounts = SeriesReactionCounts;
type RailPosition = { left: number; top: number; width: number; maxHeight: number };
type FixedRailPositions = { left: RailPosition; right: RailPosition };

export type BookmarkType = 'reading' | 'to-read' | 'finished' | 'abandoned';

export const BOOKMARK_OPTIONS: { id: BookmarkType; label: string; buttonLabel: string }[] = [
  { id: 'reading', label: 'Currently Reading', buttonLabel: 'Reading' },
  { id: 'to-read', label: 'To-Read List', buttonLabel: 'To-Read' },
  { id: 'finished', label: 'Finished Reading', buttonLabel: 'Finished' },
  { id: 'abandoned', label: 'Abandoned Reads', buttonLabel: 'Abandoned' },
];

export const BOOKMARK_TYPES_STORAGE_KEY = 'vortex-bookmark-types';

function readBookmarkTypes(): Record<string, BookmarkType> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BOOKMARK_TYPES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeBookmarkTypes(types: Record<string, BookmarkType>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BOOKMARK_TYPES_STORAGE_KEY, JSON.stringify(types));
  } catch {
    // storage unavailable
  }
}

const assetList = assets as { src: string; alt: string }[];
const reactionKeys: ReactionKey[] = ['like', 'love', 'happy', 'wow', 'sad', 'angry'];
const emptyReactionCounts: ReactionCounts = {
  like: 0,
  love: 0,
  happy: 0,
  wow: 0,
  sad: 0,
  angry: 0,
};
const reactionCountSnapshots: Record<string, ReactionCounts> = {
  lumberjack: { like: 1, love: 7, happy: 2, wow: 3, sad: 0, angry: 0 },
  'murim-psychopath': { like: 3, love: 33, happy: 1, wow: 0, sad: 1, angry: 4 },
  'the-crazy-villain-regains-his-sanity': {
    like: 6,
    love: 36,
    happy: 3,
    wow: 3,
    sad: 3,
    angry: 3,
  },
};

function readReactionCounts(slug: string): ReactionCounts {
  const snapshot = { ...(reactionCountSnapshots[slug] ?? emptyReactionCounts) };

  const addLegacySelection = () => {
    try {
      const selected = localStorage.getItem(`vortex-reaction:${slug}`);
      if (isReactionKey(selected)) snapshot[selected] += 1;
    } catch {
      // Continue with the available starting totals when browser storage is unavailable.
    }
    return snapshot;
  };

  try {
    const saved = localStorage.getItem(`vortex-reaction-counts:${slug}`);
    if (!saved) return addLegacySelection();

    const parsed = JSON.parse(saved) as Partial<ReactionCounts>;
    const valid = reactionKeys.every((key) =>
      Number.isInteger(parsed[key]) && Number(parsed[key]) >= 0,
    );
    return valid
      ? Object.fromEntries(reactionKeys.map((key) => [key, parsed[key]])) as ReactionCounts
      : addLegacySelection();
  } catch {
    return snapshot;
  }
}

function isReactionKey(value: string | null): value is ReactionKey {
  return value !== null && reactionKeys.includes(value as ReactionKey);
}

function imageUrl(source: string, width = 400) {
  if (source.startsWith('https://i0.wp.com/')) {
    const url = new URL(source);
    url.searchParams.set('w', String(width));
    return url.toString();
  }
  if (source.startsWith('https://storage.vortexscans.org/')) {
    const url = new URL(source);
    url.searchParams.set('w', String(width));
    return url.toString();
  }
  return source;
}

function recoverSeriesImage(event: SyntheticEvent<HTMLDivElement>) {
  const image = event.target as HTMLImageElement;
  if (image.tagName !== 'IMG') return;
  const coverFrame = image.closest('.series-cover-frame');
  if (image.dataset.fallbackAttempted) {
    if (coverFrame && image.dataset.fallbackAttempted !== 'placeholder') {
      image.dataset.fallbackAttempted = 'placeholder';
      image.src = DEFAULT_SERIES_COVER;
      return;
    }
    image.hidden = true;
    coverFrame?.classList.add('is-image-failed');
    if (image.parentElement?.classList.contains('brand')) {
      image.parentElement.classList.add('brand-fallback');
    }
    if (image.parentElement?.classList.contains('footer-logo-link')) {
      image.parentElement.classList.add('series-footer-logo-fallback');
    }
    return;
  }

  const failedUrl = image.currentSrc || image.src;
  image.removeAttribute('srcset');
  let fallback = '';
  if (failedUrl.startsWith('https://i0.wp.com/')) {
    fallback = `https://${failedUrl.slice('https://i0.wp.com/'.length).split('?')[0]}`;
  } else if (failedUrl.startsWith('https://storage.vortexscans.org/')) {
    const path = failedUrl.slice('https://'.length).split('?')[0];
    fallback = `https://i0.wp.com/${path}?w=400&quality=85&strip=all&ssl=1`;
  }
  if (fallback) {
    image.dataset.fallbackAttempted = 'direct';
    image.src = fallback;
  } else if (coverFrame) {
    image.dataset.fallbackAttempted = 'placeholder';
    image.src = DEFAULT_SERIES_COVER;
  } else {
    image.dataset.fallbackAttempted = 'failed';
    image.hidden = true;
  }
}

function readSet(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function formatFavoriteCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}

function formatRelativeTime(timestamp: number, sourceName?: string): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  if (/lagoon/i.test(sourceName || '') && diffDays < 365) {
    const roundedMonths = Math.max(1, Math.round(diffDays / 30));
    return `${roundedMonths} month${roundedMonths > 1 ? 's' : ''} ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  const diffYears = Math.floor(diffDays / 365);
  if (diffYears < 1) return `${diffMonths} months ago`;
  return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
}

function getLatestSeriesUpdate(series: SeriesRecord): string {
  const winningSource = getWinningChapterSource(series.sources, series.facts?.latest_source_url || undefined);
  if (winningSource) {
    if (!winningSource.latestChapterAt) return 'Time unavailable';
    const sourceTimestamp = Date.parse(winningSource.latestChapterAt);
    return Number.isNaN(sourceTimestamp) ? 'Time unavailable' : formatRelativeTime(sourceTimestamp);
  }

  const factUpdate = (series.facts?.lastUpdate || series.facts?.['Last update'] || '').trim();
  if (factUpdate && factUpdate.toLowerCase() !== 'not provided') {
    const parsed = Date.parse(factUpdate);
    if (!Number.isNaN(parsed) && factUpdate.includes('T')) {
      return formatRelativeTime(parsed);
    }
    return factUpdate;
  }

  const newestChapterStatus = series.chapters?.[0]?.status?.trim();
  if (newestChapterStatus) {
    const s = newestChapterStatus.toLowerCase();
    if (s === 'new' || s === 'just now' || s === 'free now') return 'Just now';
    if (s === 'today') return 'Today';
    if (s === 'yesterday') return 'Yesterday';
    if (/^\d+\s*(?:min|hour|hr|day|week|month)s?$/.test(s)) {
      return `${newestChapterStatus} ago`;
    }
    if (s.includes('ago')) {
      return newestChapterStatus;
    }
    const parsed = Date.parse(newestChapterStatus);
    if (!Number.isNaN(parsed)) {
      return formatRelativeTime(parsed);
    }
    return newestChapterStatus;
  }

  const timestamp = series.updatedAt || series.createdAt;
  if (timestamp) {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) {
      return formatRelativeTime(parsed);
    }
  }

  return 'Recently';
}

const VIEW_COOLDOWN_MS = 60 * 1000; // 1-minute cooldown per series to prevent duplicate rapid clicks while allowing natural views

export default function SeriesDetailPage() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const slug = decodeURIComponent(params.slug || '').replace(/\/$/, '');
  const queryClient = useQueryClient();
  const detailQuery = useSeriesDetail(slug);
  const series: SeriesRecord | undefined = detailQuery.data ?? undefined;
  const seriesQuery = detailQuery;
  const detail = series;
  const alternateTitleText = detail?.alternateTitles?.join(' / ') ?? '';
  const searchHighlightsQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'series-detail-search-highlights'],
    queryFn: () => getSiteSearchHighlights(4),
    staleTime: 5 * 60 * 1000,
  });
  const searchSeries = useCallback(async (query: string) => {
    return searchSiteCatalog(query, 4);
  }, []);
  const [bookmarks, setBookmarks] = useState<string[]>(() => readSet('vortex-series-bookmarks'));
  const [favoriteCount, setFavoriteCount] = useState<number>(() => {
    return parseInt(String(series?.favorites || '0').replace(/[^\d]/g, ''), 10) || 0;
  });
  const [reaction, setReaction] = useState<ReactionKey | null>(() => {
    try {
      const savedReaction = localStorage.getItem(`vortex-reaction:${slug}`);
      return isReactionKey(savedReaction) ? savedReaction : null;
    } catch {
      return null;
    }
  });
  const [reactionCounts, setReactionCounts] = useState<ReactionCounts>(() => readReactionCounts(slug));
  const [sourceReactionCounts, setSourceReactionCounts] = useState<Record<string, number>>({});
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactionLoadingKey, setReactionLoadingKey] = useState<ReactionKey | null>(null);
  const [sourceReactionBusy, setSourceReactionBusy] = useState<string[]>([]);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [bookmarkNoticeDismissed, setBookmarkNoticeDismissed] = useState(false);
  const [bookmarkDropdownOpen, setBookmarkDropdownOpen] = useState(false);
  const [bookmarkTypes, setBookmarkTypes] = useState<Record<string, BookmarkType>>(readBookmarkTypes);
  const bookmarkDropdownRef = useRef<HTMLDivElement>(null);
  const [siteSettings, setSiteSettings] = useState(() => getCachedSiteSettings());
  const [seriesPageVisibility, setSeriesPageVisibility] = useState(
    () => getCachedSiteSettings()?.seriesPage ?? DEFAULT_SERIES_PAGE_VISIBILITY,
  );
  const [showDetailSkeleton, setShowDetailSkeleton] = useState(false);
  const relatedQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'series-detail-recommendations', series?.id, series?.category, series?.genres, series?.tags, series?.author, series?.artist],
    queryFn: ({ signal }) => series ? getSeriesRecommendations(series, 7, signal) : Promise.resolve([]),
    enabled: Boolean(slug) && seriesPageVisibility.similarSeries,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * (2 ** attempt), 8_000),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!series || !seriesPageVisibility.similarSeries || !relatedQuery.isPending || relatedQuery.fetchStatus !== 'idle') return;
    void relatedQuery.refetch();
  }, [series?.id, seriesPageVisibility.similarSeries, relatedQuery.isPending, relatedQuery.fetchStatus, relatedQuery.refetch]);
  const [sourceReactions, setSourceReactions] = useState<string[]>([]);
  const [visitedSources, setVisitedSources] = useState<string[]>([]);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourcesNewestFirst, setSourcesNewestFirst] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const { dark, toggleTheme } = useThemeMode();
  const [activeTab, setActiveTab] = useState<'sources' | 'synopsis' | 'reviews'>('sources');
  const [, setTick] = useState(0);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [alternateTitlesExpanded, setAlternateTitlesExpanded] = useState(false);
  const [alternateTitlesOverflow, setAlternateTitlesOverflow] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const alternateTitlesRef = useRef<HTMLParagraphElement>(null);
  const coverButtonRef = useRef<HTMLButtonElement>(null);
  const closeCoverRef = useRef<HTMLButtonElement>(null);
  const seriesLayoutRef = useRef<HTMLDivElement>(null);
  const [fixedRailPositions, setFixedRailPositions] = useState<FixedRailPositions | null>(null);
  const lastIncrementedSeriesIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!seriesQuery.isLoading) {
      setShowDetailSkeleton(false);
      return;
    }
    const timeout = window.setTimeout(() => setShowDetailSkeleton(true), 150);
    return () => window.clearTimeout(timeout);
  }, [seriesQuery.isLoading, slug]);

  useEffect(() => {
    setBookmarkNoticeDismissed(false);
  }, [slug]);

  useLayoutEffect(() => {
    const element = alternateTitlesRef.current;
    if (!element || alternateTitlesExpanded || !alternateTitleText) return;

    const measureOverflow = () => {
      setAlternateTitlesOverflow(element.scrollHeight > element.clientHeight + 1);
    };
    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [alternateTitleText, alternateTitlesExpanded]);

  useEffect(() => {
    let active = true;
    void getSiteSettings()
      .then((settings) => {
        if (active) { setSeriesPageVisibility(settings.seriesPage); setSiteSettings(settings); }
      })
      .catch(() => {
        // Keep the last cached or default visibility when the settings service is unavailable.
      });

    const handleUpdate = (e: any) => {
      if (active && e.detail) {
        setSeriesPageVisibility(e.detail.seriesPage);
        setSiteSettings(e.detail);
      }
    };
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);

    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (!series) return;
    recordRecentlyViewedSeries(series.slug);
  }, [series?.slug]);

  useEffect(() => {
    if (!series) return;
    let active = true;
    setReactionBusy(true);
    setSourceReactionBusy(series.sources.map((source) => source.url));
    void Promise.all([
      loadSeriesReactionState(series.slug),
      loadSeriesSourceReactionState(series.slug),
    ]).then(([reactionState, sourceState]) => {
      if (!active) return;
      if (reactionState) {
        setReactionCounts(reactionState.counts);
        setReaction(reactionState.selected);
      }
      if (sourceState) {
        setSourceReactionCounts(sourceState.counts);
        setSourceReactions(sourceState.selected);
      }
    }).catch((error: unknown) => {
      console.warn('Could not load shared anonymous reactions:', error);
    }).finally(() => {
      if (active) {
        setReactionBusy(false);
        setSourceReactionBusy([]);
      }
    });
    return () => { active = false; };
  }, [series?.slug]);

  useEffect(() => {
    setBookmarks(readSet('vortex-series-bookmarks'));
    setSourceReactions(readSet(`vortex-source-reactions:${slug}`));
    setVisitedSources(readSet(`vortex-visited-sources:${slug}`));
    setSourceSearch('');
    setSourcesNewestFirst(true);
    setActiveTab('sources');
    setSynopsisExpanded(false);
    setAlternateTitlesExpanded(false);
    setReactionCounts(readReactionCounts(slug));
    try {
      const savedReaction = localStorage.getItem(`vortex-reaction:${slug}`);
      setReaction(isReactionKey(savedReaction) ? savedReaction : null);
    } catch {
      setReaction(null);
    }
  }, [slug]);

  useEffect(() => {
    if (!series?.id) return;

    try {
      const cooldownKey = `vortex-view-cooldown:${series.id}`;
      const lastViewTime = Number(localStorage.getItem(cooldownKey) || 0);
      const now = Date.now();
      if (
        lastIncrementedSeriesIdRef.current !== series.id &&
        (!lastViewTime || now - lastViewTime > VIEW_COOLDOWN_MS)
      ) {
        lastIncrementedSeriesIdRef.current = series.id;
        localStorage.setItem(cooldownKey, String(now));

        const targetId = series.id;
        const updateCachedViews = (views: number) => {
          // 1. Update all React Query queries under SERIES_CATALOG_QUERY_KEY (home, browse, updates)
          queryClient.setQueriesData<any>(
            { queryKey: SERIES_CATALOG_QUERY_KEY },
            (old: any) => {
              if (!old) return old;
              // Format A: Object with items array (e.g. getHomeLatestReleasePage, getSeriesBrowsePage, SeriesCatalogResponse)
              if (Array.isArray(old.items)) {
                return {
                  ...old,
                  items: old.items.map((item: any) =>
                    item && item.id === targetId ? { ...item, views } : item,
                  ),
                };
              }
              // Format B: Array of series directly (e.g. getHomeCatalogHighlights, getSeriesCatalogByIds)
              if (Array.isArray(old)) {
                return old.map((item: any) =>
                  item && item.id === targetId ? { ...item, views } : item,
                );
              }
              return old;
            },
          );

          // 2. Update series-detail queries
          queryClient.setQueriesData<any>(
            { queryKey: ['series-detail'] },
            (old: any) => {
              if (old && typeof old === 'object' && old.id === targetId) {
                return { ...old, views };
              }
              return old;
            },
          );

          // 3. Update localStorage cached catalog if present
          const cached = getCachedSeriesCatalog();
          if (cached?.items) {
            cacheSeriesCatalog({
              ...cached,
              items: cached.items.map((item: SeriesRecord) =>
                item.id === targetId ? { ...item, views } : item,
              ),
            });
          }
        };

        // Update the visible count immediately for instant responsiveness
        const optimisticViews = (series.views ?? 0) + 1;
        updateCachedViews(optimisticViews);

        // Reconcile with server response
        void incrementSeriesViews(series.id).then((newViews) => {
          if (typeof newViews === 'number') {
            updateCachedViews(newViews);
          }
          // Mark queries stale in the background so future fetches stay in sync
          void queryClient.invalidateQueries({
            queryKey: SERIES_CATALOG_QUERY_KEY,
            refetchType: 'none',
          });
          void queryClient.invalidateQueries({
            queryKey: ['series-detail'],
            refetchType: 'none',
          });
        });
      }
    } catch {
      // Continue if localStorage is unavailable
    }
  }, [series?.id, queryClient]);

  useLayoutEffect(() => {
    const layout = seriesLayoutRef.current;
    if (!layout) return;

    const leftRail = layout.querySelector<HTMLElement>('.series-left-rail');
    const rightRail = layout.querySelector<HTMLElement>('.series-sidebar');
    if (!leftRail) {
      setFixedRailPositions(null);
      return;
    }

    const updateRailPositions = () => {
      layout.classList.remove('series-layout--rails-fixed');
      leftRail.removeAttribute('style');
      rightRail?.removeAttribute('style');
      const coverFrame = leftRail.querySelector<HTMLElement>('.series-cover-frame');
      const relatedItems = rightRail ? Array.from(rightRail.querySelectorAll<HTMLElement>('.series-related')) : [];
      if (coverFrame) coverFrame.style.maxHeight = '';
      relatedItems.forEach((item) => { item.style.display = ''; });

      if (window.innerWidth <= 700) {
        setFixedRailPositions(null);
        return;
      }

      const main = layout.closest<HTMLElement>('.series-main');
      const zoom = Number.parseFloat(main ? getComputedStyle(main).zoom : '1') || 1;
      const headerHeight = layout.closest('.series-page')
        ?.querySelector('.series-topbar')
        ?.getBoundingClientRect().height ?? 60;
      const top = Math.max(16, (headerHeight + 12) / zoom);
      const maxHeight = Math.max(120, (window.innerHeight - top * zoom - 16) / zoom);

      // Never fall back to sticky: shrink the rails so they always fit the screen.
      // Left rail: cap the cover height by however much the rail overflows.
      const leftHeight = leftRail.getBoundingClientRect().height / zoom;
      if (coverFrame && leftHeight > maxHeight) {
        const coverHeight = coverFrame.getBoundingClientRect().height / zoom;
        coverFrame.style.maxHeight = `${Math.max(140, coverHeight - (leftHeight - maxHeight))}px`;
      }
      // Right rail: hide trailing similar-series items that don't fit.
      for (let i = relatedItems.length - 1; i > 0; i -= 1) {
        if (!rightRail || rightRail.getBoundingClientRect().height / zoom <= maxHeight) break;
        relatedItems[i].style.display = 'none';
      }

      const leftRect = leftRail.getBoundingClientRect();
      const rightRect = rightRail?.getBoundingClientRect() ?? leftRect;

      const left = { left: leftRect.left / zoom, top, width: leftRect.width / zoom, maxHeight };
      const right = { left: rightRect.left / zoom, top, width: rightRect.width / zoom, maxHeight };

      // We removed the class/styles straight from the DOM above, so React may think
      // nothing changed and skip re-adding them. Re-apply them directly here.
      const applyRail = (el: HTMLElement, p: typeof left) => {
        el.style.left = `${p.left}px`;
        el.style.top = `${p.top}px`;
        el.style.width = `${p.width}px`;
        el.style.maxHeight = `${p.maxHeight}px`;
      };
      layout.classList.add('series-layout--rails-fixed');
      applyRail(leftRail, left);
      if (rightRail) applyRail(rightRail, right);

      setFixedRailPositions({ left, right });
    };

    let frame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateRailPositions);
    };

    updateRailPositions();
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [slug, series, seriesPageVisibility.similarSeries]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const layout = seriesLayoutRef.current;
    layout?.querySelector<HTMLElement>('.series-left-rail')?.scrollTo(0, 0);
    layout?.querySelector<HTMLElement>('.series-sidebar')?.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    if (!coverOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeCoverRef.current?.focus();
    const closeOnKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        setCoverOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnKeyboard);
    return () => {
      window.removeEventListener('keydown', closeOnKeyboard);
      document.body.style.overflow = previousOverflow;
      coverButtonRef.current?.focus();
    };
  }, [coverOpen]);

  // Tick every 60 s so chapter badge transitions from "New" to relative time without a page reload.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const bookmarked = Boolean(series && (bookmarks.includes(series.slug) || bookmarks.includes(series.href)));

  useEffect(() => {
    if (series?.favorites !== undefined && series?.favorites !== null) {
      setFavoriteCount(parseInt(String(series.favorites).replace(/[^\d]/g, ''), 10) || 0);
    }
  }, [series?.favorites]);

  const related = useMemo(() => (relatedQuery.data ?? []).map((item: SeriesRecommendation) => ({
    title: item.title,
    href: item.href,
    cover: item.cover,
    rating: item.rating,
    chapterCount: item.chapterCount,
  })), [relatedQuery.data]);

  const currentBookmarkType = series ? (bookmarkTypes[series.slug] ?? null) : null;

  const handleBookmarkButtonClick = () => {
    if (!series) return;
    setBookmarkDropdownOpen((prev) => !prev);
  };

  const selectBookmarkType = async (type: BookmarkType | 'remove') => {
    if (!series || bookmarkBusy) return;
    setBookmarkDropdownOpen(false);
    setBookmarkBusy(true);

    if (type === 'remove') {
      const next = bookmarks.filter((id) => id !== series.slug && id !== series.href);
      const nextTypes = { ...bookmarkTypes };
      delete nextTypes[series.slug];
      setBookmarks(next);
      setBookmarkTypes(nextTypes);
      try {
        localStorage.setItem('vortex-series-bookmarks', JSON.stringify(next));
        writeBookmarkTypes(nextTypes);
        recordBookmarkEvent(series.slug, 'unbookmark');
        window.dispatchEvent(new Event('vortex-bookmarks-change'));
      } catch { /* storage may be unavailable */ }
      setFavoriteCount((prev) => Math.max(0, prev - 1));
      toast({
        description: (
          <span className="notification-read-toast__content">
            <Check className="notification-read-toast__icon" size={18} aria-hidden="true" />
            Bookmark removed
          </span>
        ),
        className: 'notification-read-toast',
        duration: 3000,
      });
      // Sync removal to backend
      try {
        const response = await fetch('/api/series-favorite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesSlug: series.slug,
            action: 'unbookmark',
            visitorId: getAnonymousVisitorId(),
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (typeof data.favorites === 'number') setFavoriteCount(data.favorites);
          void queryClient.invalidateQueries({
            queryKey: [...SERIES_CATALOG_QUERY_KEY, 'home-highlights'],
            refetchType: 'none',
          });
        }
      } catch (err) {
        console.warn('Could not sync favorite count:', err);
      }
    } else {
      const wasBookmarked = bookmarked;
      const next = wasBookmarked
        ? bookmarks
        : Array.from(new Set([...bookmarks, series.slug, series.href]));
      const nextTypes = { ...bookmarkTypes, [series.slug]: type };
      setBookmarks(next);
      setBookmarkTypes(nextTypes);
      try {
        localStorage.setItem('vortex-series-bookmarks', JSON.stringify(next));
        writeBookmarkTypes(nextTypes);
        if (!wasBookmarked) recordBookmarkEvent(series.slug, 'bookmark');
        window.dispatchEvent(new Event('vortex-bookmarks-change'));
      } catch { /* storage may be unavailable */ }
      if (!wasBookmarked) setFavoriteCount((prev) => prev + 1);
      toast({
        description: (
          <span className="notification-read-toast__content">
            <Check className="notification-read-toast__icon" size={18} aria-hidden="true" />
            Bookmark updated successfully
          </span>
        ),
        className: 'notification-read-toast',
        duration: 3000,
      });
      // Sync new bookmark to backend
      if (!wasBookmarked) {
        try {
          const response = await fetch('/api/series-favorite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              seriesSlug: series.slug,
              action: 'bookmark',
              visitorId: getAnonymousVisitorId(),
            }),
          });
          if (response.ok) {
            const data = await response.json();
            if (typeof data.favorites === 'number') setFavoriteCount(data.favorites);
            void queryClient.invalidateQueries({
              queryKey: [...SERIES_CATALOG_QUERY_KEY, 'home-highlights'],
              refetchType: 'none',
            });
          }
        } catch (err) {
          console.warn('Could not sync favorite count:', err);
        }
      }
    }
    setBookmarkBusy(false);
  };

  useEffect(() => {
    if (!bookmarkDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (bookmarkDropdownRef.current && !bookmarkDropdownRef.current.contains(e.target as Node)) {
        setBookmarkDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bookmarkDropdownOpen]);
  const share = () => setShareModalOpen(true);
  const chooseReaction = (key: ReactionKey) => {
    if (reactionBusy) return;
    const startedAt = Date.now();
    const next = reaction === key ? null : key;
    const nextCounts = { ...reactionCounts };
    if (reaction) nextCounts[reaction] = Math.max(0, nextCounts[reaction] - 1);
    if (next) nextCounts[next] += 1;
    setReactionCounts(nextCounts);
    try {
      localStorage.setItem(`vortex-reaction-counts:${slug}`, JSON.stringify(nextCounts));
    } catch { /* local reaction remains available for this session */ }
    setReaction(next);
    try {
      if (next) localStorage.setItem(`vortex-reaction:${slug}`, next);
      else localStorage.removeItem(`vortex-reaction:${slug}`);
    } catch { /* local reaction remains available for this session */ }
    setReactionBusy(true);
    setReactionLoadingKey(key);
    void toggleSeriesReaction(slug, key)
      .then((state) => {
        if (!state) return;
        setReactionCounts(state.counts);
        setReaction(state.selected);
        try {
          localStorage.setItem(`vortex-reaction-counts:${slug}`, JSON.stringify(state.counts));
          if (state.selected) localStorage.setItem(`vortex-reaction:${slug}`, state.selected);
          else localStorage.removeItem(`vortex-reaction:${slug}`);
        } catch { /* shared counts remain saved by Supabase */ }
      })
      .catch((error: unknown) => console.warn('Could not save shared reaction:', error))
      .finally(() => {
        const remainingAnimation = Math.max(0, 400 - (Date.now() - startedAt));
        window.setTimeout(() => {
          setReactionBusy(false);
          setReactionLoadingKey(null);
        }, remainingAnimation);
      });
  };
  const markSourceVisited = (sourceUrl: string) => {
    if (visitedSources.includes(sourceUrl)) return;
    const next = [...visitedSources, sourceUrl];
    setVisitedSources(next);
    try { localStorage.setItem(`vortex-visited-sources:${slug}`, JSON.stringify(next)); } catch { /* keep visited state for this session */ }
  };
  const markAllSourcesRead = () => {
    const sourceUrls = series?.sources.map((source) => source.url).filter(Boolean) ?? [];
    const next = Array.from(new Set([...visitedSources, ...sourceUrls]));
    setVisitedSources(next);
    try { localStorage.setItem(`vortex-visited-sources:${slug}`, JSON.stringify(next)); } catch { /* keep read state for this session */ }
  };
  const toggleSourceReaction = (sourceUrl: string) => {
    if (sourceReactionBusy.includes(sourceUrl)) return;
    const next = sourceReactions.includes(sourceUrl)
      ? sourceReactions.filter((url) => url !== sourceUrl)
      : [...sourceReactions, sourceUrl];
    setSourceReactions(next);
    setSourceReactionCounts((current) => ({
      ...current,
      [sourceUrl]: Math.max(
        0,
        (current[sourceUrl] ?? (sourceReactions.includes(sourceUrl) ? 1 : 0)) +
          (sourceReactions.includes(sourceUrl) ? -1 : 1),
      ),
    }));
    try {
      localStorage.setItem(`vortex-source-reactions:${slug}`, JSON.stringify(next));
    } catch { /* source reaction remains available for this session */ }
    setSourceReactionBusy((current) => [...current, sourceUrl]);
    void toggleSeriesSourceReaction(slug, sourceUrl)
      .then((state) => {
        if (!state) return;
        setSourceReactionCounts(state.counts);
        setSourceReactions(state.selected);
        try { localStorage.setItem(`vortex-source-reactions:${slug}`, JSON.stringify(state.selected)); } catch { /* shared counts remain saved by Supabase */ }
      })
      .catch((error: unknown) => console.warn('Could not save shared source reaction:', error))
      .finally(() => setSourceReactionBusy((current) => current.filter((url) => url !== sourceUrl)));
  };
  const siteHeader = (
    <SiteHeader
      activeSection="series"
      logoSrc="/clydee-logo.png"
      discordSrc={imageUrl(assetList.find((asset) => asset.alt === 'Discord Image Link')?.src || '', 64)}
      mobileMenuOpen={mobileNav}
      onToggleMobileMenu={() => setMobileNav(!mobileNav)}
      dark={dark}
      onToggleTheme={toggleTheme}
      communityHref="/community"
      search={
        <SiteSearch
          items={searchHighlightsQuery.data ?? []}
          trendingItems={searchHighlightsQuery.data ?? []}
          searchFn={searchSeries}
        />
      }
    />
  );
  const siteFooter = (
    <SiteFooter
      className="footer series-footer"
      logoSrc="/clydee-logo.png"
      tagline="Read comics, manga, manhua, and manhwa translated swiftly. Clydee, your ultimate library."
    />
  );

  if (seriesQuery.isLoading) {
    return <div className={`vortex-page series-page ${dark ? 'theme-dark' : 'theme-light'}`}>
      {siteHeader}
      {showDetailSkeleton ? <main className="series-main series-detail-loading" aria-busy="true" aria-label="Loading series details">
        <div className={`series-layout${seriesPageVisibility.similarSeries ? '' : ' series-layout--without-sidebar'}`}>
          <aside className="series-left-rail" aria-hidden="true">
            <div className="series-detail-loading__cover card-shimmer" />
            <div className="series-detail-loading__actions">
              <span className="card-shimmer" />
              <span className="card-shimmer" />
            </div>
            <span className="series-detail-loading__report card-shimmer" />
            <div className="series-detail-loading__stats">
              <span className="card-shimmer" />
              <span className="card-shimmer" />
            </div>
            <div className="series-detail-loading__facts">
              {Array.from({ length: 6 }, (_, index) => <span className="card-shimmer" key={index} />)}
            </div>
          </aside>
          <section className="series-primary" aria-hidden="true">
            <div className="series-detail-loading__eyebrow card-shimmer" />
            <div className="series-detail-loading__title card-shimmer" />
            <div className="series-detail-loading__tabs">
              <span className="card-shimmer" />
              <span className="card-shimmer" />
              <span className="card-shimmer" />
            </div>
            <div className="series-detail-loading__search card-shimmer" />
            <div className="series-detail-loading__mark-read">
              <span className="card-shimmer" />
              <div><span className="card-shimmer" /><span className="card-shimmer" /></div>
            </div>
            <div className="series-detail-loading__chapters">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="series-detail-loading__chapter" key={index}>
                  <span className="card-shimmer" />
                  <div><span className="card-shimmer" /><span className="card-shimmer" /></div>
                </div>
              ))}
            </div>
          </section>
          {seriesPageVisibility.similarSeries && <aside className="series-sidebar" aria-hidden="true">
            <div className="series-detail-loading__related-title card-shimmer" />
            {Array.from({ length: 6 }, (_, index) => (
              <div className="series-detail-loading__related" key={index}>
                <span className="card-shimmer" />
                <div><span className="card-shimmer" /><span className="card-shimmer" /></div>
              </div>
            ))}
          </aside>}
        </div>
      </main> : <main className="series-main series-detail-loading-pending" aria-busy="true"><span className="sr-only">Loading series details</span></main>}
      {seriesPageVisibility.footer && siteFooter}
    </div>;
  }

  if (!series) {
    const failedToLoad = seriesQuery.isError;
    return <div className={`vortex-page series-page ${dark ? 'theme-dark' : 'theme-light'}`}>
      {siteHeader}
      {failedToLoad ? (
        <main className="series-not-found">
          <div className="series-not-found__mark"><Search size={23} /></div>
          <p className="series-eyebrow">CLYDEE / SERIES</p>
          <h1>Series unavailable</h1>
          <p>The series could not be loaded from the catalog. Please try again.</p>
          <button type="button" className="series-action series-action--primary" onClick={() => void seriesQuery.refetch()}>Try again</button>
          <Link href="/" className="series-action series-action--bookmark"><ArrowLeft size={16} /> Back to library</Link>
        </main>
      ) : (
        <SeriesNotFound slug={slug} />
      )}
      {failedToLoad && seriesPageVisibility.reportIssue && <ReportCallout seriesSlug={slug} seriesTitle={slug} />}
      {seriesPageVisibility.footer && siteFooter}
    </div>;
  }

  const title = detail?.title || series.title;
  const synopsis = detail?.synopsis?.trim() || '';
  const hasExpandableSynopsis = synopsis.length > 180;
  const newestChapter = series.chapters[0];
  const latestChapterSourceUrl = series.facts?.latest_source_url?.trim();
  const prioritizedSources = [...series.sources].sort((a, b) => {
    const parseChapter = (value?: string) => {
      const chapter = Number.parseFloat(String(value || '').replace(/^ch(?:apter)?\.?\s*/i, ''));
      return Number.isFinite(chapter) ? chapter : Number.NEGATIVE_INFINITY;
    };
    const chapterDifference = parseChapter(b.latestChapterNumber) - parseChapter(a.latestChapterNumber);
    if (chapterDifference !== 0) return chapterDifference;

    const aTimestamp = releaseTimestamp(a.latestChapterAt);
    const bTimestamp = releaseTimestamp(b.latestChapterAt);
    if (!Number.isNaN(aTimestamp) && !Number.isNaN(bTimestamp) && aTimestamp !== bTimestamp) {
      // Equal chapter counts: older upload first, matching manual-sync results.
      return aTimestamp - bTimestamp;
    }
    if (Number.isNaN(aTimestamp) !== Number.isNaN(bTimestamp)) {
      return Number.isNaN(aTimestamp) ? 1 : -1;
    }

    // Keep the series-wide winning source first when timestamps tie.
    return Number(b.url.trim() === latestChapterSourceUrl) - Number(a.url.trim() === latestChapterSourceUrl);
  });
  const sourceQuery = sourceSearch.trim().toLocaleLowerCase();
  const visibleSources = prioritizedSources
    .filter((source) => {
      if (!sourceQuery) return true;
      const sourceMatches = [source.name, source.latestChapterNumber, source.url]
        .some((value) => value?.toLocaleLowerCase().includes(sourceQuery));
      const chapterMatches = series.chapters.some((chapter) => {
        const sourceMatchesChapter = !chapter.sourceName || chapter.sourceName.toLocaleLowerCase() === source.name.toLocaleLowerCase();
        return sourceMatchesChapter && chapter.title.toLocaleLowerCase().includes(sourceQuery);
      });
      return sourceMatches || chapterMatches;
    })
    .sort((a, b) => {
      const aTime = releaseTimestamp(a.latestChapterAt);
      const bTime = releaseTimestamp(b.latestChapterAt);
      if (Number.isNaN(aTime) || Number.isNaN(bTime) || aTime === bTime) return 0;
      return sourcesNewestFirst ? bTime - aTime : aTime - bTime;
    });
  const allSourcesRead = prioritizedSources.length > 0 && prioritizedSources.every((source) => visitedSources.includes(source.url));
  const winningChapterSource = getWinningChapterSource(prioritizedSources, latestChapterSourceUrl);
  const winningSourceUrl = winningChapterSource?.url?.trim() || latestChapterSourceUrl;

  // Robust chapter parser
  const parseChapterNum = (value?: string): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const cleaned = String(value).trim().replace(/^ch(?:apter)?\.?\s*/i, '').replace(/^ep(?:isode)?\.?\s*/i, '');
    const num = Number.parseFloat(cleaned);
    if (Number.isFinite(num)) return num;
    const match = String(value).match(/(\d+(?:\.\d+)?)/);
    return match ? Number.parseFloat(match[1]) : Number.NEGATIVE_INFINITY;
  };

  // Early Bird: the source that was first/earliest to release the highest chapter across sources.
  // Requires at least 2 sources on the series to be meaningful.
  const topChapterNumber = winningChapterSource?.latestChapterNumber;
  const topChapterNum = parseChapterNum(topChapterNumber);
  const topChapterSources = Number.isFinite(topChapterNum)
    ? prioritizedSources.filter((s) => parseChapterNum(s.latestChapterNumber) === topChapterNum)
    : [];

  const earlyBirdSource =
    topChapterSources.length > 0 && prioritizedSources.length >= 2
      ? topChapterSources.reduce((earliest, s) => {
          const t = releaseTimestamp(s.latestChapterAt);
          const tEarliest = releaseTimestamp(earliest.latestChapterAt);
          if (Number.isNaN(t)) return earliest;
          if (Number.isNaN(tEarliest)) return s;
          // Smaller timestamp = released earlier in time = Early Bird
          return t < tEarliest ? s : earliest;
        })
      : null;
  const earlyBirdSourceUrl = earlyBirdSource?.url?.trim() || null;

  // Official source: known official/publisher domains.
  const OFFICIAL_DOMAINS = [
    'webtoons.com', 'tapas.io', 'tappytoon.com', 'lehzin.com',
    'mangaplus.shueisha.co.jp', 'pocket.shonenmagazine.com',
    'comic-action.com', 'comic-days.com', 'comic-gardo.com',
    'tonarinoyj.jp', 'sunday-webry.com', 'shonenjumpplus.com',
    'comico.jp', 'zebrack-comic.com', 'urasunday.com',
    'k-manga.jp', 'piccoma.com', 'corocoro.tv',
    'viz.com', 'crunchyroll.com', 'funimation.com',
    'yen.press', 'sevenseasentertainment.com',
    'global.webtoons.com', 'canvas.webtoons.com',
  ];
  const isOfficialSource = (url: string) => {
    try {
      const host = new URL(url.trim()).hostname.replace(/^www\./, '');
      return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  };

  // Behind: how many chapters behind the leading source number a source is (using topChapterNum above).

  // Full Series: source has chapters covering Ch.1 through top chapter with ≥90% coverage.
  // We use series.chapters grouped by sourceName for the count.
  const chaptersBySource = new Map<string, Set<number>>();
  for (const ch of series.chapters) {
    if (!ch.sourceName) continue;
    const key = ch.sourceName.trim().toLowerCase();
    if (!chaptersBySource.has(key)) chaptersBySource.set(key, new Set());
    const num = parseChapterNum(ch.title);
    if (Number.isFinite(num) && num > 0) chaptersBySource.get(key)!.add(Math.round(num));
  }
  const isFullSeriesSource = (source: { name: string; latestChapterNumber?: string }) => {
    if (!Number.isFinite(topChapterNum) || topChapterNum < 2) return false;
    const sourceNum = parseChapterNum(source.latestChapterNumber);
    if (!Number.isFinite(sourceNum) || sourceNum < topChapterNum) return false;
    const key = source.name.trim().toLowerCase();
    const chNums = chaptersBySource.get(key);
    if (!chNums || chNums.size < 2) return false;
    // Check coverage: at least 90% of chapters 1..topChapterNum are present.
    let covered = 0;
    for (let i = 1; i <= Math.round(topChapterNum); i++) {
      if (chNums.has(i)) covered++;
    }
    return covered / Math.round(topChapterNum) >= 0.9;
  };

  const firstSource = prioritizedSources.find((source) => source.url.trim());
  const readChapterSource = earlyBirdSource?.url?.trim()
    ? earlyBirdSource
    : winningChapterSource?.url?.trim()
    ? winningChapterSource
    : firstSource;
  const readChapterHref = readChapterSource
    ? formatScanlatorSeriesUrl(readChapterSource.name, readChapterSource.url, series.title)
    : newestChapter?.href;
  const chapterLabel = (earlyBirdSource || winningChapterSource)?.latestChapterNumber
    ? `Chapter ${(earlyBirdSource || winningChapterSource)!.latestChapterNumber!.replace(/^ch(?:apter)?\.?\s*/i, '')}`
    : newestChapter
    ? newestChapter.title
    : (series.facts?.latest_chapter_number ? `Chapter ${series.facts.latest_chapter_number}` : String(series.chapters.length));

  const latestSeriesUpdate = getLatestSeriesUpdate(series);
  const factEntries: [string, string][] = [
    ['Status', series.status || detail?.facts?.status || ''],
    ['Type', series.category || detail?.facts?.type || ''],
    ['Author', detail?.author || ''],
    ['Artist', detail?.artist || ''],
    ['Released', detail?.facts?.released || (series.year ? String(series.year) : '')],
    ['Chapters', chapterLabel],
    ['Last update', latestSeriesUpdate],
  ];

  const facts = factEntries.filter(([, value]) => {
    const normalizedValue = value.trim().toLowerCase();
    return normalizedValue !== '' && normalizedValue !== 'not provided';
  });
  const reactions = [
    { key: 'like' as const, label: 'Like', icon: likeReactionIcon, count: reactionCounts?.like },
    { key: 'love' as const, label: 'Love', icon: loveReactionIcon, count: reactionCounts?.love },
    { key: 'happy' as const, label: 'Laugh', icon: laughReactionIcon, count: reactionCounts?.happy },
    { key: 'wow' as const, label: 'Wow', icon: wowReactionIcon, count: reactionCounts?.wow },
    { key: 'sad' as const, label: 'Sad', icon: cryReactionIcon, count: reactionCounts?.sad },
    { key: 'angry' as const, label: 'Angry', icon: angryReactionIcon, count: reactionCounts?.angry },
  ];
  const visibleInfoTabs: ('sources' | 'synopsis' | 'reviews')[] = [];
  if (seriesPageVisibility.sources) visibleInfoTabs.push('sources');
  if (seriesPageVisibility.synopsis) visibleInfoTabs.push('synopsis');
  if (seriesPageVisibility.reviews) visibleInfoTabs.push('reviews');
  const visibleActiveTab = visibleInfoTabs.includes(activeTab) ? activeTab : visibleInfoTabs[0];

  return <div className={`vortex-page series-page ${dark ? 'theme-dark' : 'theme-light'}`} onErrorCapture={recoverSeriesImage}>
    {siteHeader}
    {series.cover && <div className="series-wash" aria-hidden="true">
      <img src={imageUrl(series.cover, 700)} alt="" decoding="async" />
    </div>}
    <main className="series-main">
      <div className="series-breadcrumb"><Link href="/">Home</Link><ChevronRight size={13} /><span>Series</span><ChevronRight size={13} /><span>{title}</span></div>
      <div
        ref={seriesLayoutRef}
        className={`series-layout${fixedRailPositions ? ' series-layout--rails-fixed' : ''}${seriesPageVisibility.similarSeries ? '' : ' series-layout--without-sidebar'}`}
      >
        <aside className="series-left-rail" style={fixedRailPositions?.left}>
          {series.cover ? <button
            type="button"
            ref={coverButtonRef}
            className="series-cover-frame"
            onClick={() => setCoverOpen(true)}
            aria-haspopup="dialog"
            aria-label={`View full-size cover of ${title}`}
            title="View full-size cover"
          >
            <img src={imageUrl(series.cover, 700)} alt={`Cover of ${title}`} />
            {series.category && <span className="series-cover-ribbon">{series.category}</span>}
            <span className="series-cover-view-overlay" aria-hidden="true">
              <span className="series-cover-expand"><Maximize2 size={20} /></span>
              <span className="series-cover-view-label"><ZoomIn size={13} /> View</span>
            </span>
          </button> : <div className="series-cover-frame is-pending">
            <img src={DEFAULT_SERIES_COVER} alt={`No cover available for ${title}`} />
          </div>}
          <div className="series-left-actions">
            {readChapterHref && chapterLabel ? <a href={readChapterHref} className="series-action series-action--primary" target={readChapterSource ? '_blank' : undefined} rel={readChapterSource ? 'noopener noreferrer' : undefined}><span>Read {chapterLabel}</span></a> : <button className="series-action series-action--primary" disabled title="No chapter link is available yet">Reading unavailable</button>}
            <div className="series-bookmark-wrapper" ref={bookmarkDropdownRef}>
              <button
                className={`series-action series-action--bookmark${bookmarked ? ' is-saved' : ''}`}
                onClick={handleBookmarkButtonClick}
                aria-pressed={bookmarked}
                disabled={bookmarkBusy}
                data-testid="button-bookmark-series"
              >
                {bookmarked ? <Check size={15} /> : <Bookmark size={15} />}
                {bookmarked
                  ? (currentBookmarkType ? (BOOKMARK_OPTIONS.find((o) => o.id === currentBookmarkType)?.buttonLabel ?? 'Bookmarked') : 'Bookmarked')
                  : 'Bookmark'}
              </button>
              {bookmarkDropdownOpen && (
                <div className="series-bookmark-dropdown" role="menu">
                  {BOOKMARK_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`series-bookmark-option${currentBookmarkType === option.id ? ' is-active' : ''}`}
                      role="menuitem"
                      onClick={() => void selectBookmarkType(option.id)}
                    >
                      {option.label}
                      {currentBookmarkType === option.id && <Check size={13} />}
                    </button>
                  ))}
                  {bookmarked && (
                    <button
                      type="button"
                      className="series-bookmark-option series-bookmark-option--remove"
                      role="menuitem"
                      onClick={() => void selectBookmarkType('remove')}
                    >
                      <Trash2 size={13} />
                      Remove Bookmark
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {seriesPageVisibility.reportIssue && <ReportCallout seriesSlug={slug} seriesTitle={title} />}
          {seriesPageVisibility.ratingStats && <div className="series-quick-stats">
            <div><Star size={15} fill="currentColor" /><strong>{detail?.rating ?? series.rating ?? '—'}</strong><small>Ratings</small></div>
            <div><Bookmark size={15} fill="currentColor" /><strong>{formatFavoriteCount(favoriteCount)}</strong><small>Favorites</small></div>
          </div>}
          {seriesPageVisibility.seriesFacts && <section className="series-facts-panel" aria-label="Series information">
            <div className="series-facts-grid">{facts.map(([label, value]) => {
              const FactIcon = label === 'Status' ? Activity : label === 'Type' ? Type : label === 'Author' || label === 'Artist' ? PenLine : label === 'Chapters' ? BookOpen : CalendarDays;

              return (
                <div key={label} style={{ display: 'contents' }}>
                  <div className="series-fact">
                    <span className="series-fact-label"><FactIcon aria-hidden="true" />{label}</span>
                    {label === 'Chapters' && newestChapter ? (
                      <strong data-fact={label}>
                        <a className="series-chapter-fact-link" href={newestChapter.href} title={`Read ${newestChapter.title}`}>
                          {value}
                        </a>
                      </strong>
                    ) : (
                      <strong className={value === 'Not provided' ? 'is-missing' : ''} data-fact={label}>
                        {label === 'Status' && value !== 'Not provided' && <i className={`series-status-indicator status-`} data-status={value.trim().toLowerCase()} aria-hidden="true" />}
                        {value}
                      </strong>
                    )}
                  </div>
                </div>
              );
            })}</div>
          </section>}
        </aside>

        <div className="series-primary">
          <section className="series-overview series-overview--main">
            {alternateTitleText && <div className={`series-alias-wrap${alternateTitlesExpanded ? ' is-expanded' : ''}`}>
              <p ref={alternateTitlesRef} className="series-alias" aria-label="Alternate series titles">{alternateTitleText}</p>
              {alternateTitlesOverflow && <button type="button" className="series-alias-toggle" onClick={() => setAlternateTitlesExpanded((expanded) => !expanded)} aria-label={alternateTitlesExpanded ? 'Show less alternate titles' : 'Show more alternate titles'} aria-expanded={alternateTitlesExpanded}>
                <ChevronDown className={alternateTitlesExpanded ? 'is-expanded' : ''} size={18} aria-hidden="true" />
              </button>}
            </div>}
            <h1>{title}</h1>
          </section>

          {visibleInfoTabs.length > 0 && <section className="series-chapters" id="sources">
            <div className="series-info-tabs" role="tablist" aria-label="Series information">
              {seriesPageVisibility.sources && <button type="button" role="tab" aria-selected={visibleActiveTab === 'sources'} className={visibleActiveTab === 'sources' ? 'is-active' : ''} onClick={() => setActiveTab('sources')}><Rows3 size={14} aria-hidden="true" /> Sources ({series.sources.length})</button>}
              {seriesPageVisibility.synopsis && <button type="button" role="tab" aria-selected={visibleActiveTab === 'synopsis'} className={visibleActiveTab === 'synopsis' ? 'is-active' : ''} onClick={() => setActiveTab('synopsis')}><List size={14} aria-hidden="true" /> Synopsis</button>}
              {seriesPageVisibility.reviews && <button type="button" role="tab" aria-selected={visibleActiveTab === 'reviews'} className={visibleActiveTab === 'reviews' ? 'is-active' : ''} onClick={() => setActiveTab('reviews')}><MessageSquareText size={14} aria-hidden="true" /> Reviews{detail?.reviewCount !== undefined ? ` (${detail.reviewCount})` : ''}</button>}
            </div>
            {visibleActiveTab === 'sources' ? <>
              <div className="series-source-tools">
                <div className="series-source-tools__top">
                  <label className="series-source-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      value={sourceSearch}
                      onChange={(event) => setSourceSearch(event.target.value)}
                      placeholder="Search by chapter number or title..."
                      aria-label="Search sources by chapter number or title"
                    />
                  </label>
                  <button
                    type="button"
                    className="series-source-sort"
                    onClick={() => setSourcesNewestFirst((newest) => !newest)}
                    aria-label={`Sort sources ${sourcesNewestFirst ? 'oldest' : 'newest'} first`}
                  ><ArrowDownUp size={15} aria-hidden="true" />{sourcesNewestFirst ? 'Newest' : 'Oldest'}</button>
                </div>
                <button
                  type="button"
                  className={`series-mark-all-read${allSourcesRead ? ' is-complete' : ''}`}
                  onClick={markAllSourcesRead}
                  disabled={!prioritizedSources.length || allSourcesRead}
                  aria-pressed={allSourcesRead}
                >
                  <span className="series-mark-all-read__icon"><CheckCircle2 size={21} aria-hidden="true" /></span>
                  <span className="series-mark-all-read__copy"><strong>{allSourcesRead ? 'All Chapters Read' : 'Mark All as Read'}</strong><small>{allSourcesRead ? 'All chapters are marked as read' : 'Mark all chapters as read'}</small></span>
                </button>
              </div>
              {prioritizedSources.length ? visibleSources.length ? <div className="series-source-list">{visibleSources.map((source, index) => {
                const getSourceFavicon = (url?: string) => {
                  if (!url) return '';
                  try {
                    const parsed = new URL(url);
                    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
                  } catch {
                    return '';
                  }
                };
                const logoUrl = source.logo || getSourceFavicon(source.url);
                const targetUrl = formatScanlatorSeriesUrl(source.name, source.url, series.title);
                const isTopSource = Boolean(winningSourceUrl && source.url.trim() === winningSourceUrl);
                const isEarlyBird = Boolean(earlyBirdSourceUrl && source.url.trim() === earlyBirdSourceUrl);
                const isOfficial = isOfficialSource(source.url);
                const isFullSeries = isFullSeriesSource(source);
                const sourceChapterNum = parseChapterNum(source.latestChapterNumber);
                const chapsBehind =
                  Number.isFinite(topChapterNum) && Number.isFinite(sourceChapterNum) && !isTopSource
                    ? Math.round(topChapterNum - sourceChapterNum)
                    : 0;
                const sourceReleaseTimestamp = source.latestChapterAt ? releaseTimestamp(source.latestChapterAt) : NaN;
                const sourceReleaseTime = !Number.isNaN(sourceReleaseTimestamp)
                  ? formatRelativeTime(sourceReleaseTimestamp, source.name)
                  : '';

                const isVisited = visitedSources.includes(source.url);
                return (
                  <div
                    className={`series-source-row${isTopSource ? ' is-priority' : ''}${isVisited ? ' is-visited' : ''}`}
                    key={`${source.name}-${source.url}`}
                    onClickCapture={(event) => {
                      if ((event.target as HTMLElement).closest('.series-source-reaction')) return;
                      markSourceVisited(source.url);
                    }}
                  >
                    <a className="series-source-main" href={targetUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-source-${index}`}>
                      <span className={`series-source-logo${isTopSource ? ' is-top-source' : ''}`}>
                        {logoUrl ? (
                          <img
                            src={imageUrl(logoUrl, 96)}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                              const parent = e.currentTarget.parentElement;
                              if (parent && !parent.querySelector('.series-source-logo-initial')) {
                                const span = document.createElement('span');
                                span.className = 'series-source-logo-initial';
                                span.textContent = source.name.trim().charAt(0).toUpperCase();
                                parent.appendChild(span);
                              }
                            }}
                          />
                        ) : (
                          <span className="series-source-logo-initial" aria-hidden="true">
                            {source.name.trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                        {isTopSource && <img className="series-source-helmet" src="/trick_pumpkin.webp" alt="" aria-hidden="true" loading="lazy" />}
                      </span>
                      <span className="series-source-copy">
                        <span className="series-source-heading">
                          <strong className="series-source-name">{source.name}</strong>
                          {isTopSource && <span className="series-source-priority">Latest chapter</span>}
                          {isEarlyBird && (
                            <span className="series-source-early-bird" title="First to release this chapter">⚡ Early Bird</span>
                          )}
                          {isOfficial && (
                            <span className="series-source-official" title="Official publisher source">👑 Official</span>
                          )}
                          {isFullSeries && (
                            <span className="series-source-full-series" title="Has full chapter library from Ch.1">📦 Full Series</span>
                          )}
                          {chapsBehind > 0 && (
                            <span className="series-source-behind" title={`${chapsBehind} chapter${chapsBehind > 1 ? 's' : ''} behind the leading source`}>🐢 {chapsBehind} ch behind</span>
                          )}
                          {isVisited && <span className="series-source-visited" title="You’ve visited this source" aria-label="Visited"><Eye size={13} aria-hidden="true" /></span>}
                        </span>
                        <span className="series-source-meta">
                          
                          {source.latestChapterNumber && <span className="series-source-chapter"><BookOpen size={11} aria-hidden="true" />Chapter {source.latestChapterNumber}</span>}
                          {sourceReleaseTime ? (
                            <span className="series-source-time" title={`Chapter ${source.latestChapterNumber || ''} release time`}><Clock3 size={12} aria-hidden="true" />{sourceReleaseTime}</span>
                          ) : latestSeriesUpdate && latestSeriesUpdate.toLowerCase() !== 'new' && latestSeriesUpdate.toLowerCase() !== 'time unavailable' ? (
                            <span className="series-source-time" title="Series last update"><Clock3 size={12} aria-hidden="true" />Series updated {latestSeriesUpdate}</span>
                          ) : null}
                        </span>
                      </span>
                    </a>
                    <button
                      type="button"
                      className={`series-source-reaction${sourceReactions.includes(source.url) ? ' is-selected' : ''}`}
                      aria-label={`${sourceReactions.includes(source.url) ? 'Remove reaction from' : 'React to'} ${source.name}`}
                      aria-pressed={sourceReactions.includes(source.url)}
                      title="React anonymously; counts are shared with everyone"
                      disabled={sourceReactionBusy.includes(source.url)}
                      onClick={() => toggleSourceReaction(source.url)}
                      data-testid={`button-source-reaction-${index}`}
                    >
                      <Heart size={16} fill={sourceReactions.includes(source.url) ? 'currentColor' : 'none'} aria-hidden="true" />
                      <span>{sourceReactionCounts[source.url] ?? (sourceReactions.includes(source.url) ? 1 : 0)}</span>
                    </button>
                  </div>
                );
              })}</div> : <div className="series-empty">No sources match your search.</div> : <div className="series-empty">No translation sources have been added for this series yet.</div>}
            </> : visibleActiveTab === 'synopsis' ? <div className={`series-synopsis-panel${synopsis ? ' has-content' : ''}`}>
              <h2>Summary</h2>
              <p className={`series-synopsis-copy${hasExpandableSynopsis && !synopsisExpanded ? ' is-collapsed' : ''}`}>
                {synopsis || <span className="series-missing">Synopsis has not been added yet.</span>}
              </p>
              {hasExpandableSynopsis && <button
                type="button"
                className="series-synopsis-toggle"
                onClick={() => setSynopsisExpanded((expanded) => !expanded)}
                aria-expanded={synopsisExpanded}
              >
                {synopsisExpanded ? 'Show less' : 'Show more'}
                <ChevronDown className={synopsisExpanded ? 'is-expanded' : ''} size={18} aria-hidden="true" />
              </button>}
              {detail?.genres?.length ? <div className="series-synopsis-genres" aria-label="Genres">
                {detail.genres.map((genre) => <span key={genre}>{genre}</span>)}
              </div> : null}
            </div> : <div className="series-reviews-empty"><Star size={18} /><strong>Reviews</strong><p>Sign in to share your review of this series.</p></div>}
          </section>}
          {(seriesPageVisibility.shareCard || seriesPageVisibility.discordCard) && <div className={`series-social-strip${seriesPageVisibility.shareCard !== seriesPageVisibility.discordCard ? ' series-social-strip--single' : ''}`}>
            {seriesPageVisibility.shareCard && <div className="series-social-card">
              <div className="series-social-copy"><div><span>Share Clydee</span><small>to your friends</small></div></div>
              <button type="button" onClick={share}><Share2 size={13} />Share</button>
            </div>}
            {seriesPageVisibility.discordCard && <div className="series-social-card series-social-card--join">
              <div className="series-social-copy"><div><span>Join Our Socials</span></div></div>
              <a className="series-discord series-facebook" href={siteSettings?.facebookUrl || 'https://facebook.com'} target="_blank" rel="noreferrer" title="Facebook">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Facebook
              </a>
            </div>}
          </div>}
          {seriesPageVisibility.reactions && <section className="series-reactions">
            <div className="series-reaction-list">{reactions.map((item) => {
              const selected = reaction === item.key;
              const loading = reactionLoadingKey === item.key;
              return <button key={item.key} onClick={() => chooseReaction(item.key)} className={`series-reaction ${selected ? 'is-selected' : ''}`} aria-pressed={selected} aria-busy={loading} aria-label={`${item.label}${selected ? ' (You)' : ''}: ${item.count ?? 0}`} disabled={reactionBusy} data-testid={`button-reaction-${item.key}`}>
                <span className={`series-reaction-icon reaction-${item.key}${loading ? ' is-loading' : ''}`}><img src={item.icon} alt="" aria-hidden="true" draggable={false} /></span>
                <strong>{item.count ?? 0}</strong>
                <small>{item.label}{selected ? ' (You)' : ''}</small>
              </button>;
            })}</div>
            <p className="series-local-reaction-note" role="note">No account needed. Your reactions are saved anonymously and counts are shared.</p>
          </section>}
          {seriesPageVisibility.discussion && <section className="series-discussion" aria-label="Discussion">
            <div className="series-discussion-head"><h2><MessageSquare size={14} /> Discussion</h2><span>3</span></div>
            <div className="series-discussion-panel"><strong>Join the discussion</strong><span>Sign in to share your thoughts and react to comments.</span></div>
          </section>}
        </div>

        {seriesPageVisibility.similarSeries && <aside className={`series-sidebar${relatedQuery.isLoading ? ' is-loading' : ''}`} style={fixedRailPositions?.right}>
          <div className="series-sidebar-head"><h2>Similar series</h2></div>
          {relatedQuery.isLoading ? <div className="series-related-list" role="status" aria-label="Loading similar series">
            {Array.from({ length: 7 }, (_, index) => <div className="series-detail-loading__related" key={index} aria-hidden="true">
              <span className="card-shimmer" />
              <div><span className="card-shimmer" /><span className="card-shimmer" /></div>
            </div>)}
          </div> : related.length > 0 ? <div className="series-related-list">{related.map((item) => <Link href={item.href} className="series-related" key={item.href} data-testid={`link-related-${item.href.split('/').pop()}`} data-recommendation-item="true">
            <span className="series-related-cover"><img src={imageUrl(item.cover, 120)} alt={item.title} width={56} height={75} loading="lazy" /></span>
            <span className="series-related-copy">
              <strong>{item.title}</strong>
              <small className="series-related-meta">
                <span className="series-related-rating"><span className="series-related-star" aria-hidden="true">★</span>{item.rating ?? '—'}</span>
                <span>{item.chapterCount ?? '—'} ch</span>
              </small>
            </span>
          </Link>)}</div> : relatedQuery.isError ? <div className="series-empty" role="alert">Could not load similar series. <button type="button" onClick={() => void relatedQuery.refetch()}>Retry</button></div>
            : relatedQuery.fetchStatus === 'paused' ? <div className="series-empty" role="status">Waiting for a network connection…</div>
              : relatedQuery.isSuccess ? <div className="series-empty">No similar series found.</div>
                : <div className="series-empty" role="alert">Similar series haven’t loaded. <button type="button" onClick={() => void relatedQuery.refetch()}>Retry</button></div>}
        </aside>}
      </div>
    </main>
    {coverOpen && series.cover && <div
      className="series-cover-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Full-size cover of ${title}`}
      onClick={() => setCoverOpen(false)}
      tabIndex={-1}
    >
      <span className="series-cover-lightbox-title">{title}</span>
      <button
        ref={closeCoverRef}
        type="button"
        className="series-cover-lightbox-close"
        onClick={() => setCoverOpen(false)}
        aria-label="Close full-size cover"
      ><X size={18} /></button>
      <img
        className="series-cover-lightbox-image"
        src={imageUrl(series.cover, 1800)}
        alt={`Full-size cover of ${title}`}
        onClick={(event) => event.stopPropagation()}
      />
      <span className="series-cover-lightbox-hint">Click anywhere or press Esc to close</span>
    </div>}
    {seriesPageVisibility.footer && siteFooter}
    <Shareable open={shareModalOpen} onOpenChange={setShareModalOpen} />
  </div>;
}

function ReportCallout({ seriesSlug, seriesTitle }: { seriesSlug: string; seriesTitle: string }) {
  const [reportModalOpen, setReportModalOpen] = useState(false);

  return <section className="series-report">
    <div className="series-report-icon"><TriangleAlert size={18} /></div>
    <div className="series-report-copy"><strong>Need help or found an issue?</strong><span>Report bugs, payment issues, or other problems · Get rewards</span></div>
    <button type="button" className="series-report-button" onClick={() => setReportModalOpen(true)}><Flag size={13} /> Report Issue</button>
    <SeriesReportIssue open={reportModalOpen} onOpenChange={setReportModalOpen} seriesSlug={seriesSlug} seriesTitle={seriesTitle} />
  </section>;
}
