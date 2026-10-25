import { useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Activity, ArrowLeft, ArrowUpRight, BookOpen, Bookmark, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Eye, Flag, Heart, Info, List, Maximize2, MessageSquare, MessageSquareText, PenLine, Rows3, Search, Share2, Square, Star, TriangleAlert, Type, X, ZoomIn } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  cacheSeriesCatalog,
  incrementSeriesViews,
  SERIES_CATALOG_QUERY_KEY,
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
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { useThemeMode } from '../hooks/useThemeMode';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { DEFAULT_SERIES_PAGE_VISIBILITY, getCachedSiteSettings, getSiteSettings } from '../lib/siteSettings';
import { formatScanlatorSeriesUrl } from '../lib/scanlatorLinks';
import { getWinningChapterSource } from '../lib/sourcePriority';
import { recordRecentlyViewedSeries } from '../lib/recentlyViewedSeries';
import {
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

function getDisplayedChapterCount(item: SeriesRecord): number {
  const latestChapter = getWinningChapterSource(item.sources, item.facts?.latest_source_url || undefined)?.latestChapterNumber
    || item.chapters[0]?.title
    || item.facts?.latest_chapter_number
    || item.facts?.last_chapter_number;
  const parsedChapter = Number.parseFloat(String(latestChapter || '').replace(/^ch(?:apter)?\.?\s*/i, ''));
  return Number.isFinite(parsedChapter) ? parsedChapter : item.chapters.length;
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
  if (image.dataset.fallbackAttempted) {
    image.hidden = true;
    image.closest('.series-cover-frame')?.classList.add('is-image-failed');
    if (image.parentElement?.classList.contains('brand')) {
      image.parentElement.classList.add('brand-fallback');
    }
    if (image.parentElement?.classList.contains('footer-logo-link')) {
      image.parentElement.classList.add('series-footer-logo-fallback');
    }
    return;
  }

  const failedUrl = image.currentSrc || image.src;
  image.dataset.fallbackAttempted = 'true';
  image.removeAttribute('srcset');
  let fallback = '';
  if (failedUrl.startsWith('https://i0.wp.com/')) {
    fallback = `https://${failedUrl.slice('https://i0.wp.com/'.length).split('?')[0]}`;
  } else if (failedUrl.startsWith('https://storage.vortexscans.org/')) {
    const path = failedUrl.slice('https://'.length).split('?')[0];
    fallback = `https://i0.wp.com/${path}?w=400&quality=85&strip=all&ssl=1`;
  }
  if (fallback) image.src = fallback;
  else image.hidden = true;
}

function readSet(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function formatRelativeTime(timestamp: number): string {
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

const VIEW_COOLDOWN_MS = 15 * 60 * 1000; // 15-minute cooldown per series (standard for scanlation sites like Asura)

export default function SeriesDetailPage() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const slug = decodeURIComponent(params.slug || '').replace(/\/$/, '');
  const queryClient = useQueryClient();
  const catalogQuery = useSeriesCatalog();
  const seriesQuery = catalogQuery;
  const series: SeriesRecord | undefined = catalogQuery.items.find(
    (item) => item.slug.toLocaleLowerCase() === slug.toLocaleLowerCase(),
  );
  const detail = series;
  const alternateTitleText = detail?.alternateTitles?.join(' / ') ?? '';
  const searchItems = useMemo(() => toSiteSearchItems(catalogQuery.items), [catalogQuery.items]);
  const trendingSearchItems = useMemo(() => toTrendingSiteSearchItems(catalogQuery.items), [catalogQuery.items]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
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
  const [sourceReactionBusy, setSourceReactionBusy] = useState<string[]>([]);
  const [seriesPageVisibility, setSeriesPageVisibility] = useState(
    () => getCachedSiteSettings()?.seriesPage ?? DEFAULT_SERIES_PAGE_VISIBILITY,
  );
  const [sourceReactions, setSourceReactions] = useState<string[]>([]);
  const [visitedSources, setVisitedSources] = useState<string[]>([]);
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
        if (active) setSeriesPageVisibility(settings.seriesPage);
      })
      .catch(() => {
        // Keep the last cached or default visibility when the settings service is unavailable.
      });

    return () => {
      active = false;
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
    setActiveTab('sources');
    setSynopsisExpanded(false);
    setAlternateTitlesExpanded(false);
    setReactionCounts(readReactionCounts(slug));
    if (series) {
      try {
        const savedReaction = localStorage.getItem(`vortex-reaction:${slug}`);
        setReaction(isReactionKey(savedReaction) ? savedReaction : null);
      } catch {
        setReaction(null);
      }

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
          const updateCachedViews = (views: number) => {
            queryClient.setQueryData<SeriesCatalogResponse>(SERIES_CATALOG_QUERY_KEY, (old) => {
              if (!old) return old;
              const nextResponse = {
                ...old,
                items: old.items.map((item) =>
                  item.id === series.id ? { ...item, views } : item,
                ),
              };
              cacheSeriesCatalog(nextResponse);
              return nextResponse;
            });
          };

          // Update the visible count immediately; reconcile it with the server response afterward.
          void queryClient.cancelQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
          updateCachedViews((series.views ?? 0) + 1);
          void incrementSeriesViews(series.id).then((newViews) => {
            if (typeof newViews === 'number') {
              updateCachedViews(newViews);
            } else {
              void queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
            }
          });
        }
      } catch {
        // Continue if localStorage is unavailable
      }
    }
  }, [slug, series, queryClient]);

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
  }, [slug, series, seriesPageVisibility.similarSeries, catalogQuery.items]);

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

  const bookmarked = !!series && bookmarks.includes(series.href);
  const related = useMemo(() => {
    return catalogQuery.items
      .filter((item) => item.slug !== slug)
      .sort((left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        Number(right.rating ?? 0) - Number(left.rating ?? 0),
      )
      .slice(0, 7)
      .map((item) => ({
        title: item.title,
        href: item.href,
        cover: item.cover,
        rating: item.rating,
        chapterCount: getDisplayedChapterCount(item),
      }));
  }, [catalogQuery.items, slug]);

  const toggleBookmark = () => {
    if (!series) return;
    const next = bookmarked ? bookmarks.filter((href) => href !== series.href) : [...bookmarks, series.href];
    setBookmarks(next);
    try { localStorage.setItem('vortex-series-bookmarks', JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  };
  const share = () => setShareModalOpen(true);
  const chooseReaction = (key: ReactionKey) => {
    if (reactionBusy) return;
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
      .finally(() => setReactionBusy(false));
  };
  const markSourceVisited = (sourceUrl: string) => {
    if (visitedSources.includes(sourceUrl)) return;
    const next = [...visitedSources, sourceUrl];
    setVisitedSources(next);
    try { localStorage.setItem(`vortex-visited-sources:${slug}`, JSON.stringify(next)); } catch { /* keep visited state for this session */ }
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
          items={searchItems}
          trendingItems={trendingSearchItems}
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
      <main className="series-not-found"><div className="series-data-status" role="status"><p>Loading series from the catalog…</p></div></main>
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

    const aTimestamp = a.latestChapterAt ? Date.parse(a.latestChapterAt) : Number.NaN;
    const bTimestamp = b.latestChapterAt ? Date.parse(b.latestChapterAt) : Number.NaN;
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
  const winningChapterSource = getWinningChapterSource(prioritizedSources, latestChapterSourceUrl);
  const winningSourceUrl = winningChapterSource?.url?.trim() || latestChapterSourceUrl;
  const firstSource = prioritizedSources.find((source) => source.url.trim());
  const readChapterHref = firstSource
    ? formatScanlatorSeriesUrl(firstSource.name, firstSource.url, series.title)
    : newestChapter?.href;
  const chapterLabel = winningChapterSource?.latestChapterNumber
    ? `Chapter ${winningChapterSource.latestChapterNumber.replace(/^ch(?:apter)?\.?\s*/i, '')}`
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
            <div className="series-cover-pending"><Info size={23} /><strong>Cover pending</strong><span>Artwork will appear here when uploaded.</span></div>
          </div>}
          <div className="series-left-actions">
            {newestChapter && readChapterHref ? <a href={readChapterHref} className="series-action series-action--primary" target={firstSource ? '_blank' : undefined} rel={firstSource ? 'noopener noreferrer' : undefined}><span>Read {newestChapter.title}</span></a> : <button className="series-action series-action--primary" disabled title="No chapter link is available yet">Reading unavailable</button>}
            <button className={`series-action series-action--bookmark${bookmarked ? ' is-saved' : ''}`} onClick={toggleBookmark} aria-pressed={bookmarked} data-testid="button-bookmark-series">{bookmarked ? <Check size={15} /> : <Bookmark size={15} />}{bookmarked ? 'Bookmarked' : 'Bookmark'}</button>
          </div>
          {seriesPageVisibility.reportIssue && <ReportCallout seriesSlug={slug} seriesTitle={title} />}
          {seriesPageVisibility.ratingStats && <div className="series-quick-stats">
            <div><Star size={15} fill="currentColor" /><strong>{detail?.rating ?? series.rating ?? '—'}</strong><small>Ratings</small></div>
            <div><Bookmark size={15} fill="currentColor" /><strong>{detail?.favorites ?? '—'}</strong><small>Favorites</small></div>
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
                        {label === 'Status' && value !== 'Not provided' && <i className="series-status-indicator" aria-hidden="true" />}
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
              {prioritizedSources.length ? <div className="series-source-list">{prioritizedSources.map((source, index) => {
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
                const sourceReleaseTimestamp = source.latestChapterAt ? Date.parse(source.latestChapterAt) : NaN;
                const sourceReleaseTime = !Number.isNaN(sourceReleaseTimestamp)
                  ? formatRelativeTime(sourceReleaseTimestamp)
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
                      <span className="series-source-logo">
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
                      </span>
                      <span className="series-source-copy">
                        <span className="series-source-heading">
                          <strong className="series-source-name">{source.name}</strong>
                          {isTopSource && <span className="series-source-priority">Most chapters</span>}
                          {isVisited && <span className="series-source-visited" title="You’ve visited this source" aria-label="Visited"><Eye size={13} aria-hidden="true" /></span>}
                        </span>
                        <span className="series-source-meta">
                          {source.rating && <span className="series-source-rating" title={`Source rating: ${source.rating}`}><Star size={11} fill="currentColor" />{source.rating}</span>}
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
              })}</div> : <div className="series-empty">No translation sources have been added for this series yet.</div>}
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
              <a className="series-discord" href="https://discord.gg/2PuMt62fRN" target="_blank" rel="noreferrer" title="Discord">
                <img src={imageUrl(assetList.find((asset) => asset.alt === 'Discord Image Link')?.src || '', 32)} alt="" />
                Discord
              </a>
            </div>}
          </div>}
          {seriesPageVisibility.reactions && <section className="series-reactions">
            <div className="series-reaction-list">{reactions.map((item) => {
              const selected = reaction === item.key;
              return <button key={item.key} onClick={() => chooseReaction(item.key)} className={`series-reaction ${selected ? 'is-selected' : ''}`} aria-pressed={selected} aria-label={`${item.label}${selected ? ' (You)' : ''}: ${item.count ?? 0}`} disabled={reactionBusy} data-testid={`button-reaction-${item.key}`}>
                <span className={`series-reaction-icon reaction-${item.key}`}><img src={item.icon} alt="" aria-hidden="true" draggable={false} /></span>
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

        {seriesPageVisibility.similarSeries && <aside className="series-sidebar" style={fixedRailPositions?.right}>
          <div className="series-sidebar-head"><h2>Similar series</h2></div>
          <div className="series-related-list">{related.map((item) => <Link href={item.href} className="series-related" key={item.href} data-testid={`link-related-${item.href.split('/').pop()}`} data-recommendation-item="true">
            <span className="series-related-cover"><img src={imageUrl(item.cover, 120)} alt={item.title} width={56} height={75} loading="lazy" /></span>
            <span className="series-related-copy">
              <strong>{item.title}</strong>
              <small className="series-related-meta">
                <span className="series-related-rating"><span className="series-related-star" aria-hidden="true">★</span>{item.rating ?? '—'}</span>
                <span>{item.chapterCount} ch</span>
              </small>
            </span>
          </Link>)}</div>
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
