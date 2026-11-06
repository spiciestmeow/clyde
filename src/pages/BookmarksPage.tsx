import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Clock,
  Clock3,
  History,
  Play,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SiteSearch from '../components/SiteSearch';
import { LatestReleaseCard } from '../components/LatestReleaseCard';
import { LatestReleasesSkeleton } from '../components/HomeSectionSkeletons';
import {
  DEFAULT_SERIES_COVER,
  getSeriesBySlugs,
  getSiteSearchHighlights,
  searchSiteCatalog,
  SERIES_CATALOG_QUERY_KEY,
  type SeriesRecord,
} from '../lib/seriesCatalog';
import { readRecentlyViewedSeries } from '../lib/recentlyViewedSeries';
import { useThemeMode } from '../hooks/useThemeMode';
import assetReferences from '../../clone-data/asset-references.json';
import type { BookmarkType } from './SeriesDetailPage';
import './latest-updates.css';
import './bookmarks-page.css';

type TabKey = 'all' | 'reading' | 'to-read' | 'finished' | 'abandoned' | 'continue';

interface BookmarkTabDef {
  id: TabKey;
  label: string;
  icon?: LucideIcon;
  hideBadge?: boolean;
}

const TABS: BookmarkTabDef[] = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Currently Reading', icon: BookOpen },
  { id: 'to-read', label: 'To-Read List', icon: Clock },
  { id: 'finished', label: 'Finished Reading', icon: CheckCircle2 },
  { id: 'abandoned', label: 'Abandoned Reads', icon: XCircle },
  { id: 'continue', label: 'Recent Viewed', icon: History, hideBadge: true },
];

function formatViewedTime(timestamp: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

function readRawBookmarks(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('vortex-series-bookmarks');
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function readBookmarkTypesMap(): Record<string, BookmarkType> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('vortex-bookmark-types');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function coverUrl(source?: string | null, width = 400) {
  if (!source?.trim()) return DEFAULT_SERIES_COVER;
  if (source.startsWith('https://i0.wp.com/') || source.startsWith('https://storage.vortexscans.org/')) {
    try {
      const url = new URL(source);
      url.searchParams.set('w', String(width));
      return url.toString();
    } catch {
      return source;
    }
  }
  return source;
}

export default function BookmarksPage() {
  const { dark, toggleTheme } = useThemeMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [bookmarks, setBookmarks] = useState<string[]>(readRawBookmarks);
  const [bookmarkTypes, setBookmarkTypes] = useState<Record<string, BookmarkType>>(readBookmarkTypesMap);
  const [recentlyViewed, setRecentlyViewed] = useState(() => readRecentlyViewedSeries());

  // Search setup for site header
  const highlightsQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'bookmarks-search-highlights'],
    queryFn: () => getSiteSearchHighlights(4),
    staleTime: 5 * 60 * 1000,
  });

  const searchSeries = useCallback(async (query: string) => {
    return searchSiteCatalog(query, 4);
  }, []);

  // Listen for bookmark updates from other tabs or series detail page
  useEffect(() => {
    const sync = () => {
      setBookmarks(readRawBookmarks());
      setBookmarkTypes(readBookmarkTypesMap());
      setRecentlyViewed(readRecentlyViewedSeries());
    };
    window.addEventListener('vortex-bookmarks-change', sync);
    window.addEventListener('vortex-recently-viewed-series-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('vortex-bookmarks-change', sync);
      window.removeEventListener('vortex-recently-viewed-series-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Normalize bookmarks to unique slugs
  const allSavedSlugs = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((item) => {
      if (!item) return;
      const slug = item.replace(/^\/series\//, '').replace(/\/$/, '').trim();
      if (slug) set.add(slug);
    });
    return Array.from(set);
  }, [bookmarks]);

  // All recently viewed series slugs in order of most recently visited
  const continueSlugs = useMemo(() => {
    return recentlyViewed.map((item) => item.slug).filter(Boolean);
  }, [recentlyViewed]);

  // All slugs we need to fetch from the DB (bookmarks + recently viewed)
  const allRequiredSlugs = useMemo(() => {
    return Array.from(new Set([...allSavedSlugs, ...continueSlugs]));
  }, [allSavedSlugs, continueSlugs]);

  // Fetch series details from DB for all required slugs
  const { data: allSeries = [], isLoading } = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'bookmarks-page', allRequiredSlugs],
    queryFn: () => getSeriesBySlugs(allRequiredSlugs),
    enabled: allRequiredSlugs.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  // Map series by slug for quick lookup
  const seriesBySlug = useMemo(() => {
    const map = new Map<string, SeriesRecord>();
    allSeries.forEach((s) => map.set(s.slug, s));
    return map;
  }, [allSeries]);

  const tabCounts = useMemo(() => {
    let readingCount = 0;
    let toReadCount = 0;
    let finishedCount = 0;
    let abandonedCount = 0;

    allSavedSlugs.forEach((slug) => {
      const type = bookmarkTypes[slug] || 'reading';
      if (type === 'reading') readingCount++;
      else if (type === 'to-read') toReadCount++;
      else if (type === 'finished') finishedCount++;
      else if (type === 'abandoned') abandonedCount++;
    });

    return {
      all: allSavedSlugs.length,
      reading: readingCount,
      'to-read': toReadCount,
      finished: finishedCount,
      abandoned: abandonedCount,
      continue: continueSlugs.length,
    };
  }, [allSavedSlugs, bookmarkTypes, continueSlugs]);

  // Filter series based on active tab for regular cards
  const visibleSeries = useMemo(() => {
    if (activeTab === 'all') {
      return allSavedSlugs.map((slug) => seriesBySlug.get(slug)).filter((s): s is SeriesRecord => Boolean(s));
    }
    return allSavedSlugs
      .filter((slug) => {
        const type = bookmarkTypes[slug] || 'reading';
        return type === activeTab;
      })
      .map((slug) => seriesBySlug.get(slug))
      .filter((s): s is SeriesRecord => Boolean(s));
  }, [activeTab, allSavedSlugs, bookmarkTypes, seriesBySlug]);

  // Prepare Recent Viewed poster cards
  const recentViewedCards = useMemo(() => {
    return recentlyViewed.flatMap((recent) => {
      const series = seriesBySlug.get(recent.slug);
      if (!series) return [];
      const latestChapter = series.chapters[0]?.title || (series.facts?.latest_chapter_number ? `Chapter ${series.facts.latest_chapter_number}` : 'Chapter 1');
      return [{
        slug: series.slug,
        title: series.title,
        href: series.href || `/series/${series.slug}`,
        coverSrc: coverUrl(series.cover, 400),
        chapter: latestChapter,
        viewedAt: recent.viewedAt,
      }];
    });
  }, [recentlyViewed, seriesBySlug]);

  return (
    <div className={`vortex-page bookmarks-route latest-updates-route ${dark ? 'theme-dark' : 'theme-light'}`}>
      <SiteHeader
        activeSection="home"
        logoSrc="/clydee-logo.png"
        discordSrc={assetReferences[5]?.src ?? ''}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        dark={dark}
        onToggleTheme={toggleTheme}
        search={
          <SiteSearch
            items={highlightsQuery.data ?? []}
            trendingItems={highlightsQuery.data ?? []}
            searchFn={searchSeries}
          />
        }
      />

      <main className="bookmarks-main">
        {/* Header matching image */}
        <div className="bookmarks-header">
          <div className="bookmarks-header-icon" aria-hidden="true">
            <Bookmark size={24} fill="currentColor" />
          </div>
          <div className="bookmarks-header-text">
            <h1>Bookmarks</h1>
            <p>
              {activeTab === 'continue'
                ? `${continueSlugs.length} recently viewed ${continueSlugs.length === 1 ? 'series' : 'series'}`
                : `${allSavedSlugs.length} ${allSavedSlugs.length === 1 ? 'series' : 'series'} saved`}
            </p>
          </div>
        </div>

        {/* Tab pills matching image */}
        <div className="bookmarks-tabs" role="tablist" aria-label="Bookmark categories">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = tabCounts[tab.id];
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`bookmarks-tab-btn${isActive ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {Icon && (
                  <span className="bookmarks-tab-icon" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                )}
                <span>{tab.label}</span>
                {!tab.hideBadge && <span className="bookmarks-tab-badge">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Divider below the tabs matching user request */}
        <hr className="bookmarks-tabs-divider" aria-hidden="true" />

        {/* Content based on selected tab */}
        {activeTab === 'continue' ? (
          <section className="bookmarks-recent-section" aria-labelledby="recent-viewed-heading">
            {/* Replicated Title Header with Subtitle */}
            <div className="bookmarks-recent-header">
              <div className="bookmarks-recent-header__left">
                <History className="bookmarks-recent-header__icon" aria-hidden="true" />
                <div>
                  <h2 id="recent-viewed-heading">Recent Viewed</h2>
                  <p>Pick up with the latest synced chapter</p>
                </div>
              </div>
              <Link href="/series" className="bookmarks-view-all-pill">
                View All <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {isLoading && continueSlugs.length > 0 ? (
              <div className="bookmarks-recent-grid">
                <LatestReleasesSkeleton count={Math.min(6, continueSlugs.length || 3)} />
              </div>
            ) : recentViewedCards.length > 0 ? (
              <div className="bookmarks-recent-grid">
                {recentViewedCards.map((item) => (
                  <Link
                    key={item.slug}
                    href={item.href}
                    className="continue-card"
                  >
                    <span className="continue-card__cover-shell">
                      <span className="continue-card__cover">
                        <img src={item.coverSrc} alt={`Cover of ${item.title}`} loading="lazy" />
                        <span className="continue-card__hover-action" aria-hidden="true">
                          <span><Play fill="currentColor" /></span>
                        </span>
                        <span className="continue-card__cover-progress">
                          <span>{item.chapter}</span>
                        </span>
                      </span>
                    </span>
                    <span className="continue-card__title">{item.title}</span>
                    <span className="continue-card__activity">
                      <span className="continue-card__last-read">
                        <Clock3 size={12} aria-hidden="true" />
                        {formatViewedTime(item.viewedAt)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="bookmarks-empty">
                <div className="bookmarks-empty-icon" aria-hidden="true">
                  <History size={28} />
                </div>
                <h3>No recently viewed series</h3>
                <p>Read any series and it will automatically appear here so you can easily continue reading.</p>
                <Link className="bookmarks-browse-btn" href="/series">
                  Browse Series
                </Link>
              </div>
            )}
          </section>
        ) : (
          /* Regular category cards */
          isLoading && allSavedSlugs.length > 0 ? (
            <div className="bookmarks-grid release-variant-series">
              <LatestReleasesSkeleton count={Math.min(6, allSavedSlugs.length || 3)} />
            </div>
          ) : visibleSeries.length > 0 ? (
            <div className="bookmarks-grid latest-updates-grid release-variant-series">
              {visibleSeries.map((release) => (
                <LatestReleaseCard
                  key={release.slug}
                  release={release}
                  imageSrc={coverUrl(release.cover, 400)}
                  variant="series"
                />
              ))}
            </div>
          ) : (
            <div className="bookmarks-empty">
              <div className="bookmarks-empty-icon" aria-hidden="true">
                <Bookmark size={28} />
              </div>
              <h3>
                {activeTab === 'all'
                  ? 'No bookmarks yet'
                  : `No series in "${TABS.find((t) => t.id === activeTab)?.label}"`}
              </h3>
              <p>
                {activeTab === 'all'
                  ? 'Explore our catalogue and bookmark titles you want to track!'
                  : 'Choose this status when bookmarking series on their details page to organize your reading list.'}
              </p>
              <Link className="bookmarks-browse-btn" href="/series">
                Browse Series
              </Link>
            </div>
          )
        )}
      </main>

      <SiteFooter
        className="footer latest-updates-footer"
        logoSrc="/clydee-logo.png"
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Clydee, your ultimate library."
      />
    </div>
  );
}
