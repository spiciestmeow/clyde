import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  Clock,
  RotateCcw,
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
}

const TABS: BookmarkTabDef[] = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Currently Reading', icon: BookOpen },
  { id: 'to-read', label: 'To-Read List', icon: Clock },
  { id: 'finished', label: 'Finished Reading', icon: CheckCircle2 },
  { id: 'abandoned', label: 'Abandoned Reads', icon: XCircle },
  { id: 'continue', label: 'Continue Reading', icon: RotateCcw },
];

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

  // Fetch series details from DB for all saved slugs
  const { data: allSeries = [], isLoading } = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'bookmarks-page', allSavedSlugs],
    queryFn: () => getSeriesBySlugs(allSavedSlugs),
    enabled: allSavedSlugs.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  // Map series by slug for quick lookup
  const seriesBySlug = useMemo(() => {
    const map = new Map<string, SeriesRecord>();
    allSeries.forEach((s) => map.set(s.slug, s));
    return map;
  }, [allSeries]);

  // Determine which series belong to which tab
  const continueSlugs = useMemo(() => {
    const savedSet = new Set(allSavedSlugs);
    return recentlyViewed.filter((item) => savedSet.has(item.slug)).map((item) => item.slug);
  }, [allSavedSlugs, recentlyViewed]);

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

  // Filter series based on active tab
  const visibleSeries = useMemo(() => {
    if (activeTab === 'all') {
      return allSavedSlugs.map((slug) => seriesBySlug.get(slug)).filter((s): s is SeriesRecord => Boolean(s));
    }
    if (activeTab === 'continue') {
      return continueSlugs.map((slug) => seriesBySlug.get(slug)).filter((s): s is SeriesRecord => Boolean(s));
    }
    return allSavedSlugs
      .filter((slug) => {
        const type = bookmarkTypes[slug] || 'reading';
        return type === activeTab;
      })
      .map((slug) => seriesBySlug.get(slug))
      .filter((s): s is SeriesRecord => Boolean(s));
  }, [activeTab, allSavedSlugs, continueSlugs, bookmarkTypes, seriesBySlug]);

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
            <p>{allSavedSlugs.length} {allSavedSlugs.length === 1 ? 'series' : 'series'} saved</p>
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
                <span className="bookmarks-tab-badge">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Series cards grid or loading / empty state */}
        {isLoading && allSavedSlugs.length > 0 ? (
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
